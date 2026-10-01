package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class InsiderSignalsAdapterTest {
    @TempDir Path temp;
    final ObjectMapper json = new ObjectMapper();
    ObjectNode source() throws Exception {
        return (ObjectNode) json.readTree(getClass().getResourceAsStream("/fixtures/report-signals-v1.json"));
    }
    InsiderSignalsAdapter adapter() { return new InsiderSignalsAdapter(new InsiderProperties(false, "", "", 10), json); }
    @Test void mapsActualContractPreservingNullsDatesQualityAndPrivateBoundary() throws Exception {
        var data = source(); var row = (ObjectNode) data.path("signals").get(0);
        row.put("company_name", "中文 <img src=x onerror=evil()> C:\\private\\report.txt");
        var result = adapter().normalize(data, null, 50, 0);
        var item = result.path("items").get(0);
        assertThat(result.path("dataState").asText()).isEqualTo("READY");
        assertThat(item.path("scores").path("investment").path("value").isNull()).isTrue();
        assertThat(item.path("reportDate").asText()).isEqualTo("2026-09-30");
        assertThat(item.path("eventDate").asText()).isEqualTo("2026-09-28");
        assertThat(item.path("approximatePurchaseAmount").isNull()).isTrue();
        assertThat(item.path("qualityFlags").size()).isEqualTo(2);
        assertThat(item.path("listedBuyerCount").asInt()).isEqualTo(1);
        assertThat(item.path("provenance").get(0).path("contentHash").asText()).hasSize(64);
        assertThat(result.toString()).contains("Imported AI report", "中文", "[local path omitted]")
                .doesNotContain("location", "private", "source_excerpt", "suggested_position");
        assertThat(result.path("sources").get(0).path("lastObservedAt").asText()).isEqualTo(result.path("observedAt").asText());
        row.put("ticker", "qa"); assertThat(adapter().normalize(data, "QA", 50, 0).path("dataState").asText()).isEqualTo("READY");
    }
    @Test void fixedArgsBoundsExactTickerAndNoShell() {
        var a = adapter();
        assertThat(a.command("BRK.B", 50, 100)).containsExactly("", "--db", "", "list-signals", "--source", "reports", "--limit", "50", "--offset", "100", "--ticker", "BRK.B");
        assertThat(InsiderSignalsAdapter.ticker(" coo ")).isEqualTo("COO");
        for (String bad : List.of("", " ", "--help", "A;exit", "../x", "A B", "A".repeat(17))) assertThatThrownBy(() -> a.read(bad, 50, 0)).isInstanceOf(IllegalArgumentException.class);
        for (int limit : List.of(0, 101)) assertThatThrownBy(() -> a.read(null, limit, 0)).isInstanceOf(IllegalArgumentException.class);
        for (int offset : List.of(-1, 1_000_001)) assertThatThrownBy(() -> a.read(null, 50, offset)).isInstanceOf(IllegalArgumentException.class);
        var disabled = a.read(null, 50, 0);
        assertThat(disabled.path("dataState").asText()).isEqualTo("UNAVAILABLE");
        assertThat(disabled.path("sources").get(0).path("lastObservedAt").isNull()).isTrue();
    }
    @Test void unknownOrOverflowVersionsPagesIdentitiesAndMalformedRowsFailClosed() throws Exception {
        for (String field : List.of("contract_version", "limit", "offset", "next_offset")) {
            var s = source(); s.set(field, BigIntegerNode.valueOf(new java.math.BigInteger("18446744078004518913")));
            assertThatThrownBy(() -> adapter().normalize(s, null, 50, 0)).isInstanceOf(RuntimeException.class);
        }
        var version = source(); version.put("contract_version", 4294967297L);
        assertThatThrownBy(() -> adapter().normalize(version, null, 50, 0)).isInstanceOf(InsiderSignalsAdapter.InvalidContract.class);
        var invalid = source(); ((ObjectNode)invalid.path("signals").get(0).path("source_references").get(0)).set("record_id", BigIntegerNode.valueOf(new java.math.BigInteger("18446744073709551617")));
        assertThatThrownBy(() -> adapter().normalize(invalid, null, 50, 0)).isInstanceOf(RuntimeException.class);
        var sec = source().put("source", "sec"); assertThatThrownBy(() -> adapter().normalize(sec, null, 50, 0)).isInstanceOf(InsiderSignalsAdapter.InvalidContract.class);
        var missing = source(); ((ObjectNode)missing.path("signals").get(0)).remove("scores");
        assertThatThrownBy(() -> adapter().normalize(missing, null, 50, 0)).isInstanceOf(RuntimeException.class);
        var mismatch = source(); assertThatThrownBy(() -> adapter().normalize(mismatch, "OTHER", 50, 0)).isInstanceOf(RuntimeException.class);
    }
    @Test void emptyAndPageConsistency() throws Exception {
        var empty = source(); empty.set("signals", json.createArrayNode());
        assertThat(adapter().normalize(empty, null, 50, 0).path("dataState").asText()).isEqualTo("EMPTY");
        var page = source().put("limit", 1).put("has_more", true).put("next_offset", 1);
        assertThat(adapter().normalize(page, null, 1, 0).path("page").path("hasMore").asBoolean()).isTrue();
        page.put("next_offset", 2); assertThatThrownBy(() -> adapter().normalize(page, null, 1, 0)).isInstanceOf(RuntimeException.class);
    }
    @Test void realProcessUtf8FloodNonzeroTimeoutInvalidAndCleanup() throws Exception {
        Path fixture = temp.resolve("中文 fixture.json"), cli = temp.resolve("trusted cli.exe"), db = temp.resolve("db with space.sqlite");
        Files.writeString(fixture, source().toString()); Files.writeString(cli, "fixture identity"); Files.writeString(db, "unchanged");
        for (String mode : List.of("ok", "stdout", "stderr", "exit", "timeout", "invalid", "utf8", "duplicate", "trailing")) {
            var processes = new ArrayList<Process>(); var commands = new ArrayList<List<String>>();
            var a = new InsiderSignalsAdapter(new InsiderProperties(true, cli.toString(), db.toString(), 1), json) {
                @Override Process start(List<String> command) throws java.io.IOException {
                    commands.add(command);
                    var p = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"),
                            SignalsProcessFixture.class.getName(), mode, fixture.toString()).start(); processes.add(p); return p;
                }
            };
            var response = a.read(null, 50, 0);
            String expected = mode.equals("ok") ? "READY" : List.of("exit", "timeout").contains(mode) ? "UNAVAILABLE" : "ERROR";
            assertThat(response.path("dataState").asText()).as(mode).isEqualTo(expected);
            assertThat(response.toString()).doesNotContain(temp.toString(), "secret", "sensitive", "html>");
            assertThat(commands.get(0)).containsExactly(cli.toString(), "--db", db.toString(), "list-signals", "--source", "reports", "--limit", "50", "--offset", "0");
            for (var p : processes) { p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS); assertThat(p.isAlive()).isFalse(); }
            if (!mode.equals("ok")) assertThat(response.path("sources").get(0).path("lastObservedAt").isNull()).isTrue();
        }
        assertThat(Files.readString(db)).isEqualTo("unchanged");
    }
}
