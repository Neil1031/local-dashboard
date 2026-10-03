package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TwReportsAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    static final String DAILY_ID = "tw-daily:2026-09-25:" + "1".repeat(32), WEEKLY_ID = "tw-weekly:2026-09-25:" + "3".repeat(32);
    ObjectNode fixture(String name) throws Exception { return (ObjectNode)json.readTree(getClass().getResourceAsStream("/fixtures/tw-reports-" + name + ".json")); }
    TwReportsProjection.Query query(ObjectNode source) {
        var q = source.path("query"); return q.path("operation").asText().equals("DETAIL") ? TwReportsProjection.Query.detail(q.path("reportId").asText()) : TwReportsProjection.Query.list(q.path("reportType").asText().toLowerCase(Locale.ROOT), q.path("limit").asInt(), q.path("offset").asInt());
    }
    ObjectNode normalize(ObjectNode source) { return TwReportsProjection.normalize(source, query(source), Set.of("READY", "EMPTY").contains(source.path("dataState").asText()) ? 0 : 2, json); }
    TaiwanProperties config(int timeout) throws Exception {
        Path python = temp.resolve("python.exe"), stocks = temp.resolve("export_tw_readonly.py"), reports = temp.resolve("export_tw_reports.py");
        if (!Files.exists(python)) Files.copy(Path.of(System.getProperty("java.home"), "bin", "java.exe"), python);
        Files.writeString(stocks, "Synthetic identity"); Files.writeString(reports, "Synthetic identity");
        return new TaiwanProperties(true, python.toString(), stocks.toString(), temp.resolve("absent db").toString(), temp.resolve("absent output").toString(), timeout, reports.toString());
    }
    TaiwanReportsAdapter child(TaiwanProperties p, TaiwanStocksAdapter gate, String mode, Path file, List<Process> children, List<List<String>> commands) {
        return new TaiwanReportsAdapter(p, gate, json) { @Override Process start(List<String> argv) throws java.io.IOException {
            commands.add(argv); var process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"), TwReportsProcessFixture.class.getName(), mode, file.toString()).start(); children.add(process); return process;
        }};
    }
    @Test void actualSourceSyntheticFixturesDailyWeeklyAndUnknownFacts() throws Exception {
        for (String name : List.of("daily-list", "daily-detail", "weekly-list", "weekly-detail", "warming-detail", "pending-detail")) {
            var source = fixture(name); var result = normalize(source); assertThat(result.path("dataState")).isEqualTo(source.path("dataState")); assertThat(result.path("source").asText()).isEqualTo("taiwan-reports");
            assertThat(result.toString()).doesNotContain("SECRET", "BUY_SIMULATION", "entry_price", "return_1d", "forward_return");
        }
        var daily = normalize(fixture("daily-detail")).path("report"); assertThat(daily.path("status").asText()).isEqualTo("PARTIAL");
        var candidate = daily.path("facts").path("candidates").get(0); assertThat(candidate.path("analysisEligible").isNull()).isTrue(); assertThat(candidate.path("sourceAnomalyScore").asDouble()).isEqualTo(72);
        var warming = normalize(fixture("warming-detail")).path("report"); assertThat(warming.path("candidateCount").asInt()).isZero(); assertThat(warming.path("classificationStatus").asText()).isEqualTo("WARMING_UP"); assertThat(warming.path("facts").path("readiness").path("warmingSymbols").isNull()).isTrue();
        var weekly = normalize(fixture("pending-detail")).path("report"); assertThat(weekly.path("status").asText()).isEqualTo("FAILED"); assertThat(weekly.path("pendingRevalidationCount").asInt()).isEqualTo(164); assertThat(weekly.path("facts").path("pendingRevalidation")).hasSize(100); assertThat(weekly.path("facts").path("dailyBinding").asText()).isEqualTo("INDEPENDENT");
    }
    @Test void readyEnvelopeMayContainFailedWeeklyBusinessAndUnknownNullMetrics() throws Exception {
        var weekly = fixture("weekly-detail"); weekly.put("dataState", "READY").putArray("warnings"); weekly.withObject("report").withObject("facts").withArray("problems").get(0); // Stored FAILED is independent of transport.
        assertThat(normalize(weekly).path("report").path("status").asText()).isEqualTo("FAILED");
        var daily = fixture("daily-detail"); daily.put("dataState", "PARTIAL").withArray("warnings").add("SAVED_FACT_UNKNOWN"); var c = (ObjectNode)daily.path("report").path("facts").path("candidates").get(0); c.putNull("sourceAnomalyScore").put("classification", "UNKNOWN");
        var projected = normalize(daily).path("report").path("facts").path("candidates").get(0); assertThat(projected.path("sourceAnomalyScore").isNull()).isTrue(); assertThat(projected.path("classification").asText()).isEqualTo("UNKNOWN");
    }
    @Test void emptyPartialEmptyAndUnavailableErrorExit2PreserveStates() throws Exception {
        for (String state : List.of("EMPTY", "PARTIAL", "UNAVAILABLE", "ERROR")) {
            var s = fixture("daily-list"); s.put("dataState", state); var warnings = s.putArray("warnings"); if (!state.equals("EMPTY")) warnings.add("SOURCE_UNAVAILABLE");
            if (Set.of("EMPTY", "PARTIAL").contains(state)) { s.withObject("page").putArray("items"); s.withObject("page").put("hasMore", false); } else s.putNull("page");
            var r = normalize(s); assertThat(r.path("dataState").asText()).isEqualTo(state); assertThat(r.path("items")).isEmpty();
        }
        var s = fixture("daily-list"); s.put("dataState", "ERROR").putNull("query").putNull("page").putArray("warnings").add("INPUT_INVALID");
        assertThat(TwReportsProjection.normalize(s, TwReportsProjection.Query.list("daily", 20, 0), 2, json).path("dataState").asText()).isEqualTo("ERROR");
    }
    @Test void stateExitJsonTypesIdentitiesAndPageContradictionsFailClosed() throws Exception {
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(s -> s.put("source", "other"), s -> s.put("generatedAt", "0000-01-01T00:00:00Z"), s -> s.put("dataState", "STALE"), s -> s.withArray("warnings").add("C:\\private\\warning"), s -> s.withObject("query").put("offset", 1), s -> s.withObject("page").put("limit", 101), s -> s.withObject("page").put("total", 1), s -> ((ObjectNode)s.path("page").path("items").get(0)).put("reportId", WEEKLY_ID), s -> s.withObject("page").withArray("items").add(s.path("page").path("items").get(0).deepCopy()))) {
            var s = fixture("daily-list"); var q = query(s); mutation.accept(s); assertThatThrownBy(() -> TwReportsProjection.normalize(s, q, 0, json)).isInstanceOf(RuntimeException.class);
        }
        for (String name : List.of("daily-list", "weekly-detail")) { var s = fixture(name); assertThatThrownBy(() -> TwReportsProjection.normalize(s, query(s), name.equals("daily-list") ? 2 : 0, json)).isInstanceOf(RuntimeException.class); }
        for (String id : List.of("", "tw-daily:2026-02-29:" + "1".repeat(32), "tw-weekly:2026-09-24:" + "1".repeat(32), DAILY_ID.toUpperCase(Locale.ROOT), DAILY_ID + " ", "tw-daily:0000-01-01:" + "1".repeat(32), "--help")) assertThatThrownBy(() -> TwReportsProjection.Query.detail(id)).isInstanceOf(RuntimeException.class);
    }
    @Test void consumedFieldsAndBoundsRejectMalformedNestedPayloads() throws Exception {
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(s -> s.withObject("report").withObject("facts").withObject("readiness").put("warmingSymbols", 0.5), s -> s.withObject("report").withObject("facts").withObject("mappingDiagnostics").putArray("unmapped_symbols").add("../private"), s -> ((ObjectNode)s.path("report").path("facts").path("candidates").get(0)).put("analysisEligible", false), s -> ((ObjectNode)s.path("report").path("facts").path("candidates").get(0)).put("signalDate", "2026-09-24"), s -> s.withObject("report").withObject("facts").withArray("sources").add(s.path("report").path("facts").path("sources").get(0).deepCopy()), s -> s.withObject("report").put("bodyTruncated", true), s -> s.withObject("report").put("markdown", "中".repeat(65536)))) {
            var s = fixture("daily-detail"); mutation.accept(s); assertThatThrownBy(() -> normalize(s)).isInstanceOf(RuntimeException.class);
        }
        var s = fixture("daily-detail"); var candidates = s.withObject("report").withObject("facts").withArray("candidates"); while (candidates.size() <= 100) candidates.add(candidates.get(0).deepCopy()); assertThatThrownBy(() -> normalize(s)).isInstanceOf(RuntimeException.class);
    }
    @Test void candidateCountsIncludingNullAndTruncationFlagsMustAgree() throws Exception {
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(s -> s.withObject("report").putNull("candidateCount"), s -> s.withObject("report").withObject("facts").withObject("candidateSummary").putNull("savedCandidateCount"), s -> s.withObject("report").withObject("facts").withObject("candidateSummary").put("savedTotalCandidatesBeforeLimit", 2), s -> s.withObject("report").withObject("facts").withObject("candidateSummary").put("exportTruncated", true))) {
            var s = fixture("daily-detail"); mutation.accept(s); assertThatThrownBy(() -> normalize(s)).isInstanceOf(RuntimeException.class);
        }
        var s = fixture("daily-detail"); s.put("dataState", "PARTIAL").withArray("warnings").add("SAVED_FACT_UNKNOWN"); s.withObject("report").putNull("candidateCount"); s.withObject("report").withObject("facts").withObject("candidateSummary").putNull("savedCandidateCount").putNull("savedTotalCandidatesBeforeLimit").putNull("savedTruncated");
        assertThat(normalize(s).path("report").path("candidateCount").isNull()).isTrue();
        var unknown = fixture("daily-detail"); unknown.put("dataState", "PARTIAL").withArray("warnings").add("SAVED_FACT_UNKNOWN"); unknown.withObject("report").withObject("facts").withObject("candidateSummary").putNull("savedTruncated");
        assertThat(normalize(unknown).path("report").path("facts").path("candidateSummary").path("savedTruncated").isNull()).isTrue();
    }
    @Test void weeklyTruncationAndBindingsCannotHideResponsibility() throws Exception {
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(s -> s.put("dataState", "READY").putArray("warnings"), s -> s.withObject("report").withObject("facts").withArray("pendingRevalidation").remove(0), s -> s.withObject("report").put("pendingRevalidationCount", 99), s -> s.withObject("report").putNull("pendingRevalidationCount"), s -> s.withObject("report").put("status", "SUCCESS"), s -> ((ObjectNode)s.path("report").path("facts").path("days").get(0)).putNull("accumulationRunId"), s -> s.withObject("report").withObject("facts").put("pointerState", "CORROBORATED"))) {
            var s = fixture("pending-detail"); mutation.accept(s); assertThatThrownBy(() -> normalize(s)).isInstanceOf(RuntimeException.class);
        }
        var s = fixture("weekly-detail"); s.withObject("report").putNull("pendingRevalidationCount"); s.withObject("report").withObject("facts").putNull("pendingRevalidation"); assertThat(normalize(s).path("report").path("pendingRevalidationCount").isNull()).isTrue();
    }
    @Test void allowlistNeverLeaksPrivateExtraFieldsAndMarkdownPathsFailSafely() throws Exception {
        var s = fixture("daily-detail"); s.put("databasePath", "C:\\SECRET\\db"); s.withObject("report").put("raw_response", "SECRET"); ((ObjectNode)s.path("report").path("facts").path("candidates").get(0)).put("BUY", "SECRET"); assertThat(normalize(s).toString()).doesNotContain("SECRET", "databasePath", "raw_response");
        for (String path : List.of("C:\\private\\report", "c:/private/report", "\\\\host\\private", "FILE:///private/report", "/mnt/private/report", "/opt/private/report", "/HOME/private/report", "/custom-root/private/report")) {
            var bad = fixture("daily-detail"); bad.withObject("report").put("markdown", "# Body\n" + path); assertThatThrownBy(() -> normalize(bad)).as(path).isInstanceOf(RuntimeException.class);
        }
        s.withObject("report").put("markdown", "# Market / readiness\n## Candidates / watchlist\n<script>unsafe()</script>\n[link](https://example.test)\n![image](https://example.test/x)"); assertThat(normalize(s).path("report").path("markdown").asText()).contains("Market / readiness");
    }
    @Test void argvUsesExplicitReportsPathAndPySelectorWithoutTouchingStage2() throws Exception {
        var p = config(10); var a = new TaiwanReportsAdapter(p, new TaiwanStocksAdapter(p, json), json);
        assertThat(a.command(TwReportsProjection.Query.list("daily", 1, 0))).containsExactly(p.pythonPath(), "-B", p.reportsCliPath(), "--db", p.databasePath(), "--output-dir", p.outputDir(), "list", "--type", "daily", "--limit", "1", "--offset", "0");
        assertThat(a.command(TwReportsProjection.Query.list("weekly", 100, 10000))).contains("weekly", "100", "10000").doesNotContain(p.cliPath());
        assertThat(a.command(TwReportsProjection.Query.detail(WEEKLY_ID))).endsWith("get", "--report-id", WEEKLY_ID);
        var py = new TaiwanProperties(false, temp.resolve("py.exe").toString(), "stocks", "db", "output", 10, "reports"); assertThat(new TaiwanReportsAdapter(py, new TaiwanStocksAdapter(py, json), json).command(TwReportsProjection.Query.detail(DAILY_ID))).startsWith(py.pythonPath(), "-3.11", "-B", "reports");
    }
    @Test void disabledMissingExplicitConfigInvalidPathsAndTimeoutNeverStart() throws Exception {
        var p = config(10);
        for (var bad : List.of(new TaiwanProperties(false, p.pythonPath(), p.cliPath(), p.databasePath(), p.outputDir(), 10, p.reportsCliPath()), new TaiwanProperties(true, p.pythonPath(), p.cliPath(), p.databasePath(), p.outputDir(), 10, ""), new TaiwanProperties(true, p.pythonPath(), p.cliPath(), p.databasePath(), p.outputDir(), 31, p.reportsCliPath()), new TaiwanProperties(true, "cmd.exe", p.cliPath(), p.databasePath(), p.outputDir(), 10, p.reportsCliPath()), new TaiwanProperties(true, p.pythonPath(), p.cliPath(), "relative.db", p.outputDir(), 10, p.reportsCliPath()), new TaiwanProperties(true, p.pythonPath(), p.cliPath(), p.databasePath(), p.outputDir(), 10, p.cliPath()))) {
            var a = new TaiwanReportsAdapter(bad, new TaiwanStocksAdapter(bad, json), json) { @Override Process start(List<String> args) { throw new AssertionError("Must not start"); }}; assertThat(a.list("daily", 20, 0).path("dataState").asText()).isEqualTo("UNAVAILABLE");
        }
    }
    @Test void actualChildrenValidateUtf8JsonExitStatesBoundsTimeoutAndCleanUp() throws Exception {
        var p = config(1); Path file = temp.resolve("fixture.json");
        for (String mode : List.of("ok", "exit2", "ceiling", "utf8", "duplicate", "trailing", "invalid", "stdout", "stderr", "exit", "timeout")) {
            var s = fixture(mode.equals("exit2") ? "weekly-detail" : "daily-list"); Files.writeString(file, s.toString()); var children = new ArrayList<Process>(); var commands = new ArrayList<List<String>>(); var a = child(p, new TaiwanStocksAdapter(p, json), mode, file, children, commands);
            var r = mode.equals("exit2") ? a.detail(WEEKLY_ID) : a.list("daily", 20, 0);
            assertThat(r.path("dataState").asText()).as(mode).isEqualTo(Set.of("ok", "ceiling").contains(mode) ? "READY" : mode.equals("exit2") ? "PARTIAL" : Set.of("exit", "timeout").contains(mode) ? "UNAVAILABLE" : "ERROR"); assertThat(r.toString()).doesNotContain("secret", "private", temp.toString()); assertThat(commands).hasSize(1);
            for (var process : children) { process.waitFor(3, TimeUnit.SECONDS); assertThat(process.isAlive()).isFalse(); }
        }
        for (String state : List.of("UNAVAILABLE", "ERROR")) { var s = fixture("daily-list"); s.put("dataState", state).putNull("page").withArray("warnings").add("SOURCE_UNAVAILABLE"); Files.writeString(file, s.toString()); assertThat(child(p, new TaiwanStocksAdapter(p, json), "exit2", file, new ArrayList<>(), new ArrayList<>()).list("daily", 20, 0).path("dataState").asText()).isEqualTo(state); }
    }
    @Test void stockAndReportActualChildrenShareExactlyTwoSlots() throws Exception {
        var p = config(2); var entered = new CountDownLatch(2); var children = new CopyOnWriteArrayList<Process>(); var commands = new CopyOnWriteArrayList<List<String>>(); Path file = temp.resolve("unused.json");
        var stocks = new TaiwanStocksAdapter(p, json) { @Override Process start(List<String> argv) throws java.io.IOException {
            var process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"), TwReportsProcessFixture.class.getName(), "timeout", file.toString()).start(); children.add(process); entered.countDown(); return process;
        }};
        var reports = new TaiwanReportsAdapter(p, stocks, json) { @Override Process start(List<String> argv) throws java.io.IOException {
            var process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"), TwReportsProcessFixture.class.getName(), "timeout", file.toString()).start(); children.add(process); commands.add(argv); entered.countDown(); return process;
        }};
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = pool.submit(() -> stocks.read(null)); var two = pool.submit(() -> reports.list("weekly", 1, 0)); assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(stocks.read(null).path("warnings").toString()).contains("SOURCE_BUSY"); assertThat(reports.detail(DAILY_ID).path("warnings").toString()).contains("SOURCE_BUSY"); assertThat(children).hasSize(2);
            one.get(5, TimeUnit.SECONDS); two.get(5, TimeUnit.SECONDS); assertThat(stocks.acquireSlot()).isTrue(); stocks.releaseSlot();
        }
        for (var process : children) assertThat(process.isAlive()).isFalse();
    }
    @Test void interruptedReadRestoresFlagAndReleasesGate() throws Exception {
        var p = config(2); var gate = new TaiwanStocksAdapter(p, json); var latch = new CountDownLatch(1); var children = new CopyOnWriteArrayList<Process>();
        var reports = new TaiwanReportsAdapter(p, gate, json) { @Override Process start(List<String> argv) throws java.io.IOException { var process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"), TwReportsProcessFixture.class.getName(), "timeout").start(); children.add(process); latch.countDown(); return process; }};
        var result = new java.util.concurrent.atomic.AtomicReference<ObjectNode>(); var interrupted = new java.util.concurrent.atomic.AtomicBoolean(); var thread = Thread.ofPlatform().start(() -> { result.set(reports.list("daily", 1, 0)); interrupted.set(Thread.currentThread().isInterrupted()); });
        assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue(); thread.interrupt(); thread.join(3000); assertThat(thread.isAlive()).isFalse(); assertThat(interrupted).isTrue(); assertThat(result.get().path("warnings").toString()).contains("SOURCE_INTERRUPTED"); assertThat(gate.acquireSlot()).isTrue(); gate.releaseSlot(); for (var process : children) assertThat(process.isAlive()).isFalse();
    }
    @Test void invalidBrowserQueriesRejectBeforeInvocationAndAllResponsesNoStore() throws Exception {
        var adapter = mock(TaiwanReportsAdapter.class); var mvc = MockMvcBuilders.standaloneSetup(new TwReportsController(adapter)).build();
        for (String path : List.of("/api/reports/tw", "/api/reports/tw?type=", "/api/reports/tw?type=DAILY", "/api/reports/tw?type=daily&type=daily", "/api/reports/tw?type=daily&limit=0", "/api/reports/tw?type=daily&offset=10001", "/api/reports/tw?type=daily&limit=", "/api/reports/tw?type=daily&db=private", "/api/reports/tw/detail", "/api/reports/tw/detail?reportId=bad", "/api/reports/tw/detail?reportId=" + DAILY_ID + "&offset=0", "/api/reports/tw/detail?reportId=" + DAILY_ID + "&reportId=" + DAILY_ID)) mvc.perform(get(path)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.code").value("INVALID_TW_REPORTS_QUERY"));
        verifyNoInteractions(adapter); when(adapter.list("daily", 20, 0)).thenReturn(normalize(fixture("daily-list"))); when(adapter.detail(DAILY_ID)).thenReturn(normalize(fixture("daily-detail")));
        mvc.perform(get("/api/reports/tw?type=daily")).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.reportType").value("DAILY")); mvc.perform(get("/api/reports/tw/detail").param("reportId", DAILY_ID)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
    }
}
