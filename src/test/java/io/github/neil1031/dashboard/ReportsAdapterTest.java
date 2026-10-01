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

class ReportsAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json=new ObjectMapper();
    ObjectNode fixture(boolean detail) throws Exception { return (ObjectNode)json.readTree(getClass().getResourceAsStream("/fixtures/reports-"+(detail?"detail":"list")+"-v1.json")); }
    InsiderSignalsAdapter disabled() {return new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),json);}
    ObjectNode normalized(boolean detail) throws Exception {return ReportProjection.normalize(fixture(detail),detail?"2026-09-30":null,20,0,detail,json);}
    @Test void closedCommandsAndRealCalendarBoundsBeforeAnyRead() {
        var a=disabled();
        assertThat(a.reportsCommand(null,20,0)).containsExactly("","--db","","list-reports","--limit","20","--offset","0");
        assertThat(a.reportsCommand("2026-09-30",1,100)).containsExactly("","--db","","list-reports","--limit","1","--offset","100","--date","2026-09-30");
        assertThat(a.reportCommand("2026-09-30",1,100)).containsExactly("","--db","","get-report","--report-date","2026-09-30","--revision-limit","1","--revision-offset","100");
        for(var bad:List.of("2026-02-29","2026-04-31","0000-01-01","20260930","2026-9-30"," 2026-09-30","2026-09-30T00:00:00Z","--help","C:\\private\\db")) {
            assertThatThrownBy(()->a.readReports(bad,20,0)).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(()->a.readReport(bad,20,0)).isInstanceOf(IllegalArgumentException.class);
        }
        for(var date:List.of("2024-02-29","0001-01-01","9999-12-31"))assertThat(a.readReport(date,100,1_000_000).path("dataState").asText()).isEqualTo("UNAVAILABLE");
        assertThatThrownBy(()->a.readReport(null,20,0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->a.readReport("",20,0)).isInstanceOf(IllegalArgumentException.class);
        for(var size:List.of(0,101))assertThatThrownBy(()->a.readReports(null,size,0)).isInstanceOf(IllegalArgumentException.class);
        for(var offset:List.of(-1,1_000_001))assertThatThrownBy(()->a.readReport("2026-09-30",20,offset)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void listAllowlistCountsNullsAndExplicitWarningRedaction() throws Exception {
        var source=fixture(false);((ObjectNode)source.path("reports").get(0)).withArray("parse_warnings").add("C:\\private\\warning.txt");
        var result=ReportProjection.normalize(source,null,20,0,false,json);var item=result.path("items").get(0);
        assertThat(item.path("storedSignalCount").asInt()).isEqualTo(3);assertThat(item.path("activeSignalCount").asInt()).isEqualTo(2);
        assertThat(item.path("revisionCount").asInt()).isEqualTo(3);assertThat(item.path("createdAt").isNull()).isTrue();
        assertThat(result.toString()).contains("SOURCE_WARNING_LOCAL_PATH_REDACTED","[local path omitted]").doesNotContain("source_file","rawMarkdown","private","excluded from list");
        assertThat(result.path("sources").get(0).path("lastObservedAt")).isEqualTo(result.path("observedAt"));
        assertThat(item.fieldNames()).toIterable().containsExactlyInAnyOrder("reportId","reportDate","importedAt","contentHash","parseWarnings","storedSignalCount","activeSignalCount","revisionCount","createdAt","updatedAt");
    }
    @Test void firstMiddleFinalEmptyListPagesAndPublicCap() throws Exception {
        for(int offset:List.of(0,2,4,5)) {
            var data=fixture(false);var rows=json.createArrayNode();
            for(int i=offset;i<Math.min(offset+2,5);i++){var row=((ObjectNode)data.path("reports").get(0)).deepCopy();String date="2026-09-"+(30-i);row.put("reportDate",date);row.put("report_date",date).put("report_id","report:"+date);rows.add(row);}
            data.set("reports",rows);boolean more=offset+2<5;data.put("limit",2).put("offset",offset).put("has_more",more);if(more)data.put("next_offset",offset+2);else data.putNull("next_offset");
            var result=ReportProjection.normalize(data,null,2,offset,false,json);assertThat(result.path("items").size()).isEqualTo(rows.size());assertThat(result.path("page").path("hasMore").asBoolean()).isEqualTo(more);
        }
        var cap=fixture(false).put("limit",1).put("offset",1_000_000).put("has_more",true).put("next_offset",1_000_001);
        var result=ReportProjection.normalize(cap,null,1,1_000_000,false,json);assertThat(result.path("page").path("hasMore").asBoolean()).isFalse();assertThat(result.toString()).contains("PAGINATION_BOUND_REACHED");
    }
    @Test void bodyIsExactUnicodeHtmlAndPathTextNoSilentTruncation() throws Exception {
        var data=fixture(true);String body=data.path("report").path("raw_markdown").textValue()+"中🚀".repeat(30_000);((ObjectNode)data.path("report")).put("raw_markdown",body);
        var result=ReportProjection.normalize(data,"2026-09-30",20,0,true,json);
        assertThat(result.path("item").path("rawMarkdown").textValue()).isEqualTo(body).contains("C:\\source-authored\\literal.txt","<script>","🚀");
        assertThat(result.toString()).doesNotContain("source_file","C:\\private\\source.md");
    }
    @Test void currentRevisionOutsidePageMissingNullAndEmptyPageRemainTruthful() throws Exception {
        for(int offset:List.of(0,1,2,3)) {
            var data=fixture(true);var report=(ObjectNode)data.path("report");var all=report.withArray("revisions").deepCopy();var rows=report.putArray("revisions");if(offset<3)rows.add(all.get(offset));
            report.withObject("revision_pagination").put("limit",1).put("offset",offset).put("has_more",offset<2);if(offset<2)report.withObject("revision_pagination").put("next_offset",offset+1);else report.withObject("revision_pagination").putNull("next_offset");
            var result=ReportProjection.normalize(data,"2026-09-30",1,offset,true,json);
            assertThat(result.path("dataState").asText()).isEqualTo("READY");assertThat(result.path("item").path("currentRevisionId").asInt()).isEqualTo(1);
            assertThat(result.path("item").path("revisions").size()).isEqualTo(offset<3?1:0);
        }
        var missing=fixture(true);var report=(ObjectNode)missing.path("report");report.put("content_hash","unmatched").put("current_revision_status","MISSING").putNull("current_revision_id");
        for(var row:report.withArray("revisions"))((ObjectNode)row).put("is_current",false);
        assertThat(ReportProjection.normalize(missing,"2026-09-30",20,0,true,json).path("item").path("currentRevisionId").isNull()).isTrue();
    }
    @Test void malformedVersionsFieldsIdentityCountsWarningsAndRevisionFlagsFailClosed() throws Exception {
        for(var key:List.of("contract_version","source")){var bad=fixture(false);if(key.equals("source"))bad.put(key,"sec");else bad.put(key,2);assertThatThrownBy(()->ReportProjection.normalize(bad,null,20,0,false,json)).isInstanceOf(InsiderSignalsAdapter.InvalidContract.class);}
        for(var key:List.of("report_date","report_id","parse_warnings","stored_signal_count","active_signal_count","revision_count","content_hash")) {
            var bad=fixture(false);var row=(ObjectNode)bad.path("reports").get(0);row.set(key,json.createObjectNode().put("private","C:\\private\\db"));
            assertThatThrownBy(()->ReportProjection.normalize(bad,null,20,0,false,json)).isInstanceOf(RuntimeException.class);
        }
        var mismatch=fixture(false);assertThatThrownBy(()->ReportProjection.normalize(mismatch,"2026-09-29",20,0,false,json)).isInstanceOf(RuntimeException.class);
        var invalid=fixture(true);((ObjectNode)invalid.path("report").path("revisions").get(0)).put("is_current",true);
        assertThatThrownBy(()->ReportProjection.normalize(invalid,"2026-09-30",20,0,true,json)).isInstanceOf(RuntimeException.class);
    }
    @Test void actualChildReadsBothClosedOperationsStrictUtf8JsonBoundsTimeoutAndCleanup() throws Exception {
        Path cli=temp.resolve("trusted reports cli.exe"),db=temp.resolve("untouched.sqlite"),fixture=temp.resolve("fixture.json");Files.writeString(cli,"identity");Files.writeString(db,"unchanged");
        for(boolean detail:List.of(false,true))for(var mode:List.of("ok","stdout","stderr","exit","timeout","invalid","utf8","duplicate","trailing","version")) {
            var data=fixture(detail);if(mode.equals("version"))data.put("contract_version",999);Files.writeString(fixture,data.toString());var children=new ArrayList<Process>();var commands=new ArrayList<List<String>>();
            var adapter=new InsiderSignalsAdapter(new InsiderProperties(true,cli.toString(),db.toString(),1),json){@Override Process start(List<String> command)throws java.io.IOException {
                commands.add(command);var child=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),SignalsProcessFixture.class.getName(),mode.equals("version")?"ok":mode,fixture.toString()).start();children.add(child);return child;}};
            var result=detail?adapter.readReport("2026-09-30",20,0):adapter.readReports(null,20,0);
            String state=mode.equals("ok")?"READY":List.of("exit","timeout","version").contains(mode)?"UNAVAILABLE":"ERROR";
            assertThat(result.path("dataState").asText()).as(mode+" "+detail).isEqualTo(state);
            assertThat(result.toString()).doesNotContain(temp.toString(),"secret","sensitive","private");
            assertThat(commands).hasSize(1);assertThat(commands.get(0)).contains(detail?"get-report":"list-reports");
            for(var child:children){child.waitFor(3,TimeUnit.SECONDS);assertThat(child.isAlive()).isFalse();}
        }
        assertThat(Files.readString(db)).isEqualTo("unchanged");
    }
    @Test void reportsAndSignalsShareTheExistingTwoProcessSlots() throws Exception {
        Path cli=temp.resolve("cli.exe"),db=temp.resolve("db.sqlite");Files.writeString(cli,"fixture");Files.writeString(db,"fixture");var started=new CountDownLatch(2);var children=new CopyOnWriteArrayList<Process>();
        var adapter=new InsiderSignalsAdapter(new InsiderProperties(true,cli.toString(),db.toString(),2),json){@Override Process start(List<String> command)throws java.io.IOException{
            var child=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),SignalsProcessFixture.class.getName(),"timeout","unused").start();children.add(child);started.countDown();return child;}};
        var a=CompletableFuture.supplyAsync(()->adapter.readReports(null,20,0));var b=CompletableFuture.supplyAsync(()->adapter.readReport("2026-09-30",20,0));assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();
        assertThat(adapter.readSec(null,50,0).path("warnings").toString()).contains("SOURCE_BUSY");assertThat(children).hasSize(2);a.get(5,TimeUnit.SECONDS);b.get(5,TimeUnit.SECONDS);for(var child:children)assertThat(child.isAlive()).isFalse();
    }
    @Test void controllerRejectsInvalidQueriesNoStoreBeforeAnyOperation() throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class);var mvc=MockMvcBuilders.standaloneSetup(new ReportsController(adapter,json)).build();
        for(var endpoint:List.of("/api/reports/us-insider","/api/reports/us-insider/detail")) {
            String date=endpoint.endsWith("detail")?"reportDate":"date",size=endpoint.endsWith("detail")?"revisionLimit":"limit",offset=endpoint.endsWith("detail")?"revisionOffset":"offset";
            for(var bad:List.of("0000-01-01","2026-02-29","2026-04-31","--help","2026-9-30"))mvc.perform(get(endpoint).param(date,bad)).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
            for(var bad:List.of("0","101","2147483648","hello"))mvc.perform(get(endpoint).param(date,"2026-09-30").param(size,bad)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REPORTS_QUERY"));
            for(var bad:List.of("-1","1000001","9223372036854775808","hello"))mvc.perform(get(endpoint).param(date,"2026-09-30").param(offset,bad)).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/reports/us-insider/detail")).andExpect(status().isBadRequest());verifyNoInteractions(adapter);
    }
    @Test void existingDetailUsesOnlyGetAndMissingUsesBoundedExactDateListNotStderr() throws Exception {
        var adapter=mock(InsiderSignalsAdapter.class);var mvc=MockMvcBuilders.standaloneSetup(new ReportsController(adapter,json)).build();
        when(adapter.readReport("2026-09-30",20,0)).thenReturn(normalized(true));
        mvc.perform(get("/api/reports/us-insider/detail").param("reportDate","2026-09-30")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.item.currentRevisionStatus").value("MATCHED"));verify(adapter).readReport("2026-09-30",20,0);verifyNoMoreInteractions(adapter);
        reset(adapter);var failure=ReportProjection.envelope("UNAVAILABLE",20,0,true,json);failure.withArray("warnings").add("SOURCE_READ_FAILED");when(adapter.readReport("2026-09-29",20,0)).thenReturn(failure);
        when(adapter.readReports("2026-09-29",1,0)).thenReturn(ReportProjection.envelope("EMPTY",1,0,false,json));
        mvc.perform(get("/api/reports/us-insider/detail").param("reportDate","2026-09-29")).andExpect(status().isOk()).andExpect(jsonPath("$.dataState").value("EMPTY")).andExpect(jsonPath("$.item").isEmpty());
        verify(adapter).readReport("2026-09-29",20,0);verify(adapter).readReports("2026-09-29",1,0);verifyNoMoreInteractions(adapter);
    }
}
