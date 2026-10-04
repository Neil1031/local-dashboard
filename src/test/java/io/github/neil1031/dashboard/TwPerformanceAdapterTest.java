package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TwPerformanceAdapterTest {
    private static final String START = "2026-10-01";
    private static final String END = "2026-10-31";
    private static final TwPerformanceProjection.Query QUERY =
            TwPerformanceProjection.Query.list(START, END, 20, 0);

    @TempDir Path temp;
    private final ObjectMapper json = new ObjectMapper();

    private ObjectNode fixture() throws IOException {
        try (var input = getClass().getResourceAsStream("/fixtures/tw-performance-list.json")) {
            return (ObjectNode) json.readTree(input);
        }
    }

    private ObjectNode item(ObjectNode source, int index) {
        return (ObjectNode) source.withArray("items").get(index);
    }

    private ObjectNode horizon(ObjectNode source, int itemIndex, int horizonIndex) {
        return (ObjectNode) item(source, itemIndex).withArray("horizons").get(horizonIndex);
    }

    private ObjectNode normalized(ObjectNode source) {
        int exit = Set.of("READY", "EMPTY").contains(source.path("dataState").asText()) ? 0 : 2;
        return TwPerformanceProjection.normalize(source, QUERY, exit, json);
    }

    private ObjectNode sourceState(String state) throws IOException {
        ObjectNode source = fixture();
        source.put("dataState", state);
        source.withArray("warnings").removeAll();
        switch (state) {
            case "READY" -> { }
            case "PARTIAL" -> source.withArray("warnings").add("OBSERVATION_PRICE_EVIDENCE_INCOMPLETE");
            case "EMPTY" -> {
                source.withArray("items").removeAll();
                source.withObject("page").put("returned", 0).put("hasMore", false).putNull("nextOffset");
            }
            case "UNAVAILABLE" -> {
                source.withArray("items").removeAll(); source.putNull("page");
                source.withArray("warnings").add("SOURCE_UNAVAILABLE");
            }
            case "ERROR" -> {
                source.withArray("items").removeAll(); source.putNull("page");
                source.withArray("warnings").add("SOURCE_INVALID");
            }
            default -> throw new IllegalArgumentException(state);
        }
        return source;
    }

    private TaiwanProperties config(int timeout) throws IOException {
        Path python = temp.resolve("python.exe");
        if (Files.notExists(python)) Files.copy(Path.of(System.getProperty("java.home"), "bin", "java.exe"), python);
        Path stocks = temp.resolve("export_tw_readonly.py");
        Path reports = temp.resolve("export_tw_reports.py");
        Path history = temp.resolve("export_tw_history.py");
        Path performance = temp.resolve("export_tw_observed_performance.py");
        for (Path path : List.of(stocks, reports, history, performance)) Files.writeString(path, "Synthetic fixture identity only");
        return new TaiwanProperties(true, python.toString(), stocks.toString(), temp.resolve("absent.db").toString(),
                temp.resolve("absent-output").toString(), timeout, reports.toString(), history.toString(), performance.toString());
    }

    private Path writeSource(ObjectNode source) throws IOException {
        Path path = temp.resolve("source.json");
        Files.writeString(path, source.toString());
        return path;
    }

    private Process process(String mode, Path source) throws IOException {
        return new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(),
                "-cp", System.getProperty("java.class.path"), TwPerformanceProcessFixture.class.getName(),
                mode, source.toString()).start();
    }

    private TaiwanPerformanceAdapter childAdapter(TaiwanProperties properties, TaiwanStocksAdapter gate,
            String mode, Path source, List<Process> children, List<List<String>> commands) {
        return new TaiwanPerformanceAdapter(properties, gate, json) {
            @Override Process start(List<String> argv) throws IOException {
                commands.add(List.copyOf(argv));
                Process process = process(mode, source);
                children.add(process);
                return process;
            }
        };
    }

    private void assertStopped(List<Process> children) throws InterruptedException {
        for (Process child : children) {
            child.waitFor(3, TimeUnit.SECONDS);
            assertThat(child.isAlive()).isFalse();
        }
    }

    @Test
    void acceptsInclusive366DayRangeAndRejects367DaysAndInvalidBounds() {
        assertThat(TwPerformanceProjection.Query.list("2024-01-01", "2024-12-31", 50, 10000)).isNotNull();
        assertThat(TwPerformanceProjection.Query.list(START, START, 1, 0)).isNotNull();
        for (String[] range : List.of(new String[] {"2024-01-01", "2025-01-01"},
                new String[] {END, START}, new String[] {"2026-02-29", "2026-03-01"},
                new String[] {null, END}, new String[] {"2026-10-1", END})) {
            assertThatThrownBy(() -> TwPerformanceProjection.Query.list(range[0], range[1], 20, 0))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        for (int limit : List.of(0, 51)) assertThatThrownBy(() -> TwPerformanceProjection.Query.list(START, END, limit, 0))
                .isInstanceOf(IllegalArgumentException.class);
        for (int offset : List.of(-1, 10001)) assertThatThrownBy(() -> TwPerformanceProjection.Query.list(START, END, 20, offset))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void controllerAllowsOnlyFourQueryParametersAndMarksEveryResponseNoStore() throws Exception {
        var adapter = mock(TaiwanPerformanceAdapter.class);
        var mvc = MockMvcBuilders.standaloneSetup(new TwPerformanceController(adapter)).build();
        String valid = "/api/tw/performance?startDate=" + START + "&endDate=" + END;
        for (String path : List.of("/api/tw/performance", valid + "&date=" + END,
                valid + "&startDate=" + START, valid + "&limit=", valid + "&offset=",
                valid + "&limit=0", valid + "&limit=51", valid + "&offset=10001",
                valid + "&offset=-1", valid + "&limit=020",
                "/api/tw/performance?startDate=2024-01-01&endDate=2025-01-01",
                "/api/tw/performance?startDate=2026-02-29&endDate=2026-03-01")) {
            mvc.perform(get(path)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
        }
        verifyNoInteractions(adapter);
        when(adapter.list(START, END, 20, 0)).thenReturn(normalized(fixture()));
        mvc.perform(get(valid)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items.length()").value(1));
        verify(adapter).list(START, END, 20, 0);
    }

    @Test
    void fixedArgvUsesConfiguredPerformanceCliAndPy311Selector() throws Exception {
        TaiwanProperties properties = config(10);
        var adapter = new TaiwanPerformanceAdapter(properties, new TaiwanStocksAdapter(properties, json), json);
        assertThat(adapter.command(QUERY)).containsExactly(properties.pythonPath(), "-B", properties.performanceCliPath(),
                "--db", properties.databasePath(), "list", "--start-date", START, "--end-date", END,
                "--limit", "20", "--offset", "0");
        var py = new TaiwanProperties(true, temp.resolve("py.exe").toString(), properties.cliPath(), properties.databasePath(),
                properties.outputDir(), 10, properties.reportsCliPath(), properties.historyCliPath(), properties.performanceCliPath());
        assertThat(new TaiwanPerformanceAdapter(py, new TaiwanStocksAdapter(py, json), json).command(QUERY))
                .startsWith(py.pythonPath(), "-3.11", "-B", py.performanceCliPath());
    }

    @Test
    void disabledOrUntrustedPerformanceConfigurationDoesNotStartAProcess() throws Exception {
        TaiwanProperties properties = config(10);
        for (TaiwanProperties invalid : List.of(
                new TaiwanProperties(false, properties.pythonPath(), properties.cliPath(), properties.databasePath(),
                        properties.outputDir(), 10, properties.reportsCliPath(), properties.historyCliPath(), properties.performanceCliPath()),
                new TaiwanProperties(true, properties.pythonPath(), properties.cliPath(), "relative.db", properties.outputDir(),
                        10, properties.reportsCliPath(), properties.historyCliPath(), properties.performanceCliPath()),
                new TaiwanProperties(true, properties.pythonPath(), properties.cliPath(), properties.databasePath(), properties.outputDir(),
                        10, properties.reportsCliPath(), properties.historyCliPath(), properties.historyCliPath()),
                new TaiwanProperties(true, "cmd.exe", properties.cliPath(), properties.databasePath(), properties.outputDir(),
                        10, properties.reportsCliPath(), properties.historyCliPath(), properties.performanceCliPath()))) {
            TaiwanStocksAdapter gate = new TaiwanStocksAdapter(invalid, json);
            var adapter = new TaiwanPerformanceAdapter(invalid, gate, json) {
                @Override Process start(List<String> argv) { throw new AssertionError("Untrusted configuration must not start"); }
            };
            assertThat(adapter.list(START, END, 20, 0).path("warnings").toString())
                    .containsAnyOf("SOURCE_DISABLED", "SOURCE_NOT_CONFIGURED");
        }
    }

    @Test
    void normalizesFiveSourceStatesUsingTheRequiredExitCodes() throws Exception {
        for (String state : List.of("READY", "PARTIAL", "EMPTY", "UNAVAILABLE", "ERROR")) {
            int exit = Set.of("READY", "EMPTY").contains(state) ? 0 : 2;
            assertThat(TwPerformanceProjection.normalize(sourceState(state), QUERY, exit, json).path("dataState").asText())
                    .as(state).isEqualTo(state);
        }
        assertThatThrownBy(() -> TwPerformanceProjection.normalize(sourceState("PARTIAL"), QUERY, 0, json))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> TwPerformanceProjection.normalize(sourceState("READY"), QUERY, 2, json))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsPrivateExtraMalformedVersionIdentitySemanticsAndPaginationFields() throws Exception {
        List<Consumer<ObjectNode>> invalid = List.of(
                source -> source.put("databasePath", "C:/private/db"),
                source -> item(source, 0).put("rawPayload", "secret"),
                source -> source.put("contractVersion", "tw-observed-performance-v2"),
                source -> item(source, 0).put("itemId", "tw-candidate:wrong"),
                source -> source.withObject("semantics").put("formula", "invented"),
                source -> source.withObject("page").put("returned", 2),
                source -> source.withObject("query").put("requestedStartDate", "2026-10-02"),
                source -> horizon(source, 0, 0).put("unexpected", true));
        for (Consumer<ObjectNode> mutate : invalid) {
            ObjectNode invalidSource = fixture(); mutate.accept(invalidSource);
            assertThatThrownBy(() -> normalized(invalidSource)).isInstanceOf(RuntimeException.class);
        }
        ObjectNode malformed = fixture(); malformed.withArray("items").removeAll(); malformed.putArray("items").add("not-an-object");
        assertThatThrownBy(() -> normalized(malformed)).isInstanceOf(RuntimeException.class);
    }

    @Test
    void preservesOrderedHorizonFactsIncludingZeroNegativeNullAndNotYetDue() throws Exception {
        ObjectNode source = fixture();
        horizon(source, 0, 1).put("close", 97.5).put("returnPercent", -2.5);
        horizon(source, 0, 2).putNull("close").putNull("returnPercent").put("state", "NOT_YET_DUE")
                .put("reasonCode", "SESSION_NOT_YET_DUE").putNull("provenance");
        horizon(source, 0, 3).putNull("expectedDate").putNull("close").putNull("returnPercent")
                .put("state", "CALENDAR_UNAVAILABLE").put("reasonCode", "CALENDAR_DATE_MISSING")
                .putNull("dueAt").putNull("provenance");

        ObjectNode result = normalized(source);
        var horizons = result.path("items").get(0).path("horizons");
        assertThat(horizons).hasSize(5);
        assertThat(List.of(horizons.get(0).path("sessionCount").asInt(), horizons.get(1).path("sessionCount").asInt(),
                horizons.get(2).path("sessionCount").asInt(), horizons.get(3).path("sessionCount").asInt(),
                horizons.get(4).path("sessionCount").asInt())).containsExactly(1, 3, 5, 10, 20);
        assertThat(horizons.get(0).path("returnPercent").doubleValue()).isZero();
        assertThat(horizons.get(1).path("returnPercent").doubleValue()).isEqualTo(-2.5);
        assertThat(horizons.get(2).path("state").asText()).isEqualTo("NOT_YET_DUE");
        assertThat(horizons.get(2).path("returnPercent").isNull()).isTrue();
        assertThat(horizons.get(3).path("state").asText()).isEqualTo("CALENDAR_UNAVAILABLE");
        assertThat(horizons.get(3).path("close").isNull()).isTrue();
    }

    @Test
    void retainsVisibleHorizonClosesWhenTheReferencePriceIsUnavailable() throws Exception {
        ObjectNode source = fixture();
        ObjectNode candidate = item(source, 0);
        candidate.putNull("referenceClose").putNull("referenceProvenance")
                .put("referenceState", "PRICE_UNAVAILABLE").put("referenceReasonCode", "REFERENCE_CLOSE_UNAVAILABLE");
        for (int index = 0; index < 5; index++) {
            ObjectNode h = horizon(source, 0, index);
            h.putNull("returnPercent").put("state", "PRICE_UNAVAILABLE").put("reasonCode", "OFFICIAL_PRICE_MISSING");
        }
        var horizons = normalized(source).path("items").get(0).path("horizons");
        for (int index = 0; index < 5; index++) {
            assertThat(horizons.get(index).path("close").doubleValue()).isEqualTo(100);
            assertThat(horizons.get(index).path("returnPercent").isNull()).isTrue();
        }
    }

    @Test
    void preservesInputOrderForDistinctRunsOnTheSameDay() throws Exception {
        ObjectNode source = fixture();
        ObjectNode second = item(source, 0).deepCopy();
        second.put("runId", "b".repeat(32)).put("itemId", "tw-candidate:2026-10-02:" + "b".repeat(32) + ":2330");
        source.withArray("items").add(second);
        source.withObject("page").put("returned", 2);
        var items = normalized(source).path("items");
        assertThat(items).hasSize(2);
        assertThat(items.get(0).path("runId").asText()).isEqualTo("a".repeat(32));
        assertThat(items.get(1).path("runId").asText()).isEqualTo("b".repeat(32));
        assertThat(items.get(0).path("targetDate").asText()).isEqualTo(items.get(1).path("targetDate").asText());
    }

    @Test
    void preservesPageBoundsFailureScopeAndSourceOwnedArithmetic() throws Exception {
        for (int offset : List.of(0, 9999, 10000)) {
            ObjectNode source = fixture(); source.put("dataState", "PARTIAL");
            source.withArray("warnings").add("OBSERVATION_PRICE_EVIDENCE_INCOMPLETE");
            source.withObject("query").put("limit",1).put("offset",offset);
            source.withObject("page").put("limit",1).put("offset",offset).put("hasMore",true);
            if (offset < 10000) source.withObject("page").put("nextOffset",offset+1);
            else { source.withObject("page").putNull("nextOffset"); source.withArray("warnings").add("PAGINATION_OFFSET_LIMIT"); }
            var q = TwPerformanceProjection.Query.list(START,END,1,offset);
            assertThat(TwPerformanceProjection.normalize(source,q,2,json).path("page")).isEqualTo(source.path("page"));
        }
        for (String code : List.of("INPUT_INVALID","RANGE_TOO_LARGE")) {
            ObjectNode source = sourceState("ERROR"); source.putNull("query").putNull("scope");
            source.withArray("warnings").removeAll().add(code);
            assertThat(normalized(source).path("query").path("operation").asText()).isEqualTo("LIST");
        }
        ObjectNode source = fixture();
        horizon(source,0,0).put("returnPercent",-15.25).put("expectedDate","2027-01-02").put("dueAt","2027-01-02T13:33:00+08:00");
        assertThat(normalized(source).path("items").get(0).path("horizons")).isEqualTo(item(source,0).path("horizons"));
        source = sourceState("UNAVAILABLE");
        assertThat(normalized(source).path("scope")).isEqualTo(source.path("scope"));
    }

    @Test
    void actualChildHandlesAllFiveStatesAndTransportLimits() throws Exception {
        TaiwanProperties properties = config(1);
        TaiwanStocksAdapter gate = new TaiwanStocksAdapter(properties, json);
        List<Process> children = new CopyOnWriteArrayList<>();
        List<List<String>> commands = new CopyOnWriteArrayList<>();
        Path sourcePath = temp.resolve("child-source.json");
        for (String state : List.of("READY", "PARTIAL", "EMPTY", "UNAVAILABLE", "ERROR")) {
            Files.writeString(sourcePath, sourceState(state).toString());
            String mode = Set.of("READY", "EMPTY").contains(state) ? "exit-zero" : "exit-two";
            ObjectNode result = childAdapter(properties, gate, mode, sourcePath, children, commands).list(START, END, 20, 0);
            assertThat(result.path("dataState").asText()).as(state).isEqualTo(state);
        }

        Files.writeString(sourcePath, fixture().toString());
        for (String mode : List.of("stdout-ceiling", "stderr-ceiling")) {
            ObjectNode result = childAdapter(properties, gate, mode, sourcePath, children, commands).list(START, END, 20, 0);
            assertThat(result.path("dataState").asText()).as(mode).isEqualTo("READY");
        }
        for (String mode : List.of("utf8", "duplicate", "trailing", "malformed", "stdout-overflow", "stderr-overflow")) {
            ObjectNode result = childAdapter(properties, gate, mode, sourcePath, children, commands).list(START, END, 20, 0);
            assertThat(result.path("dataState").asText()).as(mode).isEqualTo("ERROR");
            assertThat(result.toString()).doesNotContain("C:/private", "secret", temp.toString());
        }
        ObjectNode exitFailure = childAdapter(properties, gate, "exit-seven", sourcePath, children, commands).list(START, END, 20, 0);
        assertThat(exitFailure.path("dataState").asText()).isEqualTo("UNAVAILABLE");
        assertThat(exitFailure.path("warnings").toString()).contains("SOURCE_READ_FAILED");
        ObjectNode timeout = childAdapter(properties, gate, "timeout", sourcePath, children, commands).list(START, END, 20, 0);
        assertThat(timeout.path("dataState").asText()).isEqualTo("UNAVAILABLE");
        assertThat(timeout.path("warnings").toString()).contains("SOURCE_TIMEOUT");
        assertThat(commands).hasSize(15);
        assertStopped(children);
    }

    @Test
    void performanceHistoryReportsAndStocksShareTwoSlotsAndReleaseThem() throws Exception {
        TaiwanProperties properties = config(5);
        TaiwanStocksAdapter stocks = new TaiwanStocksAdapter(properties, json);
        Path source = writeSource(fixture());
        List<Process> children = new CopyOnWriteArrayList<>();
        CountDownLatch started = new CountDownLatch(2);
        TaiwanPerformanceAdapter performance = new TaiwanPerformanceAdapter(properties, stocks, json) {
            @Override Process start(List<String> argv) throws IOException { Process p = process("timeout", source); children.add(p); started.countDown(); return p; }
        };
        TaiwanHistoryAdapter history = new TaiwanHistoryAdapter(properties, stocks, json) {
            @Override Process start(List<String> argv) throws IOException { Process p = process("timeout", source); children.add(p); started.countDown(); return p; }
        };
        TaiwanReportsAdapter reports = new TaiwanReportsAdapter(properties, stocks, json) {
            @Override Process start(List<String> argv) throws IOException { Process p = process("timeout", source); children.add(p); started.countDown(); return p; }
        };
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var first = pool.submit(() -> performance.list(START, END, 20, 0));
            var second = pool.submit(() -> history.list("2026-10-01", "2026-10-31", 20, 0));
            assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
            assertThat(reports.list("daily", 20, 0).path("warnings").toString()).contains("SOURCE_BUSY");
            assertThat(performance.list(START, END, 20, 0).path("warnings").toString()).contains("SOURCE_BUSY");
            assertThat(stocks.read(null).path("warnings").toString()).contains("SOURCE_BUSY");
            assertThat(first.get(8, TimeUnit.SECONDS).path("warnings").toString()).contains("SOURCE_TIMEOUT");
            assertThat(second.get(8, TimeUnit.SECONDS).path("warnings").toString()).contains("SOURCE_TIMEOUT");
        }
        assertThat(stocks.acquireSlot()).isTrue();
        assertThat(stocks.acquireSlot()).isTrue();
        stocks.releaseSlot(); stocks.releaseSlot();
        assertStopped(children);
    }

    @Test
    void interruptedPerformanceReadRestoresInterruptAndReleasesItsSlot() throws Exception {
        TaiwanProperties properties = config(5);
        TaiwanStocksAdapter stocks = new TaiwanStocksAdapter(properties, json);
        Path source = writeSource(fixture());
        CountDownLatch started = new CountDownLatch(1);
        List<Process> children = new CopyOnWriteArrayList<>();
        TaiwanPerformanceAdapter performance = new TaiwanPerformanceAdapter(properties, stocks, json) {
            @Override Process start(List<String> argv) throws IOException { Process p = process("timeout", source); children.add(p); started.countDown(); return p; }
        };
        AtomicBoolean restoredInterrupt = new AtomicBoolean();
        Thread thread = Thread.ofPlatform().start(() -> {
            assertThat(performance.list(START, END, 20, 0).path("warnings").toString()).contains("SOURCE_INTERRUPTED");
            restoredInterrupt.set(Thread.currentThread().isInterrupted());
        });
        assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
        thread.interrupt(); thread.join(3000);
        assertThat(thread.isAlive()).isFalse();
        assertThat(restoredInterrupt).isTrue();
        assertThat(stocks.acquireSlot()).isTrue(); stocks.releaseSlot();
        assertStopped(children);
    }
}
