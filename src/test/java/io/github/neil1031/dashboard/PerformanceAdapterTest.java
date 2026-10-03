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
import static io.github.neil1031.dashboard.PerformanceProjection.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PerformanceAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    ObjectNode source(String kind) throws Exception { return (ObjectNode) json.readTree(getClass().getResourceAsStream("/fixtures/performance-"+kind+"-v1.json")); }
    Query summary(String h, Double a, Double b) { return new Query(Operation.SUMMARY,h,a,b,null,20,0,null); }
    Query list(String h, String t, int limit, int offset) { return new Query(Operation.LIST,h,null,null,t,limit,offset,null); }
    Query detail() { return new Query(Operation.DETAIL,null,null,null,null,20,0,"report:2026-09-30:COO"); }
    ObjectNode normalize(ObjectNode source, Query q) { return PerformanceProjection.normalize(source,q,json); }
    InsiderProperties config(int timeout) throws Exception {
        var cli=temp.resolve("fixed-reader.exe");var db=temp.resolve("synthetic.db");Files.writeString(cli,"fixture");Files.writeString(db,"not a real DB");
        return new InsiderProperties(true,cli.toString(),db.toString(),timeout);
    }
    @Test void sourceGeneratedFractionalBucketsZerosAndUnscoredPassThroughWithoutMath() throws Exception {
        var r=normalize(source("summary"),summary("3m",null,null));
        assertThat(r.path("groups")).isEqualTo(source("summary").path("groups"));
        assertThat(r.path("groups").get(1).path("averageReturnPct").doubleValue()).isZero();
        assertThat(r.path("groups").get(1).path("winRatePct").doubleValue()).isZero();
        assertThat(r.path("groups").get(0).path("averageReturnPct").isNull()).isTrue();
        assertThat(r.path("performanceStatusCounts")).isEqualTo(source("summary").path("performanceStatusCounts"));
        assertThat(r.path("groups").get(4).path("bucket").textValue()).isEqualTo("UNSCORED");
    }
    @Test void summaryAllHorizonsExplicitThresholdZeroHundredAndEmptyBuckets() throws Exception {
        for(var h:HORIZONS) for(Double threshold:Arrays.asList(null,0.,100.)) {
            var s=source("summary").put("horizon",h);s.withObject("filters").set("minInvestment",json.valueToTree(threshold));
            assertThat(normalize(s,summary(h,threshold,null)).path("filters").get("minInvestment")).isEqualTo(json.valueToTree(threshold));
        }
        var s=source("summary");for(var g:s.withArray("groups")){var n=(ObjectNode)g;n.put("signals",0).put("observed",0).put("unobserved",0).putNull("averageReturnPct").putNull("winRatePct");}
        for(var k:List.of("complete","partial","pending","not_computed"))s.withObject("performanceStatusCounts").put(k,0);
        var r=normalize(s,summary("3m",null,null));assertThat(r.path("dataState").textValue()).isEqualTo("EMPTY");assertThat(r.path("groups").size()).isEqualTo(5);
    }
    @Test void summaryRejectsMalformedCountsNullsAndQueryEcho() throws Exception {
        for(Consumer<ObjectNode> mutate:List.<Consumer<ObjectNode>>of(
                s->s.put("horizon","1d"),s->s.withObject("filters").put("minInvestment",0),s->s.withArray("groups").remove(4),
                s->((ObjectNode)s.path("groups").get(0)).put("bucket","85-89"),s->((ObjectNode)s.path("groups").get(0)).put("signals","3"),
                s->((ObjectNode)s.path("groups").get(0)).put("averageReturnPct",0),s->((ObjectNode)s.path("groups").get(1)).putNull("winRatePct"),
                s->((ObjectNode)s.path("groups").get(1)).put("winRatePct",101),s->s.withObject("performanceStatusCounts").put("not_computed",100))) {
            var s=source("summary");mutate.accept(s);assertThatThrownBy(()->normalize(s,summary("3m",null,null))).isInstanceOf(RuntimeException.class);
        }
    }
    @Test void listKeepsDifferentReportIdentityAndSnapshotPresenceNotReturnMaturity() throws Exception {
        var s=source("list");var r=normalize(s,list("3m",null,20,0));
        assertThat(r.path("items").get(0).path("horizonObserved").booleanValue()).isTrue();assertThat(r.path("items").get(0).path("snapshot").path("returnFromTradablePct").isNull()).isTrue();
        assertThat(r.path("items").get(0).path("ticker")).isEqualTo(r.path("items").get(1).path("ticker"));
        assertThat(r.path("items").get(0).path("signalId")).isNotEqualTo(r.path("items").get(1).path("signalId"));
        assertThat(r.path("items").get(3).path("performanceStatus").textValue()).isEqualTo("NOT_COMPUTED");
        assertThat(r.path("items").get(3).path("snapshot").path("returnFromTradablePct").doubleValue()).isZero();
        assertThat(r.path("items").get(4).path("horizonObserved").booleanValue()).isFalse();
        for(var h:HORIZONS){s.put("horizon",h);assertThat(normalize(s,list(h,null,20,0)).path("horizon").asText()).isEqualTo(h);}
    }
    @Test void exactTickerPagingAndBeyondEndAreBounded() throws Exception {
        var s=source("list");s.put("ticker","COO").put("limit",1).put("has_more",true).put("next_offset",1);var first=s.withArray("signals").get(0).deepCopy();s.putArray("signals").add(first);
        assertThat(normalize(s,list("3m","COO",1,0)).path("page").path("nextOffset").asInt()).isEqualTo(1);
        s.put("offset",1_000_000).put("next_offset",1_000_001);var r=normalize(s,list("3m","COO",1,1_000_000));
        assertThat(r.path("page").path("hasMore").booleanValue()).isFalse();assertThat(r.path("warnings").toString()).contains("PAGINATION_BOUND_REACHED");
        s.put("offset",999).put("has_more",false).putNull("next_offset").putArray("signals");assertThat(normalize(s,list("3m","COO",1,999)).path("dataState").asText()).isEqualTo("EMPTY");
        assertThat(exactTicker("coo")).isEqualTo("coo");
    }
    @Test void listRejectsIdentityDuplicationPresenceStatusAndPageContradictions() throws Exception {
        for(Consumer<ObjectNode> mutate:List.<Consumer<ObjectNode>>of(
                s->s.withArray("signals").set(1,s.path("signals").get(0).deepCopy()),s->((ObjectNode)s.path("signals").get(0)).put("signalId","sec:bad:0"),
                s->((ObjectNode)s.path("signals").get(0)).put("reportDate","2026-02-29"),s->((ObjectNode)s.path("signals").get(0)).put("horizonObserved",false),
                s->((ObjectNode)s.path("signals").get(0)).put("performanceStatus","OBSERVED"),s->s.put("next_offset",21),
                s->((ObjectNode)s.path("signals").get(0)).put("ticker","C:\\private\\db"))) {
            var s=source("list");mutate.accept(s);assertThatThrownBy(()->normalize(s,list("3m",null,20,0))).isInstanceOf(RuntimeException.class);
        }
    }
    @Test void detailPreservesAllStoredTypesZeroMetricsAndBothBases() throws Exception {
        var r=normalize(source("detail"),detail());assertThat(r.path("snapshots").size()).isEqualTo(7);
        assertThat(r.path("performance").path("maxUpsidePct").doubleValue()).isZero();assertThat(r.path("performance").path("daysToPeak").intValue()).isZero();
        assertThat(r.path("performance").path("maxAdversePct").isNull()).isTrue();assertThat(r.path("snapshots").path("3m").path("returnFromTradablePct").isNull()).isTrue();
        assertThat(r.path("snapshots").path("discovery").path("returnFromDiscoveryPct").isNull()).isTrue();
        assertThat(r.path("snapshots").path("3m").path("priceBasis").textValue()).isEqualTo("split_adjusted_ex_dividends");
        assertThat(r.path("signal").path("company").textValue()).contains("公司 🚀 <script>");
    }
    @Test void detailAllStatusesMissingDatesAndAbsentSnapshotsAreSourceFacts() throws Exception {
        for(String status:STATUSES) {
            var s=source("detail");var p=s.withObject("performance");p.put("status",status);
            if(status.equals("PARTIAL"))p.withArray("missingSessions").add("2026-09-28");
            if(status.equals("NOT_COMPUTED")){for(String k:List.of("asOf","updatedAt","maxUpsidePct","maxAdversePct","maxDrawdownPct","daysToPeak","daysToFirst10PctGain","daysToFirst10PctLoss"))p.putNull(k);}
            s.withObject("snapshots").remove("6m");assertThat(normalize(s,detail()).path("performance").path("status").asText()).isEqualTo(status);
        }
    }
    @Test void detailRejectsPrivatePathsInvalidTimestampsContradictoryStatesAndNumbers() throws Exception {
        for(Consumer<ObjectNode> mutate:List.<Consumer<ObjectNode>>of(
                s->s.withObject("signal").put("company","F:\\secret\\data"),s->s.withObject("signal").put("discoveredAt","2026-09-30T10:00:00"),
                s->s.withObject("performance").withArray("missingSessions").add("2026-09-28"),s->s.withObject("performance").put("status","NOT_COMPUTED"),
                s->s.withObject("performance").put("daysToPeak",0.5),s->s.withObject("snapshots").withObject("3m").put("price",0),
                s->s.withObject("snapshots").withObject("3m").put("provider","/private/prices"),s->s.withObject("snapshots").putObject("future"))) {
            var s=source("detail");mutate.accept(s);assertThatThrownBy(()->normalize(s,detail())).isInstanceOf(RuntimeException.class);
        }
        var s=source("detail");s.put("private_path","C:\\omitted\\db");s.withObject("signal").put("private_path","C:\\omitted\\db");
        assertThat(normalize(s,detail()).toString()).doesNotContain("omitted","private_path");
    }
    @Test void exactArgvUsesThreeReadonlyOperationsAndSharedConfig() {
        var c=new InsiderProperties(false,"fixed.exe","fixed.db",10);var a=new PerformanceAdapter(c,new InsiderSignalsAdapter(c,json),json);
        assertThat(a.command(summary("3m",null,null))).containsExactly("fixed.exe","--db","fixed.db","read-performance-summary","--horizon","3m");
        assertThat(a.command(summary("1d",0.,100.))).containsExactly("fixed.exe","--db","fixed.db","read-performance-summary","--horizon","1d","--min-investment","0.0","--min-signal","100.0");
        assertThat(a.command(list("6m","coo",100,1000000))).containsExactly("fixed.exe","--db","fixed.db","list-performance","--horizon","6m","--limit","100","--offset","1000000","--ticker","coo");
        assertThat(a.command(detail())).containsExactly("fixed.exe","--db","fixed.db","get-performance","--signal-id","report:2026-09-30:COO");
    }
    PerformanceAdapter child(InsiderProperties c,InsiderSignalsAdapter insider,String mode,Path fixture,List<Process> processes) {
        return new PerformanceAdapter(c,insider,json){@Override Process start(List<String> argv)throws java.io.IOException {
            var p=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),SignalsProcessFixture.class.getName(),mode,fixture.toString()).start();processes.add(p);return p;
        }};
    }
    @Test void realSubprocessSuccessTimeoutBoundsStrictJsonUtf8AndSafeNonzero() throws Exception {
        var c=config(1);var insider=new InsiderSignalsAdapter(c,json);var file=temp.resolve("source.json");Files.writeString(file,source("summary").toString());
        for(var mode:List.of("success","timeout","stdout","stderr","exit","invalid","utf8","duplicate","trailing")) {
            var ps=new ArrayList<Process>();var r=child(c,insider,mode,file,ps).read(summary("3m",null,null));
            assertThat(r.path("dataState").asText()).as(mode).isEqualTo(mode.equals("success")?"READY":Set.of("timeout","exit").contains(mode)?"UNAVAILABLE":"ERROR");
            assertThat(r.toString()).doesNotContain(temp.toString(),"secret","private C:");for(var p:ps)assertThat(p.isAlive()).isFalse();
        }
    }
    @Test void performanceSignalsReportsSecShareExactlyTwoSlotsAndInterruptReleases() throws Exception {
        var c=config(2);var insider=new InsiderSignalsAdapter(c,json);var started=new CountDownLatch(2);var children=new CopyOnWriteArrayList<Process>();
        var a=new PerformanceAdapter(c,insider,json){@Override Process start(List<String> args)throws java.io.IOException {
            var p=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),SignalsProcessFixture.class.getName(),"timeout").start();children.add(p);started.countDown();return p;}};
        try(var pool=Executors.newFixedThreadPool(2)) {
            var first=pool.submit(()->a.read(summary("3m",null,null)));var second=pool.submit(()->a.read(list("3m",null,20,0)));assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();
            for(var r:List.of(insider.read(null,20,0),insider.readSec(null,20,0),insider.readReports(null,20,0),a.read(detail())))assertThat(r.path("warnings").toString()).contains("SOURCE_BUSY");
            first.get(5,TimeUnit.SECONDS);second.get(5,TimeUnit.SECONDS);for(var p:children)assertThat(p.isAlive()).isFalse();
        }
        var running=new CountDownLatch(1);var result=new java.util.concurrent.atomic.AtomicReference<ObjectNode>();
        var interrupted=new PerformanceAdapter(c,insider,json){@Override Process start(List<String> args)throws java.io.IOException {var p=a.start(args);running.countDown();return p;}};
        var thread=new Thread(()->{result.set(interrupted.read(summary("3m",null,null)));assertThat(Thread.currentThread().isInterrupted()).isTrue();});thread.start();assertThat(running.await(2,TimeUnit.SECONDS)).isTrue();thread.interrupt();thread.join(3000);
        assertThat(result.get().path("warnings").toString()).contains("SOURCE_INTERRUPTED");assertThat(insider.acquireSlot()).isTrue();assertThat(insider.acquireSlot()).isTrue();assertThat(insider.acquireSlot()).isFalse();insider.releaseSlot();insider.releaseSlot();
    }
    @Test void httpDefaultsExactTickerAndInputsFailBeforeAnyInvocation() throws Exception {
        var adapter=mock(PerformanceAdapter.class);when(adapter.read(any())).thenAnswer(i->envelope(i.getArgument(0),"UNAVAILABLE",json));
        var http=MockMvcBuilders.standaloneSetup(new PerformanceController(adapter)).build();
        http.perform(get("/api/performance/summary")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.horizon").value("3m")).andExpect(jsonPath("$.filters.minInvestment").doesNotExist());
        for(var h:HORIZONS)http.perform(get("/api/performance/summary").param("horizon",h).param("minInvestment","0").param("minSignal","100")).andExpect(status().isOk());
        http.perform(get("/api/performance/signals").param("ticker","coo").param("limit","100").param("offset","1000000")).andExpect(status().isOk());
        http.perform(get("/api/performance/detail").param("signalId",detail().signalId())).andExpect(status().isOk());reset(adapter);
        for(var pair:List.of(new String[]{"horizon","2m"},new String[]{"horizon",""},new String[]{"minInvestment","NaN"},new String[]{"minSignal","101"},new String[]{"minSignal","-1"},new String[]{"minSignal"," 0"},new String[]{"db","private"}))
            http.perform(get("/api/performance/summary").param(pair[0],pair[1])).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
        http.perform(get("/api/performance/summary").param("horizon","1d","3m")).andExpect(status().isBadRequest());
        for(var pair:List.of(new String[]{"ticker"," COO"},new String[]{"ticker","C:\\db"},new String[]{"limit","0"},new String[]{"limit","101"},new String[]{"offset","1000001"},new String[]{"offset","1.1"},new String[]{"cli","bad"}))
            http.perform(get("/api/performance/signals").param(pair[0],pair[1])).andExpect(status().isBadRequest());
        for(var id:List.of("report:2026-02-29:COO","sec:2026-09-30:COO","report:2026-09-30:C:db","report:0000-01-01:COO"))http.perform(get("/api/performance/detail").param("signalId",id)).andExpect(status().isBadRequest());
        http.perform(get("/api/performance/detail")).andExpect(status().isBadRequest());verifyNoInteractions(adapter);
    }
    @Test void unavailableDisabledUnconfiguredAndUnsupportedAreTruthful() throws Exception {
        for(var c:List.of(new InsiderProperties(false,"","",10),new InsiderProperties(true,"","",10))) {
            var a=new PerformanceAdapter(c,new InsiderSignalsAdapter(c,json),json);var r=a.read(summary("3m",null,null));assertThat(r.path("dataState").asText()).isEqualTo("UNAVAILABLE");assertThat(r.path("provenance").path("lastObservedAt").isNull()).isTrue();
        }
        var s=source("summary").put("contract_version",2);assertThatThrownBy(()->normalize(s,summary("3m",null,null))).isInstanceOf(Unsupported.class);
    }
}
