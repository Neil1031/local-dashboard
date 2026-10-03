package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.OffsetDateTime;
import java.time.Instant;
import java.util.*;

/** Validates consumed v1 fields. Never calculates returns, buckets or stored states. */
final class PerformanceProjection {
    static final List<String> HORIZONS = List.of("1d", "1w", "1m", "3m", "6m");
    static final List<String> BUCKETS = List.of("<85", "85-89", "90-94", "95+", "UNSCORED");
    static final List<String> SNAPSHOTS = List.of("discovery", "next_tradable", "1d", "1w", "1m", "3m", "6m");
    static final Set<String> STATUSES = Set.of("COMPLETE", "PARTIAL", "PENDING", "NOT_COMPUTED");
    static final long SAFE_INTEGER = 9_007_199_254_740_991L;
    enum Operation { SUMMARY, LIST, DETAIL }
    record Query(Operation operation, String horizon, Double minInvestment, Double minSignal, String ticker, int limit, int offset, String signalId) {
        Query {
            if (operation == null) throw new IllegalArgumentException();
            if (operation != Operation.DETAIL && !HORIZONS.contains(horizon)) throw new IllegalArgumentException();
            threshold(minInvestment); threshold(minSignal);
            if (ticker != null) exactTicker(ticker);
            if (limit < 1 || limit > 100 || offset < 0 || offset > InsiderSignalsAdapter.MAX_OFFSET) throw new IllegalArgumentException();
            if (operation == Operation.DETAIL) identity(signalId);
        }
    }
    static void threshold(Double n) { if (n != null && (!Double.isFinite(n) || n < 0 || n > 100)) throw new IllegalArgumentException(); }
    static String exactTicker(String s) {
        if (s == null || s.isEmpty() || s.length() > 256 || s.codePoints().anyMatch(c -> c == ':' || Character.isWhitespace(c) || Character.isISOControl(c))
                || s.contains("/") || s.contains("\\") || !InsiderSignalsAdapter.safeText(s).equals(s)) throw new IllegalArgumentException();
        return s;
    }
    static String identity(String s) {
        if (s == null) throw new IllegalArgumentException(); var parts = s.split(":", -1);
        if (parts.length != 3 || !parts[0].equals("report")) throw new IllegalArgumentException();
        ReportProjection.date(parts[1], true); exactTicker(parts[2]); return s;
    }
    static final class Unsupported extends RuntimeException {}
    static ObjectNode envelope(Query q, String state, ObjectMapper json) {
        var r = json.createObjectNode().put("contractVersion", 1).put("sourceContractVersion", 1)
                .put("source", "performance").put("dataState", state).put("observedAt", Instant.now().toString());
        r.putObject("provenance").put("sourceId", "insider-performance").put("sourceVersion", 1).putNull("lastObservedAt");
        r.putArray("warnings").add("CURRENT_IMPORTED_SCORES_NOT_PIT").add("CORRELATED_SIGNAL_OBSERVATIONS");
        switch (q.operation) {
            case SUMMARY -> { r.put("horizon", q.horizon); var f = r.putObject("filters"); f.set("minInvestment", json.valueToTree(q.minInvestment)); f.set("minSignal", json.valueToTree(q.minSignal)); r.putArray("groups"); r.putNull("performanceStatusCounts"); }
            case LIST -> { r.put("horizon", q.horizon); r.set("ticker", json.valueToTree(q.ticker)); r.putArray("items"); r.putObject("page").put("limit", q.limit).put("offset", q.offset).put("hasMore", false).putNull("nextOffset"); r.withArray("warnings").add("NOT_PIT_SNAPSHOT").add("PAGES_ARE_NOT_COMPLETE_POPULATION"); }
            case DETAIL -> { r.putNull("signal"); r.putNull("performance"); r.putObject("snapshots"); }
        }
        return r;
    }
    static ObjectNode normalize(JsonNode s, Query q, ObjectMapper json) {
        object(s);
        if (!s.path("contract_version").isIntegralNumber() || !s.path("contract_version").canConvertToInt() || s.path("contract_version").intValue() != 1
                || !s.path("source").isTextual() || !s.path("source").textValue().equals("performance")) throw new Unsupported();
        var r = envelope(q, "READY", json);
        if (q.operation != Operation.DETAIL && !q.horizon.equals(text(s.get("horizon"), false))) fail();
        switch (q.operation) {
            case SUMMARY -> summary(s, q, r, json);
            case LIST -> list(s, q, r, json);
            case DETAIL -> {
                var signal = signal(s.get("signal"), json);
                if (!signal.path("signalId").asText().equals(q.signalId)) fail();
                r.set("signal", signal); r.set("performance", performance(s.get("performance"), json));
                var snapshots = s.get("snapshots"); object(snapshots);
                snapshots.fieldNames().forEachRemaining(k -> { if (!SNAPSHOTS.contains(k)) fail(); });
                var out = r.withObject("snapshots");
                for (String k : SNAPSHOTS) if (snapshots.has(k)) out.set(k, snapshot(snapshots.get(k), json));
            }
        }
        r.withObject("provenance").put("lastObservedAt", r.path("observedAt").textValue()); return r;
    }
    private static void summary(JsonNode s, Query q, ObjectNode r, ObjectMapper json) {
        var filters = s.get("filters"); object(filters);
        for (var pair : Map.of("minInvestment", q.minInvestment == null ? Double.NaN : q.minInvestment,
                "minSignal", q.minSignal == null ? Double.NaN : q.minSignal).entrySet()) {
            var n = filters.get(pair.getKey()); number(n, true);
            if (Double.isNaN(pair.getValue()) ? !n.isNull() : n.isNull() || n.doubleValue() != pair.getValue()) fail();
        }
        var groups = s.get("groups"); if (groups == null || !groups.isArray() || groups.size() != 5) fail();
        long total = 0;
        for (int i = 0; i < 5; i++) {
            var row = groups.get(i); object(row); if (!BUCKETS.get(i).equals(text(row.get("bucket"), false))) fail();
            long signals = count(row.get("signals")), observed = count(row.get("observed")), unobserved = count(row.get("unobserved"));
            if (observed > signals || unobserved != signals - observed || total > SAFE_INTEGER - signals) fail(); total += signals;
            var avg = row.get("averageReturnPct"); var win = row.get("winRatePct"); number(avg, true); number(win, true);
            if (observed == 0 ? !avg.isNull() || !win.isNull() : avg.isNull() || win.isNull() || win.doubleValue() < 0 || win.doubleValue() > 100) fail();
            var out = r.withArray("groups").addObject().put("bucket", BUCKETS.get(i));
            for (String key : List.of("signals", "observed", "unobserved", "averageReturnPct", "winRatePct")) out.set(key, row.get(key));
        }
        var statuses = s.get("performanceStatusCounts"); object(statuses); long statusTotal = 0; var out = json.createObjectNode();
        for (String key : List.of("complete", "partial", "pending", "not_computed")) {
            long n = count(statuses.get(key)); if (statusTotal > SAFE_INTEGER - n) fail(); statusTotal += n; out.set(key, statuses.get(key));
        }
        if (statusTotal != total) fail(); r.set("performanceStatusCounts", out); if (total == 0) r.put("dataState", "EMPTY");
    }
    private static void list(JsonNode s, Query q, ObjectNode r, ObjectMapper json) {
        if (!Objects.equals(text(s.get("ticker"), true), q.ticker) || count(s.get("limit")) != q.limit || count(s.get("offset")) != q.offset) fail();
        var rows = s.get("signals"); if (rows == null || !rows.isArray() || rows.size() > q.limit) fail();
        var ids = new HashSet<String>();
        for (var row : rows) {
            var item = signal(row, json); String ticker = item.path("ticker").asText();
            if (!ids.add(item.path("signalId").asText()) || q.ticker != null && !q.ticker.equals(ticker)) fail();
            String status = status(row.get("performanceStatus")); var asOf = timestamp(row.get("performanceAsOf"), true);
            var missing = missing(row.get("missingSessions"), status, json);
            if (status.equals("NOT_COMPUTED") ? asOf != null : asOf == null) fail();
            item.put("performanceStatus", status); item.set("performanceAsOf", json.valueToTree(asOf)); item.set("missingSessions", missing);
            var snap = row.get("snapshot"); var saved = row.get("horizonObserved");
            if (snap == null || saved == null || !saved.isBoolean() || saved.booleanValue() != !snap.isNull()) fail();
            item.put("horizonObserved", saved.booleanValue()); item.set("snapshot", snap.isNull() ? NullNode.instance : snapshot(snap, json));
            r.withArray("items").add(item);
        }
        var flag = s.get("has_more"); var next = s.get("next_offset"); if (flag == null || !flag.isBoolean() || next == null) fail();
        boolean more = flag.booleanValue(); if (more ? rows.size() != q.limit || count(next) != (long)q.offset + q.limit : !next.isNull()) fail();
        boolean bounded = more && (long)q.offset + q.limit <= InsiderSignalsAdapter.MAX_OFFSET;
        r.withObject("page").put("hasMore", bounded); if (bounded) r.withObject("page").put("nextOffset", q.offset + q.limit);
        else if (more) r.withArray("warnings").add("PAGINATION_BOUND_REACHED");
        if (rows.isEmpty()) r.put("dataState", "EMPTY");
    }
    private static ObjectNode signal(JsonNode s, ObjectMapper json) {
        object(s); String id = text(s.get("signalId"), false); identity(id);
        String day = text(s.get("reportDate"), false); ReportProjection.date(day, true);
        String ticker = exactTicker(text(s.get("ticker"), false)); if (!id.equals("report:" + day + ":" + ticker)) fail();
        var out = json.createObjectNode().put("signalId", id).put("ticker", ticker).put("reportDate", day);
        out.set("company", json.valueToTree(text(s.get("company"), true)));
        out.put("discoveredAt", timestamp(s.get("discoveredAt"), false)).put("discoveryBasis", text(s.get("discoveryBasis"), false));
        var scores = s.get("scores"); object(scores); var scoreOut = out.putObject("scores");
        for (String key : List.of("signal", "investment")) {
            var score = scores.get(key); object(score); var n = score.get("value"); number(n, true);
            if (!n.isNull() && (n.doubleValue() < 0 || n.doubleValue() > 100) || !text(score.get("origin"), false).equals("imported_ai_report")) fail();
            scoreOut.putObject(key).put("origin", "imported_ai_report").set("value", n);
        }
        return out;
    }
    private static ObjectNode performance(JsonNode s, ObjectMapper json) {
        object(s); String status = status(s.get("status")); boolean empty = status.equals("NOT_COMPUTED");
        var out = json.createObjectNode().put("status", status); out.set("missingSessions", missing(s.get("missingSessions"), status, json));
        for (String k : List.of("asOf", "updatedAt")) { String time = timestamp(s.get(k), true); if (empty ? time != null : time == null) fail(); out.set(k, json.valueToTree(time)); }
        for (String k : List.of("maxUpsidePct", "maxAdversePct", "maxDrawdownPct", "daysToPeak", "daysToFirst10PctGain", "daysToFirst10PctLoss")) {
            var n = s.get(k); number(n, true); if (empty && !n.isNull()) fail(); if (k.startsWith("days") && !n.isNull()) count(n); out.set(k, n);
        }
        return out;
    }
    private static ArrayNode missing(JsonNode s, String status, ObjectMapper json) {
        if (s == null || !s.isArray() || s.size() > 10000 || !status.equals("PARTIAL") && !s.isEmpty()) fail();
        var out = json.createArrayNode(); for (var n : s) { String d = text(n, false); ReportProjection.date(d, true); out.add(d); } return out;
    }
    private static ObjectNode snapshot(JsonNode s, ObjectMapper json) {
        object(s); var out = json.createObjectNode();
        for (String k : List.of("snapshotAt", "createdAt")) out.put(k, timestamp(s.get(k), false));
        for (String k : List.of("price", "returnFromDiscoveryPct", "returnFromTradablePct")) { var n = s.get(k); number(n, !k.equals("price")); if (k.equals("price") && n.doubleValue() <= 0) fail(); out.set(k, n); }
        for (String k : List.of("provider", "priceBasis")) out.put(k, text(s.get(k), false)); return out;
    }
    private static String status(JsonNode n) { String s = text(n, false); if (!STATUSES.contains(s)) fail(); return s; }
    private static void object(JsonNode n) { if (n == null || !n.isObject()) fail(); }
    private static String text(JsonNode n, boolean nullable) {
        if (n != null && nullable && n.isNull()) return null;
        if (n == null || !n.isTextual() || n.textValue().isBlank() || n.textValue().length() > 4096
                || n.textValue().codePoints().anyMatch(Character::isISOControl) || !InsiderSignalsAdapter.safeText(n.textValue()).equals(n.textValue())) fail();
        return n.textValue();
    }
    private static String timestamp(JsonNode n, boolean nullable) { String s = text(n, nullable); if (s != null) OffsetDateTime.parse(s); return s; }
    private static void number(JsonNode n, boolean nullable) { if (n == null || !(nullable && n.isNull()) && (!n.isNumber() || !Double.isFinite(n.doubleValue()))) fail(); }
    private static long count(JsonNode n) { if (n == null || !n.isIntegralNumber() || !n.canConvertToLong() || n.longValue() < 0 || n.longValue() > SAFE_INTEGER) fail(); return n.longValue(); }
    private static void fail() { throw new IllegalStateException("Invalid Performance source response"); }
}
