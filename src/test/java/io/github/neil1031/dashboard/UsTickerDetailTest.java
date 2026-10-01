package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class UsTickerDetailTest {
    final ObjectMapper json = new ObjectMapper();
    ObjectNode section(String source, String state, int limit, int offset) throws Exception {
        var raw = json.readTree(getClass().getResourceAsStream("/fixtures/" + (source.equals("reports") ? "report-signals-v1.json" : "sec-transactions-v1.json")));
        var normalizer = new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),json);
        var result = source.equals("reports") ? normalizer.normalize(raw,null,50,0) : normalizer.normalizeSec(raw,null,50,0);
        for (var item : result.withArray("items")) ((ObjectNode)item).put("ticker","QA");
        result.withObject("page").put("limit",limit).put("offset",offset);
        if (!state.equals("READY")) result.withArray("items").removeAll();
        result.put("dataState",state);
        if (state.equals("UNAVAILABLE") || state.equals("ERROR")) ((ObjectNode)result.withArray("sources").get(0)).putNull("lastObservedAt");
        return result;
    }
    static Stream<Arguments> states() {
        String[] states={"READY","EMPTY","UNAVAILABLE","ERROR"};
        // Rows are Reports, columns are SEC. No usable source + ERROR is aggregate ERROR.
        String[][] expected={{"READY","READY","PARTIAL","PARTIAL"},{"READY","EMPTY","PARTIAL","PARTIAL"},
            {"PARTIAL","PARTIAL","UNAVAILABLE","ERROR"},{"PARTIAL","PARTIAL","ERROR","ERROR"}};
        return java.util.stream.IntStream.range(0,4).boxed().flatMap(a->java.util.stream.IntStream.range(0,4).mapToObj(b->Arguments.of(states[a],states[b],expected[a][b])));
    }
    @ParameterizedTest @MethodSource("states")
    void independentEnvelopesAndEveryAggregateState(String a, String b, String expected) throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class); var signals=section("reports",a,50,0);var sec=section("sec",b,50,0);
        when(adapter.read("QA",50,0)).thenReturn(signals);when(adapter.readSec("QA",50,0)).thenReturn(sec);
        var result=new UsTickerDetailService(adapter,json).read(" qa ",50,0,50,0);
        assertThat(result.path("ticker").asText()).isEqualTo("QA");assertThat(result.path("dataState").asText()).isEqualTo(expected);
        assertThat(result.path("sections").path("signals")).isEqualTo(signals);
        assertThat(result.path("sections").path("secTransactions")).isEqualTo(sec);
        assertThat(result.has("items")).isFalse();assertThat(result.has("scores")).isFalse();
        verify(adapter).read("QA",50,0);verify(adapter).readSec("QA",50,0);verifyNoMoreInteractions(adapter);
    }
    @Test void sameTickerDatesAndPersonNeverJoinOrEraseSourceIdentities() throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class);var a=section("reports","READY",50,0);var b=section("sec","READY",50,0);
        var aCount=a.path("items").size();var bCount=b.path("items").size();
        when(adapter.read("QA",50,0)).thenReturn(a);when(adapter.readSec("QA",50,0)).thenReturn(b);
        var result=new UsTickerDetailService(adapter,json).read("QA",50,0,50,0);
        assertThat(result.path("sections").path("signals").path("items").size()).isEqualTo(aCount);
        assertThat(result.path("sections").path("secTransactions").path("items").size()).isEqualTo(bCount);
        assertThat(result.toString()).contains("report:","sec:","imported_ai_report","SAME_TICKER_IS_NOT_EVENT_LINKAGE","NOT_PIT_SNAPSHOT");
        assertThat(result.path("sections").path("secTransactions").path("items").get(0).has("scores")).isFalse();
        assertThat(result.toString()).doesNotContain("location", "performance-summary", "C:\\", "F:\\");
        assertThat(result.path("sections").path("signals")).isNotSameAs(a);
    }
    @Test void pagingIsIndependentAndOtherSectionRetainsItsOwnObservation() throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class);var a=section("reports","READY",10,20);var b=section("sec","READY",7,35);
        when(adapter.read("QA",10,20)).thenReturn(a);when(adapter.readSec("QA",7,35)).thenReturn(b);
        var result=new UsTickerDetailService(adapter,json).read("QA",10,20,7,35);
        assertThat(result.path("sections").path("signals").path("page")).isEqualTo(a.path("page"));
        assertThat(result.path("sections").path("secTransactions").path("page")).isEqualTo(b.path("page"));
        assertThat(result.path("sections").path("signals").path("observedAt")).isEqualTo(a.path("observedAt"));
        verify(adapter).read("QA",10,20);verify(adapter).readSec("QA",7,35);
    }
    @Test void malformedSectionsAndExceptionsBecomeSafeErrorWithoutLosingGoodSection() throws Exception {
        for (boolean failedReports : List.of(false,true)) for (String malformed : List.of("null","page","ticker","state","exception")) {
            var adapter=mock(InsiderSignalsAdapter.class);var good=section(failedReports?"sec":"reports","READY",50,0);
            var bad=section(failedReports?"reports":"sec","READY",50,0);
            switch(malformed) { case "null" -> bad=null;case "page" -> bad.withObject("page").put("limit",99);
                case "ticker" -> ((ObjectNode)bad.withArray("items").get(0)).put("ticker","OTHER");case "state" -> bad.put("dataState","STALE"); }
            when(adapter.read("QA",50,0)).thenReturn(failedReports?bad:good);
            when(adapter.readSec("QA",50,0)).thenReturn(failedReports?good:bad);
            if(malformed.equals("exception")) { if(failedReports)when(adapter.read("QA",50,0)).thenThrow(new IllegalStateException("F:\\private\\db stderr secret"));
                else when(adapter.readSec("QA",50,0)).thenThrow(new IllegalStateException("F:\\private\\db stderr secret")); }
            var result=new UsTickerDetailService(adapter,json).read("QA",50,0,50,0);
            assertThat(result.path("dataState").asText()).isEqualTo("PARTIAL");
            assertThat(result.path("sections").path(failedReports?"secTransactions":"signals")).isEqualTo(good);
            assertThat(result.path("sections").path(failedReports?"signals":"secTransactions").path("dataState").asText()).isEqualTo("ERROR");
            assertThat(result.toString()).doesNotContain("private","stderr","secret");
        }
    }
    @Test void apiIsNoStoreRequiredExactAndBoundedBeforeAnySourceRead() throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class);var mvc=MockMvcBuilders.standaloneSetup(new UsTickerDetailController(new UsTickerDetailService(adapter,json))).build();
        mvc.perform(get("/api/us/ticker-detail")).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
        for(String ticker:List.of(""," ","abcdefghijklmnopq","A B",".QA","-QA","台積電","C:\\secret\\db"))
            mvc.perform(get("/api/us/ticker-detail").param("ticker",ticker)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_TICKER_DETAIL_QUERY"));
        for(String param:List.of("signalsLimit","secLimit"))for(String v:List.of("0","101","2147483648","hello"))
            mvc.perform(get("/api/us/ticker-detail").param("ticker","QA").param(param,v)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
        for(String param:List.of("signalsOffset","secOffset"))for(String v:List.of("-1","1000001","9223372036854775808"))
            mvc.perform(get("/api/us/ticker-detail").param("ticker","QA").param(param,v)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
        verifyNoInteractions(adapter);
        when(adapter.read("QA",50,0)).thenReturn(section("reports","READY",50,0));when(adapter.readSec("QA",50,0)).thenReturn(section("sec","EMPTY",50,0));
        mvc.perform(get("/api/us/ticker-detail").param("ticker"," qa ")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.ticker").value("QA")).andExpect(jsonPath("$.dataState").value("READY")).andExpect(jsonPath("$.items").doesNotExist())
            .andExpect(jsonPath("$.sections.signals.items[0].scores.signal.origin").value("imported_ai_report"));
        verify(adapter).read("QA",50,0);verify(adapter).readSec("QA",50,0);
    }
    @Test void maximumBoundsAndExactTickerPunctuationStaySupported() {
        var adapter=new InsiderSignalsAdapter(new InsiderProperties(false,"","",30),json);
        var service=new UsTickerDetailService(adapter,json);
        for(String ticker:List.of(" brk.b ","brk-b","a123456789012345")) {
            var result=service.read(ticker,100,1_000_000,1,1_000_000);
            assertThat(result.path("ticker").asText()).isEqualTo(ticker.trim().toUpperCase(java.util.Locale.ROOT));
            assertThat(result.path("dataState").asText()).isEqualTo("UNAVAILABLE");
        }
    }
}
