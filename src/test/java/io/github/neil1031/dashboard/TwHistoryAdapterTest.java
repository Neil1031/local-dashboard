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

class TwHistoryAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    static final TwHistoryProjection.Query Q = TwHistoryProjection.Query.list("2026-09-21", "2026-09-25", 20, 0);
    ObjectNode fixture() throws Exception { return (ObjectNode)json.readTree(getClass().getResourceAsStream("/fixtures/tw-history-list.json")); }
    ObjectNode item(ObjectNode s) { return (ObjectNode)s.path("items").get(0); }
    ObjectNode normalized(ObjectNode s) { return TwHistoryProjection.normalize(s,Q,Set.of("READY","EMPTY").contains(s.path("dataState").asText())?0:2,json); }
    TaiwanProperties config(int timeout) throws Exception {
        Path python=temp.resolve("python.exe"),stocks=temp.resolve("export_tw_readonly.py"),reports=temp.resolve("export_tw_reports.py"),history=temp.resolve("export_tw_history.py");
        if(!Files.exists(python))Files.copy(Path.of(System.getProperty("java.home"),"bin","java.exe"),python);
        for(Path p:List.of(stocks,reports,history))Files.writeString(p,"Synthetic identity only");
        return new TaiwanProperties(true,python.toString(),stocks.toString(),temp.resolve("absent db").toString(),temp.resolve("absent output").toString(),timeout,reports.toString(),history.toString());
    }
    TaiwanHistoryAdapter child(TaiwanProperties p,TaiwanStocksAdapter gate,String mode,Path file,List<Process> children,List<List<String>> commands){
        return new TaiwanHistoryAdapter(p,gate,json){@Override Process start(List<String> argv)throws java.io.IOException{
            commands.add(argv);var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),TwHistoryProcessFixture.class.getName(),mode,file.toString()).start();children.add(process);return process;
        }};
    }
    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    @org.springframework.boot.context.properties.EnableConfigurationProperties(TaiwanProperties.class)
    static class BindingConfig {}
    @Test void springBindsExplicitNewHistoryPathAndExistingDefaults() {
        new org.springframework.boot.test.context.runner.ApplicationContextRunner().withUserConfiguration(BindingConfig.class)
            .withPropertyValues("dashboard.sources.taiwan.history-cli-path=history", "dashboard.sources.taiwan.reports-cli-path=reports")
            .run(c -> { assertThat(c).hasNotFailed(); var p = c.getBean(TaiwanProperties.class); assertThat(p.historyCliPath()).isEqualTo("history"); assertThat(p.reportsCliPath()).isEqualTo("reports"); assertThat(p.enabled()).isFalse(); assertThat(p.timeoutSeconds()).isEqualTo(10); });
    }
    @Test void sameDayBusinessPartialTransportReadyNullUnknownAndNoGapRows()throws Exception{
        var r=normalized(fixture());assertThat(r.path("items")).hasSize(2);assertThat(r.path("items").get(0).path("runId").asText()).isEqualTo("2".repeat(32));assertThat(r.path("items").get(1).path("runId").asText()).isEqualTo("1".repeat(32));assertThat(r.path("items").get(0).path("savedStatus").asText()).isEqualTo("PARTIAL");assertThat(r.path("page").path("total").isNull()).isTrue();
        var s=fixture();s.put("dataState","PARTIAL").withArray("warnings").add("SAVED_FACT_UNKNOWN");item(s).putNull("candidateCount").putNull("savedTotalCandidatesBeforeLimit").putNull("savedCandidateTruncated").put("classificationStatus","UNKNOWN");item(s).withArray("projectionWarnings").add("SAVED_FACT_UNKNOWN");item(s).withObject("readiness").putNull("skippedCounts").putNull("warmingSymbols").putNull("reasonCode");((ObjectNode)item(s).path("markets").get(0)).putNull("complete");
        assertThat(normalized(s).path("items").get(0).path("candidateCount").isNull()).isTrue();assertThat(normalized(s).toString()).doesNotContain("MISSED","NO_ANOMALY","performance");
    }
    @Test void readyPartialEmptyUnavailableErrorAndRetainedScope()throws Exception{
        for(String state:List.of("READY","PARTIAL","EMPTY","UNAVAILABLE","ERROR")){
            var s=fixture();s.put("dataState",state);if(!state.equals("READY"))s.withArray("warnings").add(state.equals("EMPTY")?"RANGE_START_BEFORE_SOURCE_SCOPE":"SOURCE_UNAVAILABLE");
            if(Set.of("EMPTY","UNAVAILABLE","ERROR").contains(state)){s.putArray("items");if(state.equals("EMPTY"))s.withObject("page").put("returned",0);else s.putNull("page");}
            assertThat(normalized(s).path("dataState").asText()).isEqualTo(state);assertThat(normalized(s).path("scope").isObject()).isTrue();
        }
        for(String code:List.of("INPUT_INVALID","RANGE_TOO_LARGE")){var s=fixture();s.put("dataState","ERROR").putNull("scope").putNull("query").putNull("page").putArray("items");s.withArray("warnings").add(code);assertThat(normalized(s).path("query").isObject()).isTrue();}
        var s=fixture();s.put("dataState","ERROR").putNull("page").putArray("items");s.withArray("warnings").add("STDOUT_SIZE_LIMIT");assertThat(normalized(s).path("scope").isObject()).isTrue();
    }
    @Test void strictCalendarInclusive366AndQueryBounds(){
        assertThat(TwHistoryProjection.Query.list("2024-01-01","2024-12-31",50,10000)).isNotNull();assertThat(TwHistoryProjection.Query.list("2026-09-25","2026-09-25",1,0)).isNotNull();
        for(String[] range:List.of(new String[]{"2024-01-01","2025-01-01"},new String[]{"2026-09-25","2026-09-24"},new String[]{"2026-02-29","2026-03-01"},new String[]{"0000-01-01","0000-01-02"},new String[]{null,"2026-09-25"},new String[]{"2026-9-01","2026-09-25"}))assertThatThrownBy(()->TwHistoryProjection.Query.list(range[0],range[1],20,0)).isInstanceOf(IllegalArgumentException.class);
        for(int limit:List.of(0,51))assertThatThrownBy(()->TwHistoryProjection.Query.list(Q.startDate(),Q.endDate(),limit,0)).isInstanceOf(IllegalArgumentException.class);
        for(int offset:List.of(-1,10001))assertThatThrownBy(()->TwHistoryProjection.Query.list(Q.startDate(),Q.endDate(),20,offset)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void exactPageAndOffsetCeilingPreserved()throws Exception{
        for(int offset:List.of(0,9999,10000)){
            var q=TwHistoryProjection.Query.list(Q.startDate(),Q.endDate(),2,offset);var s=fixture();s.withObject("query").put("limit",2).put("offset",offset);s.withObject("page").put("limit",2).put("offset",offset).put("hasMore",true);
            if(offset+2<=10000)s.withObject("page").put("nextOffset",offset+2);else{s.withObject("page").putNull("nextOffset");s.put("dataState","PARTIAL").withArray("warnings").add("PAGINATION_OFFSET_LIMIT");}
            assertThat(TwHistoryProjection.normalize(s,q,offset==0?0:2,json).path("page")).isEqualTo(s.path("page"));
        }
    }
    @Test void mismatchedQueryIdentityTypesCountsMarketsWarningsAndPaginationFailClosed()throws Exception{
        for(Consumer<ObjectNode> mutate:List.<Consumer<ObjectNode>>of(s->s.put("source","other"),s->s.put("generatedAt","0000-01-01T00:00:00Z"),s->s.withObject("query").put("requestedStartDate","2026-09-22"),s->s.withObject("page").put("total",0),s->s.withObject("page").put("returned",1),s->s.withObject("page").put("nextOffset",20),s->item(s).put("observationId","tw-observation:2026-09-25:"+"3".repeat(32)),s->item(s).withObject("detailRef").put("reportId","tw-daily:2026-09-24:"+"2".repeat(32)),s->item(s).put("candidateCount",-1),s->item(s).put("savedTotalCandidatesBeforeLimit",1),s->item(s).withObject("sourceStatusCounts").put("SUCCESS",65),s->item(s).withObject("readiness").put("warmingSymbols",0.5),s->((ObjectNode)item(s).path("markets").get(0)).put("complete",0),s->((ObjectNode)item(s).path("markets").get(1)).put("market","TWSE"),s->item(s).withArray("projectionWarnings").add("SOURCE_COMPLETENESS_INCOMPLETE"),s->s.withArray("items").add(s.path("items").get(0).deepCopy()),s->s.withArray("warnings").add("C:/private/db"))){var s=fixture();mutate.accept(s);assertThatThrownBy(()->normalized(s)).isInstanceOf(RuntimeException.class);}
        var s=fixture();assertThatThrownBy(()->TwHistoryProjection.normalize(s,Q,2,json)).isInstanceOf(RuntimeException.class);
    }
    @Test void extraPrivateFieldsAreDiscarded()throws Exception{var s=fixture();s.put("databasePath","SECRET");item(s).put("rawPayload","SECRET");item(s).withObject("readiness").put("private","SECRET");assertThat(normalized(s).toString()).doesNotContain("SECRET","databasePath","rawPayload","private");}
    @Test void fixedArgvExplicitHistoryConfigAndNoOutputDirectory()throws Exception{
        var p=config(10);var a=new TaiwanHistoryAdapter(p,new TaiwanStocksAdapter(p,json),json);assertThat(a.command(Q)).containsExactly(p.pythonPath(),"-B",p.historyCliPath(),"--db",p.databasePath(),"list","--start-date",Q.startDate(),"--end-date",Q.endDate(),"--limit","20","--offset","0");
        var py=new TaiwanProperties(false,temp.resolve("py.exe").toString(),"stocks","db","output",10,"reports","history");assertThat(new TaiwanHistoryAdapter(py,new TaiwanStocksAdapter(py,json),json).command(Q)).startsWith(py.pythonPath(),"-3.11","-B","history");
    }
    @Test void disabledInvalidMissingConfigNeverStarts()throws Exception{
        var p=config(10);for(var bad:List.of(new TaiwanProperties(false,p.pythonPath(),p.cliPath(),p.databasePath(),p.outputDir(),10,p.reportsCliPath(),p.historyCliPath()),new TaiwanProperties(true,p.pythonPath(),p.cliPath(),p.databasePath(),p.outputDir(),10,p.reportsCliPath()),new TaiwanProperties(true,p.pythonPath(),p.cliPath(),"relative.db",p.outputDir(),10,p.reportsCliPath(),p.historyCliPath()),new TaiwanProperties(true,p.pythonPath(),p.cliPath(),p.databasePath(),p.outputDir(),31,p.reportsCliPath(),p.historyCliPath()),new TaiwanProperties(true,"cmd.exe",p.cliPath(),p.databasePath(),p.outputDir(),10,p.reportsCliPath(),p.historyCliPath()),new TaiwanProperties(true,p.pythonPath(),p.cliPath(),p.databasePath(),p.outputDir(),10,p.reportsCliPath(),p.reportsCliPath()))){var a=new TaiwanHistoryAdapter(bad,new TaiwanStocksAdapter(bad,json),json){@Override Process start(List<String> argv){throw new AssertionError("Must not start");}};assertThat(a.list(Q.startDate(),Q.endDate(),20,0).path("warnings").toString()).containsAnyOf("SOURCE_DISABLED","SOURCE_NOT_CONFIGURED");}
    }
    @Test void actualBoundedChildrenUtf8StrictJsonExitOverflowTimeoutCleanup()throws Exception{
        var p=config(1);var file=temp.resolve("fixture.json");for(String mode:List.of("ok","exit2","ceiling","utf8","duplicate","trailing","invalid","stdout","stderr","exit","timeout")){
            var s=fixture();if(mode.equals("exit2"))s.put("dataState","PARTIAL").withArray("warnings").add("SOURCE_COMPLETENESS_INCOMPLETE");Files.writeString(file,s.toString());var children=new ArrayList<Process>();var commands=new ArrayList<List<String>>();var a=child(p,new TaiwanStocksAdapter(p,json),mode,file,children,commands);var result=a.list(Q.startDate(),Q.endDate(),20,0);assertThat(result.path("dataState").asText()).as(mode).isEqualTo(Set.of("ok","ceiling").contains(mode)?"READY":mode.equals("exit2")?"PARTIAL":Set.of("exit","timeout").contains(mode)?"UNAVAILABLE":"ERROR");assertThat(commands).hasSize(1);assertThat(result.toString()).doesNotContain("secret",temp.toString());for(var process:children){process.waitFor(3,TimeUnit.SECONDS);assertThat(process.isAlive()).isFalse();}
        }
        assertThat(Files.exists(Path.of(p.databasePath()))).isFalse();
    }
    @Test void stocksReportsAndHistoryActualChildrenShareOnlyTwoSlots()throws Exception{
        var p=config(2);var entered=new CountDownLatch(2);var children=new CopyOnWriteArrayList<Process>();var file=temp.resolve("unused");
        var stocks=new TaiwanStocksAdapter(p,json){@Override Process start(List<String> argv)throws java.io.IOException{var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),TwHistoryProcessFixture.class.getName(),"timeout",file.toString()).start();children.add(process);entered.countDown();return process;}};
        var history=new TaiwanHistoryAdapter(p,stocks,json){@Override Process start(List<String> argv)throws java.io.IOException{entered.countDown();return child(p,stocks,"timeout",file,children,new ArrayList<>()).start(argv);}};
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()){var one=pool.submit(()->stocks.read(null));var two=pool.submit(()->history.list(Q.startDate(),Q.endDate(),20,0));assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();assertThat(history.list(Q.startDate(),Q.endDate(),20,0).path("warnings").toString()).contains("SOURCE_BUSY");assertThat(new TaiwanReportsAdapter(p,stocks,json).list("daily",20,0).path("warnings").toString()).contains("SOURCE_BUSY");assertThat(stocks.read(null).path("warnings").toString()).contains("SOURCE_BUSY");one.get(5,TimeUnit.SECONDS);two.get(5,TimeUnit.SECONDS);assertThat(children).hasSize(2);assertThat(stocks.acquireSlot()).isTrue();stocks.releaseSlot();}for(var process:children)assertThat(process.isAlive()).isFalse();
    }
    @Test void interruptedHistoryReadRestoresFlagAndSlot()throws Exception{
        var p=config(2);var stocks=new TaiwanStocksAdapter(p,json);var entered=new CountDownLatch(1);var children=new CopyOnWriteArrayList<Process>();var history=new TaiwanHistoryAdapter(p,stocks,json){@Override Process start(List<String> argv)throws java.io.IOException{var process=child(p,stocks,"timeout",temp.resolve("unused"),children,new ArrayList<>()).start(argv);entered.countDown();return process;}};var interrupted=new java.util.concurrent.atomic.AtomicBoolean();var thread=Thread.ofPlatform().start(()->{assertThat(history.list(Q.startDate(),Q.endDate(),20,0).path("warnings").toString()).contains("SOURCE_INTERRUPTED");interrupted.set(Thread.currentThread().isInterrupted());});assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();thread.interrupt();thread.join(3000);assertThat(thread.isAlive()).isFalse();assertThat(interrupted).isTrue();assertThat(stocks.acquireSlot()).isTrue();stocks.releaseSlot();for(var process:children)assertThat(process.isAlive()).isFalse();
    }
    @Test void controllerOnlyFourParamsStrictHttp400BeforeReadAndNoStore()throws Exception{
        var adapter=mock(TaiwanHistoryAdapter.class);var mvc=MockMvcBuilders.standaloneSetup(new TwHistoryController(adapter)).build();String valid="/api/tw/history?startDate=2026-09-21&endDate=2026-09-25";
        for(String path:List.of("/api/tw/history",valid+"&date=2026-09-25",valid+"&startDate=2026-09-21",valid+"&limit=",valid+"&offset=",valid+"&limit=0",valid+"&limit=51",valid+"&offset=10001",valid+"&offset=-1",valid+"&limit=020","/api/tw/history?startDate=2026-02-29&endDate=2026-03-01","/api/tw/history?startDate=2024-01-01&endDate=2025-01-01","/api/tw/history?startDate=&endDate=2026-09-25"))mvc.perform(get(path)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));verifyNoInteractions(adapter);
        when(adapter.list(Q.startDate(),Q.endDate(),20,0)).thenReturn(normalized(fixture()));mvc.perform(get(valid)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.items.length()").value(2));verify(adapter).list(Q.startDate(),Q.endDate(),20,0);
    }
}
