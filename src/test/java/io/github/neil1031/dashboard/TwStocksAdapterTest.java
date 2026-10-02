package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TwStocksAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    ObjectNode source() throws Exception { return (ObjectNode)json.readTree(getClass().getResourceAsStream("/fixtures/tw-daily-accumulation-v1.json")); }
    ObjectNode normalize(ObjectNode s) { return TwStocksProjection.normalize(s,null,s.path("snapshot").path("state").asText().equals("COHERENT")?0:2,json); }
    ObjectNode partial() throws Exception { var s=source();s.withObject("snapshot").put("state","PARTIAL").withArray("reason_codes").add("JOURNAL_MISSING");return s; }
    ObjectNode unavailable() throws Exception {
        var s=partial();s.withObject("snapshot").put("state","UNAVAILABLE");s.putNull("observation");s.withObject("status_summary").putNull("latest_finalized").putNull("latest_attempt");
        s.withObject("scope").put("state","UNAVAILABLE").putNull("mode").putNull("start_date");
        var w=s.withObject("weekly_check");w.put("state","UNAVAILABLE").put("status","UNKNOWN").put("binding","UNKNOWN");for(var key:List.of("check_run_id","checked_at","week_start","week_end","problem_count","day_status_counts","pending_revalidation_count","unfinished_run_count"))w.putNull(key);
        unknownResponsibility(s);return s;
    }
    void unknownResponsibility(ObjectNode s) { var r=s.withObject("responsibility");r.put("state","UNKNOWN");for(var k:List.of("pending_revalidation","unfinished_runs","pending_count","unfinished_count"))r.putNull(k); }
    TaiwanProperties properties(int timeout) throws Exception {
        Path python=Path.of(System.getProperty("java.home"),"bin","java.exe"); // A regular executable copy named Python identifies the test-only fixed path.
        Path executable=temp.resolve("python.exe"), cli=temp.resolve("export_tw_readonly.py");
        if(!Files.exists(executable))Files.copy(python,executable);Files.writeString(cli,"synthetic fixed CLI");
        return new TaiwanProperties(true,executable.toString(),cli.toString(),temp.resolve("absent db.sqlite3").toString(),temp.resolve("absent output").toString(),timeout);
    }
    TaiwanStocksAdapter realChild(TaiwanProperties p,String mode,Path fixture,List<Process> children,List<List<String>> commands) {
        return new TaiwanStocksAdapter(p,json){@Override Process start(List<String> command)throws java.io.IOException {
            commands.add(command);var child=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),TwProcessFixture.class.getName(),mode,fixture.toString()).start();children.add(child);return child;
        }};
    }
    @Test void actualExporterFixturePreservesBusinessPartialCandidateAndWeeklyFailedWithinCoherent() throws Exception {
        var s=source();var r=normalize(s);assertThat(r.path("dataState").asText()).isEqualTo("COHERENT");
        assertThat(r.path("latestFinalized").path("status").asText()).isEqualTo("PARTIAL");assertThat(r.path("weeklyCheck").path("status").asText()).isEqualTo("FAILED");
        var c=r.path("observation").path("candidates").get(0);assertThat(c.path("analysisEligible").isNull()).isTrue();assertThat(c.path("publicInfoCheck").path("status").asText()).isEqualTo("SUCCESS");
        assertThat(c.path("coverageStatus").asText()).isEqualTo("PARTIAL");assertThat(c.path("anomalyScore").asDouble()).isEqualTo(72);assertThat(r.path("latestAttempt").path("startedAt").isNull()).isTrue();
    }
    @Test void newerFailedAttemptNeverReplacesFinalizedAndWarmingDoesNotInventCandidate() throws Exception {
        var s=partial();s.withObject("status_summary").withObject("latest_attempt").put("run_id","2".repeat(32)).put("status","FAILED");
        var o=s.withObject("observation");o.put("classification_status","WARMING_UP").putArray("candidates");o.withObject("candidate_summary").put("saved_candidate_count",0).put("saved_total_candidates_before_limit",0).put("exported_count",0);
        var r=normalize(s);assertThat(r.path("latestAttempt").path("status").asText()).isEqualTo("FAILED");assertThat(r.path("latestFinalized").path("runId").asText()).isEqualTo("1".repeat(32));
        assertThat(r.path("observation").path("classificationStatus").asText()).isEqualTo("WARMING_UP");assertThat(r.path("observation").path("candidates").isEmpty()).isTrue();
    }
    @Test void nullUnknownLegacyAndIndependentWeeklyRetained() throws Exception {
        var s=partial();unknownResponsibility(s);s.withObject("status_summary").putNull("latest_attempt");s.withObject("weekly_check").put("binding","INDEPENDENT");
        var o=s.withObject("observation");o.withObject("baseline_session_diagnostics").put("state","LEGACY_DIAGNOSTICS_UNAVAILABLE").putArray("records");o.withObject("mapping_diagnostics").put("state","LEGACY_DIAGNOSTICS_UNAVAILABLE").putNull("unmapped_symbols").putNull("recognized_exclusions");
        o.withObject("readiness").putNull("skipped_counts").putNull("warming_symbols").putNull("pending_candidate_news").put("reason_code","READINESS_UNAVAILABLE");
        var r=normalize(s);assertThat(r.path("responsibility").path("pendingCount").isNull()).isTrue();assertThat(r.path("responsibility").path("state").asText()).isEqualTo("UNKNOWN");assertThat(r.path("observation").path("readiness").path("warmingSymbols").isNull()).isTrue();assertThat(r.path("weeklyCheck").path("binding").asText()).isEqualTo("INDEPENDENT");
    }
    @Test void consumedTypesIdentitiesDatesCountsVersionsAndForbiddenCandidateReconstructionFailClosed() throws Exception {
        for(var mutation:List.<java.util.function.Consumer<ObjectNode>>of(
                s->s.put("contract_version","v2"),s->s.withObject("query").put("target_date","2026-09-25"),
                s->s.withObject("snapshot").put("read_only",false),s->s.withObject("scope").put("start_date","0000-01-01"),
                s->s.put("generated_at","0000-01-01T00:00:00Z"),
                s->s.withObject("observation").withObject("identity").put("run_id","2".repeat(32)),
                s->s.withObject("observation").withObject("identity").put("other_run_id","2".repeat(32)),
                s->((ObjectNode)s.path("observation").path("candidates").get(0)).put("run_id","2".repeat(32)),
                s->s.withObject("status_summary").withObject("latest_finalized").put("status","SUCCESS"),
                s->((ObjectNode)s.path("observation").path("candidates").get(0)).put("signal_date","2026-09-24"),
                s->((ObjectNode)s.path("observation").path("candidates").get(0)).put("analysis_eligible",true),
                s->s.withObject("observation").withArray("candidates").add(s.path("observation").path("candidates").get(0).deepCopy()),
                s->s.withObject("observation").withObject("mapping_diagnostics").withArray("unmapped_symbols").add("2330"),
                s->s.withObject("observation").withObject("candidate_summary").put("exported_count",0),
                s->s.withObject("weekly_check").put("week_end","2026-09-24"),
                s->s.withObject("responsibility").put("truncated",true),
                s->s.withObject("observation").withObject("readiness").withObject("skipped_counts").put("INSUFFICIENT_HISTORY",1.5),
                s->s.withObject("observation").withArray("sources").add(s.path("observation").path("sources").get(0).deepCopy()))) {
            var s=source();mutation.accept(s);assertThatThrownBy(()->normalize(s)).isInstanceOf(RuntimeException.class);
        }
    }
    @Test void partialTruncationPreservesUnknownTotalsAndBoundedPendingFacts() throws Exception {
        var s=partial();var p=s.withObject("responsibility");p.put("state","PARTIAL").put("truncated",true).putNull("pending_count").putNull("unfinished_count");p.withArray("pending_revalidation").addObject().put("target_date","2026-09-25").put("origin_run_id","2".repeat(32)).put("required_at","2026-09-25T08:00:00Z");
        var r=normalize(s);assertThat(r.path("responsibility").path("pendingCount").isNull()).isTrue();assertThat(r.path("responsibility").path("pendingRevalidation")).hasSize(1);
    }
    @Test void rawUnexpectedFieldsAreNeverProjectedAndPathTextExplicitlyRedacted() throws Exception {
        var s=source();s.put("database_path","C:\\private\\database").put("host","SECRET_HOST").put("pid",123).put("raw_source_payload","SECRET_BODY");
        var c=(ObjectNode)s.path("observation").path("candidates").get(0);c.put("stock_name","中文 <img src=x> C:\\private\\db").put("buy","SECRET_TRADE").put("return_1d",0);
        var r=normalize(s);assertThat(r.toString()).contains("[local path omitted]","SOURCE_TEXT_LOCAL_PATH_REDACTED").doesNotContain("private","SECRET_","database_path","return1d","rawSourcePayload","host","pid");
    }
    @Test void fixedCommandPythonAndPyLauncherDateDisabledAndBadConfigurations() throws Exception {
        var p=properties(10);var a=new TaiwanStocksAdapter(p,json);assertThat(a.command("2026-09-25")).containsExactly(p.pythonPath(),"-B",p.cliPath(),"--db",p.databasePath(),"--output-dir",p.outputDir(),"--target-date","2026-09-25");
        var py=new TaiwanStocksAdapter(new TaiwanProperties(false,temp.resolve("py.exe").toString(),"cli","db","output",10),json);assertThat(py.command(null)).containsExactly(temp.resolve("py.exe").toString(),"-3.11","-B","cli","--db","db","--output-dir","output");
        assertThat(py.read(null).path("warnings").toString()).contains("SOURCE_DISABLED");
        for(int timeout:List.of(0,31))assertThat(new TaiwanStocksAdapter(new TaiwanProperties(true,p.pythonPath(),p.cliPath(),p.databasePath(),p.outputDir(),timeout),json).read(null).path("warnings").toString()).contains("SOURCE_NOT_CONFIGURED");
        for(String python:List.of("cmd.exe","pwsh.exe","powershell.exe","sh","bash","python.cmd"))assertThat(new TaiwanStocksAdapter(new TaiwanProperties(true,temp.resolve(python).toString(),p.cliPath(),p.databasePath(),p.outputDir(),10),json).read(null).path("warnings").toString()).contains("SOURCE_NOT_CONFIGURED");
        for(String bad:List.of("", "0000-01-01","2026-02-29","2026-9-25"," 2026-09-25","--help","10000-01-01"))assertThatThrownBy(()->py.read(bad)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void realProcessesExit0Exit2ValidPartialUnavailableInputErrorArgparseUnexpectedAnd16MiBCeiling() throws Exception {
        Path file=temp.resolve("fixture.json");var p=properties(3);
        for(String mode:List.of("ok","ceiling","partial","unavailable","date-error","argparse","unexpected","utf8","duplicate","trailing","stdout","stderr")) {
            var s=mode.equals("partial")?partial():mode.equals("unavailable")?unavailable():source();Files.writeString(file,s.toString());var children=new ArrayList<Process>();var commands=new ArrayList<List<String>>();
            var a=realChild(p,List.of("partial","unavailable").contains(mode)?"exit2":mode,file,children,commands);var r=a.read(null);
            String expected=mode.equals("partial")?"PARTIAL":mode.equals("unavailable")||mode.equals("unexpected")?"UNAVAILABLE":List.of("ok","ceiling").contains(mode)?"COHERENT":"ERROR";
            assertThat(r.path("dataState").asText()).as(mode).isEqualTo(expected);assertThat(commands).hasSize(1);assertThat(commands.get(0)).isEqualTo(a.command(null));assertThat(r.toString()).doesNotContain(temp.toString(),"private","secret");for(var child:children){child.waitFor(3,TimeUnit.SECONDS);assertThat(child.isAlive()).isFalse();}
        }
        assertThat(Files.exists(Path.of(p.databasePath()))).isFalse();assertThat(Files.exists(Path.of(p.outputDir()))).isFalse();
    }
    @Test void contradictoryExitStateAndUnsupportedOutputFailSafely() throws Exception {
        var p=properties(3);Path f=temp.resolve("fixture.json");Files.writeString(f,source().toString());var a=realChild(p,"exit2",f,new ArrayList<>(),new ArrayList<>());assertThat(a.read(null).path("warnings").toString()).contains("SOURCE_INVALID_OUTPUT");
        var s=source().put("contract_version","unsupported");Files.writeString(f,s.toString());a=realChild(p,"ok",f,new ArrayList<>(),new ArrayList<>());assertThat(a.read(null).path("warnings").toString()).contains("SOURCE_CONTRACT_UNSUPPORTED");
    }
    @Test void actualPythonProcessBuilderFixedArgvUtf8NoBytecodeAndNoSourceCreation() throws Exception {
        String configured = System.getProperty("dashboard.test.python");
        Path python = configured != null ? Path.of(configured) : System.getenv("LOCALAPPDATA") != null
                ? Path.of(System.getenv("LOCALAPPDATA"), "Programs", "Python", "Python311", "python.exe") : Path.of("/usr/bin/python3");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isRegularFile(python), "Python standard-library integration runtime unavailable");
        Path cli = temp.resolve("export_tw_readonly.py"), payload = temp.resolve("synthetic.json"), module = temp.resolve("sentinel_module.py"),
                db = temp.resolve("missing.sqlite3"), output = temp.resolve("missing output");
        Files.writeString(payload, source().toString()); Files.writeString(module, "sentinel = '中文'\n");
        Files.writeString(cli, """
                import sys, os, json
                from pathlib import Path
                import sentinel_module
                assert sys.dont_write_bytecode
                assert os.environ['PYTHONDONTWRITEBYTECODE'] == '1'
                assert os.environ['PYTHONUTF8'] == '1'
                assert os.environ['PYTHONIOENCODING'] == 'utf-8'
                assert len(sys.argv) == 5 and sys.argv[1] == '--db' and sys.argv[3] == '--output-dir'
                assert not Path(sys.argv[2]).exists() and not Path(sys.argv[4]).exists()
                assert sys.stdout.encoding.lower().replace('-', '') == 'utf8'
                print(json.dumps(json.loads(Path(__file__).with_name('synthetic.json').read_text(encoding='utf-8')), ensure_ascii=False))
                """);
        var before = new HashMap<Path, byte[]>(); for (Path f : List.of(cli,payload,module)) before.put(f, Files.readAllBytes(f));
        var a = new TaiwanStocksAdapter(new TaiwanProperties(true,python.toString(),cli.toString(),db.toString(),output.toString(),10),json);
        var r = a.read(null); assertThat(r.path("dataState").asText()).isEqualTo("COHERENT");
        assertThat(r.path("observation").path("candidates").get(0).path("stockName").asText()).isEqualTo("台積電");
        for(var entry:before.entrySet())assertThat(Files.readAllBytes(entry.getKey())).isEqualTo(entry.getValue());
        assertThat(Files.exists(db)).isFalse();assertThat(Files.exists(output)).isFalse();assertThat(Files.exists(temp.resolve("__pycache__"))).isFalse();
    }
    @Test void timeoutTerminatesChildTreeAndSemaphoreRejectsThirdInvocation() throws Exception {
        var p=properties(2);Path f=temp.resolve("fixture.json");Files.writeString(f,source().toString());var children=new CopyOnWriteArrayList<Process>();var commands=new CopyOnWriteArrayList<List<String>>();var started=new CountDownLatch(2);
        var a=new TaiwanStocksAdapter(p,json){@Override Process start(List<String> c)throws java.io.IOException{var child=realChild(p,"timeout",f,children,commands).start(c);started.countDown();return child;}};
        var first=CompletableFuture.supplyAsync(()->a.read(null));var second=CompletableFuture.supplyAsync(()->a.read(null));assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();assertThat(a.read(null).path("warnings").toString()).contains("SOURCE_BUSY");assertThat(children).hasSize(2);assertThat(first.get(6,TimeUnit.SECONDS).path("warnings").toString()).contains("SOURCE_TIMEOUT");second.get(6,TimeUnit.SECONDS);
        for(var child:children){child.waitFor(3,TimeUnit.SECONDS);assertThat(child.isAlive()).isFalse();}
        var tree=realChild(properties(3),"tree",f,new ArrayList<>(),new ArrayList<>());assertThat(tree.read(null).path("warnings").toString()).contains("SOURCE_TIMEOUT");long pid=Long.parseLong(Files.readString(Path.of(f+".pid")));long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)&&System.nanoTime()<deadline)Thread.sleep(20);assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
    }
    @Test void httpCanonicalDateAndDuplicateUnknownParamsRejectedBeforeInvocationAndPartialStill200() throws Exception {
        var a=mock(TaiwanStocksAdapter.class);var mvc=MockMvcBuilders.standaloneSetup(new TwStocksController(a)).build();
        for(String bad:List.of("","0000-01-01","2026-02-29","2026-04-31","--help","2026-9-25","2026-09-25 "))mvc.perform(get("/api/tw/stocks").param("date",bad)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.code").value("TARGET_DATE_INVALID"));
        mvc.perform(get("/api/tw/stocks").param("date","2026-09-25","2026-09-26")).andExpect(status().isBadRequest());mvc.perform(get("/api/tw/stocks").param("db","C:\\private")).andExpect(status().isBadRequest());verifyNoInteractions(a);
        when(a.read(null)).thenReturn(normalize(partial()));mvc.perform(get("/api/tw/stocks")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.dataState").value("PARTIAL"));verify(a).read(null);
        var s=source();s.withObject("query").put("mode","TARGET_DATE").put("target_date","2026-09-25");when(a.read("2026-09-25")).thenReturn(TwStocksProjection.normalize(s,"2026-09-25",0,json));mvc.perform(get("/api/tw/stocks").param("date","2026-09-25")).andExpect(status().isOk()).andExpect(jsonPath("$.query.targetDate").value("2026-09-25"));verify(a).read("2026-09-25");
    }
}
