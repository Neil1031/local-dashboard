package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Projects only bounded source-owned saved observation facts. No source DB/file reads. */
final class TwHistoryProjection {
    static final String VERSION = "tw-history-range-v1";
    static final String ITEM_WARNINGS = "CLASSIFICATION_UNAVAILABLE|MARKET_DIAGNOSTICS_UNAVAILABLE|OBSERVATION_UNAVAILABLE|READINESS_UNAVAILABLE|SAVED_CANDIDATES_UNAVAILABLE|SAVED_FACT_UNKNOWN|SAVED_READINESS_REASON_UNKNOWN|SOURCE_COMPLETENESS_INCOMPLETE|STRATEGY_STATUS_UNKNOWN";
    static final String WARNINGS = ITEM_WARNINGS + "|DATABASE_CHANGED_DURING_READ|DATABASE_MISSING|DATABASE_UNAVAILABLE|INPUT_INVALID|PAGE_PAYLOAD_SIZE_LIMIT|PAGINATION_OFFSET_LIMIT|RANGE_START_BEFORE_SOURCE_SCOPE|RANGE_TOO_LARGE|RESULT_BEFORE_SOURCE_SCOPE|RESULT_IDENTITY_MISMATCH|RESULT_UNAVAILABLE|SCOPE_UNAVAILABLE|SOURCE_HEADERS_INVALID|SOURCE_HEADERS_MISMATCH|SOURCE_HEADERS_UNAVAILABLE|SOURCE_INVALID|SOURCE_SIZE_LIMIT|SOURCE_UNAVAILABLE|SQLITE_HEADER_INVALID|SQLITE_SIDECAR_UNSUPPORTED|SQLITE_WAL_UNSUPPORTED|STDOUT_SIZE_LIMIT";
    static class Unsupported extends RuntimeException {}
    record Query(String startDate, String endDate, int limit, int offset) {
        static Query list(String start, String end, int limit, int offset) {
            try {
                TwStocksProjection.date(start); TwStocksProjection.date(end);
                long span = ChronoUnit.DAYS.between(LocalDate.parse(start), LocalDate.parse(end)) + 1;
                if (span < 1 || span > 366 || limit < 1 || limit > 50 || offset < 0 || offset > 10000) throw new IllegalArgumentException();
                return new Query(start, end, limit, offset);
            } catch (RuntimeException e) { throw new IllegalArgumentException("Invalid History query"); }
        }
    }
    static ObjectNode envelope(Query q, String state, ObjectMapper json) {
        var r = json.createObjectNode().put("contractVersion", 1).put("sourceContractVersion", VERSION)
                .put("source", "taiwan-history").put("dataState", state).put("observedAt", Instant.now().toString())
                .putNull("generatedAt").put("provenance", "SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS");
        r.putObject("query").put("operation", "LIST").put("requestedStartDate", q.startDate())
                .put("requestedEndDate", q.endDate()).put("limit", q.limit()).put("offset", q.offset());
        r.putNull("scope"); r.putArray("items"); r.putNull("page"); r.putArray("warnings"); return r;
    }
    static ObjectNode normalize(JsonNode raw, Query q, int exit, ObjectMapper json) {
        object(raw); if (!VERSION.equals(raw.path("contractVersion").textValue())) throw new Unsupported();
        check("TAIWAN_VOLUME_WATCH".equals(raw.path("source").textValue()));
        String state = value(raw.get("dataState"), "READY|PARTIAL|EMPTY|UNAVAILABLE|ERROR").asText();
        check(exit == (Set.of("READY", "EMPTY").contains(state) ? 0 : 2));
        var warnings = values(raw.get("warnings"), WARNINGS, 31);
        check(!state.equals("READY") || warnings.isEmpty());
        check(!Set.of("PARTIAL", "UNAVAILABLE", "ERROR").contains(state) || !warnings.isEmpty());
        var r = envelope(q, state, json); r.set("generatedAt", value(raw.get("generatedAt"), "stamp")); r.set("warnings", warnings);
        check(raw.has("query") && raw.has("scope") && raw.has("page"));
        if (raw.get("query").isNull()) {
            check(state.equals("ERROR") && raw.get("scope").isNull() && warnings.size() == 1
                    && Set.of("INPUT_INVALID", "RANGE_TOO_LARGE").contains(warnings.get(0).asText()));
        } else check(fields(raw.get("query"), "operation:LIST,requestedStartDate:day,requestedEndDate:day,limit:count,offset:count").equals(r.get("query")));
        if (!raw.get("scope").isNull()) r.set("scope", fields(raw.get("scope"), "state:AVAILABLE,mode:DAILY_ACCUMULATION,startDate:day"));
        var items = raw.get("items"); check(items != null && items.isArray() && items.size() <= q.limit());
        if (Set.of("UNAVAILABLE", "ERROR").contains(state)) { check(items.isEmpty() && raw.get("page").isNull()); return r; }
        check(!raw.get("query").isNull() && !r.get("scope").isNull());
        var p = fields(raw.get("page"), "limit:count,offset:count,returned:count,hasMore:bool,nextOffset:~count,total:null");
        check(p.path("limit").asInt() == q.limit() && p.path("offset").asInt() == q.offset() && p.path("returned").asInt() == items.size());
        boolean more = p.path("hasMore").asBoolean(); int next = q.offset() + q.limit();
        check(more && next <= 10000 ? !p.get("nextOffset").isNull() && p.get("nextOffset").asInt() == next : p.get("nextOffset").isNull());
        check(!more || items.size() == q.limit());
        check(!more || next <= 10000 || contains(warnings, "PAGINATION_OFFSET_LIMIT"));
        check(state.equals("EMPTY") ? items.isEmpty() && !more : !items.isEmpty());
        var projected = r.withArray("items"); var ids = new HashSet<String>();
        for (var rawItem : items) {
            var item = item(rawItem); String date = item.path("targetDate").asText();
            check(date.compareTo(q.startDate()) >= 0 && date.compareTo(q.endDate()) <= 0 && date.compareTo(r.path("scope").path("startDate").asText()) >= 0);
            check(ids.add(item.path("observationId").asText()));
            for (var w : item.path("projectionWarnings")) check(contains(warnings, w.asText()));
            projected.add(item); // Preserve source order and every distinct same-day run; never create gap rows.
        }
        r.set("page", p); return r;
    }
    private static ObjectNode item(JsonNode raw) {
        var r = fields(raw, "observationId:observationId,targetDate:day,runId:id,finishedAt:stamp,savedStatus:SUCCESS|PARTIAL|FAILED|SKIPPED_NON_TRADING_DAY,classificationStatus:WARMING_UP|OBSERVATIONS_AVAILABLE|UNAVAILABLE|NOT_APPLICABLE|NO_MARKET_DATA|UNKNOWN,strategyStatus:OUT_OF_SCOPE|UNKNOWN,candidateCount:~count,savedTotalCandidatesBeforeLimit:~count,savedCandidateTruncated:~bool");
        String suffix = r.path("targetDate").asText() + ":" + r.path("runId").asText();
        check(r.path("observationId").asText().equals("tw-observation:" + suffix));
        r.set("detailRef", fields(raw.get("detailRef"), "contractVersion:tw-reports-v1,reportId:reportId"));
        check(r.path("detailRef").path("reportId").asText().equals("tw-daily:" + suffix));
        var counts = fields(raw.get("sourceStatusCounts"), "SUCCESS:count,PARTIAL:count,FAILED:count");
        check(counts.path("SUCCESS").asLong() + counts.path("PARTIAL").asLong() + counts.path("FAILED").asLong() <= 64); r.set("sourceStatusCounts", counts);
        var readiness = fields(raw.get("readiness"), "warmingSymbols:~count,reasonCode:~BASELINE_SESSION_GAP|INSUFFICIENT_HISTORY|NO_ELIGIBLE_OBSERVATION_SYMBOLS|NO_MARKET_DATA|OBSERVATIONS_AVAILABLE|WARMING_UP");
        var skipped = raw.path("readiness").get("skippedCounts"); check(skipped != null);
        if (skipped.isNull()) readiness.putNull("skippedCounts"); else {
            object(skipped); var out = readiness.putObject("skippedCounts"); skipped.fields().forEachRemaining(e -> {
                check(Set.of("BASELINE_SESSION_GAP", "BELOW_ANOMALY_THRESHOLD", "INSUFFICIENT_HISTORY", "ZERO_VOLUME_OR_RECENT_HALT").contains(e.getKey())); out.set(e.getKey(), value(e.getValue(), "~count"));
            });
        }
        r.set("readiness", readiness); var markets = raw.get("markets"); check(markets != null && markets.isArray() && markets.size() == 2);
        var names = new HashSet<String>(); var out = r.putArray("markets");
        for (var m : markets) {
            var market = fields(m, "market:TWSE|TPEX,complete:~bool,expectedMasterSymbols:~count,freshRows:~count,unpricedUnknownCount:~count,statusUnknownCount:~count,quoteScopeStatus:~ABANDONED|FAILED|IMPORTED|NOT_CHECKED|NOT_DUE|NOT_REQUESTED|PARTIAL|RUNNING|SKIPPED_NON_TRADING_DAY|SUCCESS|UNAVAILABLE|UNKNOWN");
            check(names.add(market.path("market").asText())); out.add(market);
        }
        r.set("projectionWarnings", values(raw.get("projectionWarnings"), ITEM_WARNINGS, 9));
        if (!r.get("candidateCount").isNull() && !r.get("savedTotalCandidatesBeforeLimit").isNull()) {
            long count = r.path("candidateCount").asLong(), total = r.path("savedTotalCandidatesBeforeLimit").asLong();
            check(total >= count && (r.get("savedCandidateTruncated").isNull() || r.get("savedCandidateTruncated").asBoolean() == (total > count)));
        }
        return r;
    }
    private static ObjectNode fields(JsonNode raw, String spec) {
        object(raw); var out = JsonNodeFactory.instance.objectNode();
        for (String field : spec.split(",")) { int colon = field.indexOf(':'); String key = field.substring(0, colon); out.set(key, value(raw.get(key), field.substring(colon + 1))); } return out;
    }
    private static JsonNode value(JsonNode n, String type) {
        check(n != null); if (type.startsWith("~")) { if (n.isNull()) return NullNode.instance; type = type.substring(1); }
        switch (type) {
            case "null" -> check(n.isNull());
            case "bool" -> check(n.isBoolean());
            case "count" -> check(n.isIntegralNumber() && n.canConvertToLong() && n.asLong() >= 0 && n.asLong() <= 1_000_000_000);
            case "day" -> { check(n.isTextual()); TwStocksProjection.date(n.asText()); }
            case "stamp" -> { check(n.isTextual() && n.asText().length() <= 40 && n.asText().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})")); TwStocksProjection.date(n.asText().substring(0, 10)); OffsetDateTime.parse(n.asText()); }
            case "id" -> check(n.isTextual() && n.asText().matches("[0-9a-f]{32}"));
            case "observationId" -> check(n.isTextual() && n.asText().matches("tw-observation:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{32}"));
            case "reportId" -> check(n.isTextual() && n.asText().matches("tw-daily:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{32}"));
            default -> check(n.isTextual() && Arrays.asList(type.split("\\|", -1)).contains(n.asText()));
        } return n.deepCopy();
    }
    private static ArrayNode values(JsonNode raw, String type, int max) {
        check(raw != null && raw.isArray() && raw.size() <= max); var out = JsonNodeFactory.instance.arrayNode(); var seen = new HashSet<JsonNode>();
        for (var n : raw) { var v = value(n, type); check(seen.add(v)); out.add(v); } return out;
    }
    private static boolean contains(JsonNode array, String code) { for (var w : array) if (w.asText().equals(code)) return true; return false; }
    private static void object(JsonNode n) { check(n != null && n.isObject()); }
    private static void check(boolean ok) { if (!ok) throw new IllegalStateException("Invalid History source contract"); }
}
