package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class InsiderSecAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    ObjectNode source() throws Exception { return (ObjectNode) json.readTree(getClass().getResourceAsStream("/fixtures/sec-transactions-v1.json")); }
    InsiderSignalsAdapter adapter() { return new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),json); }
    @Test void preservesNonPDerivativeAmendmentOwnersFootnotesNullsAndAllDates() throws Exception {
        var response = adapter().normalizeSec(source(), null,50,0); var rows = response.path("items");
        assertThat(rows.size()).isEqualTo(3);
        assertThat(rows.get(0).path("candidateOpenMarketPurchase").booleanValue()).isTrue();
        assertThat(rows.get(0).path("reviewRequired").booleanValue()).isTrue();
        assertThat(rows.get(1).path("transactionCode").textValue()).isEqualTo("S");
        assertThat(rows.get(1).path("shares").intValue()).isZero();
        assertThat(rows.get(2).path("securityType").textValue()).isEqualTo("derivative");
        assertThat(rows.get(2).path("qualityFlags").toString()).contains("AMENDMENT_REQUIRES_RECONCILIATION");
        assertThat(rows.get(2).path("insiderExecutionPrice").isNull()).isTrue();
        assertThat(rows.get(2).path("isDirect").isNull()).isTrue();
        assertThat(rows.get(0).path("is10b51").isNull()).isTrue();
        assertThat(rows.get(0).path("reportingOwners").size()).isEqualTo(2);
        assertThat(rows.get(0).path("reportingOwners").get(1).path("name").isNull()).isTrue();
        assertThat(rows.get(0).path("footnotes").get(0).path("id").textValue()).isEqualTo("F1");
        assertThat(rows.get(0).path("filingAcceptedAt").textValue()).isEqualTo("2026-09-29T18:00:00Z");
        assertThat(rows.get(0).path("eventDate").textValue()).isEqualTo("2026-09-28");
        assertThat(rows.get(0).path("filingDate").textValue()).isEqualTo("2026-09-29");
        assertThat(rows.get(0).path("discoveryBasis").textValue()).isEqualTo("first_local_ingestion");
        assertThat(rows.get(0).path("provenance").size()).isEqualTo(2);
        assertThat(response.toString()).doesNotContain("private", "location", "scores", "positiveReasons", "https://", "file://", "metadata");
        assertThat(response.path("sources").get(0).path("lastObservedAt").textValue()).isEqualTo(response.path("observedAt").textValue());
    }
    @Test void rejectsWrongVersionSourceTypeIdentityAndScores() throws Exception {
        for (String version : List.of("2","4294967297","18446744073709551617")) {
            var data = source(); data.set("contract_version",json.readTree(version));
            assertThatThrownBy(() -> adapter().normalizeSec(data,null,50,0)).isInstanceOf(InsiderSignalsAdapter.InvalidContract.class);
        }
        var report = source().put("source","reports");
        assertThatThrownBy(() -> adapter().normalizeSec(report,null,50,0)).isInstanceOf(InsiderSignalsAdapter.InvalidContract.class);
        for (String key : List.of("signal_id","signal_type")) {
            var data = source(); ((ObjectNode)data.path("signals").get(0)).put(key,key.equals("signal_id") ? "report:QA" : "ai_report_assessment");
            assertThatThrownBy(() -> adapter().normalizeSec(data,null,50,0)).isInstanceOf(IllegalStateException.class);
        }
        var scored = source(); ((ObjectNode)scored.path("signals").get(0).path("scores").path("signal")).put("value",95);
        assertThatThrownBy(() -> adapter().normalizeSec(scored,null,50,0)).isInstanceOf(IllegalStateException.class);
        var duplicate = source(); ((ObjectNode)duplicate.path("signals").get(1)).put("signal_id",duplicate.path("signals").get(0).path("signal_id").textValue());
        assertThatThrownBy(() -> adapter().normalizeSec(duplicate,null,50,0)).isInstanceOf(IllegalStateException.class);
    }
    @Test void strictlyValidatesMetadataWithoutBooleanOrNumberCoercion() throws Exception {
        for (String key : List.of("is_direct","is_10b5_1","candidate_open_market_purchase","review_required","shares","transaction_index","reporting_owners","footnotes")) {
            var data = source(); ((ObjectNode)data.path("signals").get(0).path("metadata")).put(key,"true");
            assertThatThrownBy(() -> adapter().normalizeSec(data,null,50,0)).as(key).isInstanceOf(IllegalStateException.class);
        }
        var owners = source(); ((ObjectNode)owners.path("signals").get(0).path("metadata").path("reporting_owners").get(0)).put("roles","director");
        assertThatThrownBy(() -> adapter().normalizeSec(owners,null,50,0)).isInstanceOf(IllegalStateException.class);
        var notes = source(); ((ObjectNode)notes.path("signals").get(0).path("metadata").path("footnotes")).put("F1",false);
        assertThatThrownBy(() -> adapter().normalizeSec(notes,null,50,0)).isInstanceOf(IllegalStateException.class);
        var ref = source(); ((ObjectNode)ref.path("signals").get(0).path("source_references").get(0)).put("kind","git_report");
        assertThatThrownBy(() -> adapter().normalizeSec(ref,null,50,0)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> adapter().normalizeSec(source(),"OTHER",50,0)).isInstanceOf(IllegalStateException.class);
    }
    @Test void pagesEmptyBoundsAndFixedSecOperation() throws Exception {
        assertThat(adapter().secCommand("QA",50,100)).containsExactly("","--db","","list-signals","--source","sec","--limit","50","--offset","100","--ticker","QA");
        for (int limit : List.of(0,101)) assertThatThrownBy(() -> adapter().readSec(null,limit,0)).isInstanceOf(IllegalArgumentException.class);
        for (int offset : List.of(-1,1_000_001)) assertThatThrownBy(() -> adapter().readSec(null,50,offset)).isInstanceOf(IllegalArgumentException.class);
        var empty = source(); empty.set("signals",json.createArrayNode());
        assertThat(adapter().normalizeSec(empty,null,50,0).path("dataState").textValue()).isEqualTo("EMPTY");
        var page = source().put("limit",3).put("has_more",true).put("next_offset",3);
        assertThat(adapter().normalizeSec(page,null,3,0).path("page").path("nextOffset").intValue()).isEqualTo(3);
        page.put("next_offset",4); assertThatThrownBy(() -> adapter().normalizeSec(page,null,3,0)).isInstanceOf(IllegalStateException.class);
        assertThat(adapter().readSec(null,50,0).path("sources").get(0).path("lastObservedAt").isNull()).isTrue();
    }
    @Test void actualSubprocessSecKeepsBoundsStrictParsingTimeoutCleanupAndPrivacy() throws Exception {
        Path fixture = temp.resolve("SEC 中文.json"), cli = temp.resolve("cli.exe"), db = temp.resolve("db.sqlite");
        Files.writeString(fixture,source().toString()); Files.writeString(cli,"fixture"); Files.writeString(db,"unchanged");
        for (String mode : List.of("ok","stdout","stderr","exit","timeout","invalid","utf8","duplicate","trailing")) {
            var processes = new ArrayList<Process>();
            var a = new InsiderSignalsAdapter(new InsiderProperties(true,cli.toString(),db.toString(),1),json) {
                @Override Process start(List<String> command) throws java.io.IOException {
                    assertThat(command).containsExactly(cli.toString(),"--db",db.toString(),"list-signals","--source","sec","--limit","50","--offset","0");
                    var p = new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),SignalsProcessFixture.class.getName(),mode,fixture.toString()).start(); processes.add(p); return p;
                }
            };
            var response = a.readSec(null,50,0);
            assertThat(response.path("dataState").textValue()).as(mode).isEqualTo(mode.equals("ok") ? "READY" : List.of("exit","timeout").contains(mode) ? "UNAVAILABLE" : "ERROR");
            assertThat(response.toString()).doesNotContain(temp.toString(),"private", "sensitive", "html>");
            if (!mode.equals("ok")) assertThat(response.path("sources").get(0).path("lastObservedAt").isNull()).isTrue();
            for (var p : processes) { p.waitFor(3,java.util.concurrent.TimeUnit.SECONDS); assertThat(p.isAlive()).isFalse(); }
        }
        assertThat(Files.readString(db)).isEqualTo("unchanged");
    }
}
