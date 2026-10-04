package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Closed source-owned observed-close evidence. Never computes prices, sessions or returns. */
final class TwPerformanceProjection {
    static final String VERSION = "tw-observed-performance-v1";
    static final String REASONS = "CALENDAR_COVERAGE_INSUFFICIENT|CALENDAR_DATE_MISSING|CALENDAR_ALIAS_CONFLICT|CALENDAR_RECORD_INVALID|REFERENCE_NOT_TRADING_SESSION|SESSION_NOT_YET_DUE|OFFICIAL_PRICE_MISSING|PRICE_IDENTITY_AMBIGUOUS|PRICE_VALUE_INVALID|PRICE_TIMESTAMP_INVALID|OFFICIAL_PRICE_LINEAGE_MISMATCH|HISTORICAL_MARKET_UNVERIFIED|PRICE_RECEIPT_BUDGET_EXCEEDED|OFFICIAL_PRICE_RECEIPT_UNAVAILABLE|OFFICIAL_CLOSE_OBSERVED|OFFICIAL_PRICE_PROVENANCE_UNAVAILABLE|REFERENCE_CLOSE_UNAVAILABLE|RETURN_VALUE_INVALID";
    static final String WARNINGS = "INPUT_INVALID|RANGE_TOO_LARGE|RESULT_TIMESTAMP_INVALID|RESULT_BEFORE_SOURCE_SCOPE|SOURCE_SIZE_LIMIT|RESULT_PAYLOAD_BUDGET_EXCEEDED|RESULT_IDENTITY_MISMATCH|SAVED_CANDIDATES_UNAVAILABLE|OBSERVATION_READ_BUDGET_EXCEEDED|LINEAGE_PAYLOAD_BUDGET_EXCEEDED|RANGE_START_BEFORE_SOURCE_SCOPE|OBSERVATION_PRICE_EVIDENCE_INCOMPLETE|PAGINATION_OFFSET_LIMIT|SCOPE_UNAVAILABLE|SOURCE_HEADERS_UNAVAILABLE|SOURCE_HEADERS_INVALID|SOURCE_HEADERS_MISMATCH|DATABASE_MISSING|DATABASE_UNAVAILABLE|SQLITE_SIDECAR_UNSUPPORTED|SQLITE_HEADER_INVALID|SQLITE_WAL_UNSUPPORTED|DATABASE_CHANGED_DURING_READ|SOURCE_UNAVAILABLE|SOURCE_INVALID|STDOUT_SIZE_LIMIT";
    static final String SEMANTICS = "{\"purpose\":\"OBSERVATION_RESEARCH_EVIDENCE\",\"priceBasis\":\"CURRENT_SAVED_OFFICIAL_UNADJUSTED_CLOSE\",\"formula\":\"(horizonClose / referenceClose - 1) * 100\",\"dueClock\":\"CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI\",\"priceFinalityClock\":\"CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI\",\"crossPageSnapshot\":false,\"historicalPIT\":false,\"interpretationLimits\":[\"referenceClose is not execution price\",\"observed return is not realized P&L\",\"positive return is not BUY success\",\"negative return is not SELL signal\",\"source anomaly score is not investment score\",\"null is not zero\",\"missing price is not 0% return\",\"NOT_YET_DUE is not failure\",\"PRICE_UNAVAILABLE is not flat return\",\"unadjusted closes do not adjust corporate actions or dividends\",\"normal regular trading ends at 13:30 Taipei\",\"closing may be postponed, so this contract waits until 13:33 Taipei\",\"the conservative availability gate is not finality proof for every extraordinary market condition\"]}";
    static class Unsupported extends RuntimeException {}
    record Query(String startDate, String endDate, int limit, int offset) {
        static Query list(String start, String end, int limit, int offset) {
            try {
                TwStocksProjection.date(start); TwStocksProjection.date(end);
                long span = ChronoUnit.DAYS.between(LocalDate.parse(start), LocalDate.parse(end)) + 1;
                if (span < 1 || span > 366 || limit < 1 || limit > 50 || offset < 0 || offset > 10000) throw new IllegalArgumentException();
                return new Query(start, end, limit, offset);
            } catch (RuntimeException e) { throw new IllegalArgumentException("Invalid Performance query"); }
        }
    }
    static ObjectNode envelope(Query q, String state, ObjectMapper json) {
        var r = json.createObjectNode().put("contractVersion", 1).put("sourceContractVersion", VERSION)
                .put("source", "taiwan-performance").put("dataState", state).put("observedAt", Instant.now().toString())
                .putNull("generatedAt").put("provenance", "CURRENT_SAVED_OFFICIAL_CLOSE_RESEARCH_EVIDENCE");
        r.putObject("query").put("operation", "LIST").put("requestedStartDate", q.startDate())
                .put("requestedEndDate", q.endDate()).put("limit", q.limit()).put("offset", q.offset());
        r.putNull("scope"); r.putArray("items"); r.putNull("page"); r.putArray("warnings");
        try { r.set("semantics", json.readTree(SEMANTICS)); } catch (java.io.IOException e) { throw new IllegalStateException(e); } return r;
    }
    static ObjectNode normalize(JsonNode raw, Query q, int exit, ObjectMapper json) {
        object(raw); exactFields(raw, "contractVersion,source,generatedAt,dataState,query,scope,items,page,semantics,warnings"); if (!VERSION.equals(raw.path("contractVersion").textValue())) throw new Unsupported();
        check("TAIWAN_VOLUME_WATCH".equals(raw.path("source").textValue()));
        String state = value(raw.get("dataState"), "READY|PARTIAL|EMPTY|UNAVAILABLE|ERROR").asText();
        check(exit == (Set.of("READY", "EMPTY").contains(state) ? 0 : 2));
        var warnings = values(raw.get("warnings"), WARNINGS, 26);
        check(!state.equals("READY") || warnings.isEmpty());
        check(!Set.of("PARTIAL", "UNAVAILABLE", "ERROR").contains(state) || !warnings.isEmpty());
        var r = envelope(q, state, json); check(raw.get("semantics").equals(r.get("semantics"))); r.set("generatedAt", value(raw.get("generatedAt"), "stamp")); r.set("warnings", warnings);
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
            check(ids.add(item.path("itemId").asText()));
            projected.add(item); // Preserve source order and every distinct same-day run; never create gap rows.
        }
        r.set("page", p); return r;
    }
    private static ObjectNode provenance(JsonNode raw) {
        if (raw != null && raw.isNull()) return null;
        return fields(raw,"authority:daily_price,officialSource:TWSE_TPEX_OFFICIAL:market-data,priceObservedAt:stamp,marketObservedAt:stamp,priceRefreshedAt:stamp,sourceStartedAt:stamp,sourceFinishedAt:stamp,priceSourceRunId:id,sourceStatus:SUCCESS|PARTIAL");
    }
    private static ObjectNode item(JsonNode raw) {
        exactFields(raw,"itemId,targetDate,runId,symbol,market,observationFinishedAt,savedStatus,referenceClose,referenceState,referenceReasonCode,referenceProvenance,calendarMarketsUsed,horizons");
        var r = JsonNodeFactory.instance.objectNode();
        for (String spec : List.of("itemId:itemId","targetDate:day","runId:id","symbol:symbol","market:TWSE|TPEX","observationFinishedAt:stamp","savedStatus:SUCCESS|PARTIAL|FAILED|SKIPPED_NON_TRADING_DAY","referenceClose:~price","referenceState:OBSERVED|NOT_YET_DUE|PRICE_UNAVAILABLE|CALENDAR_UNAVAILABLE","referenceReasonCode:"+REASONS)) {
            int c=spec.indexOf(':'); r.set(spec.substring(0,c),value(raw.get(spec.substring(0,c)),spec.substring(c+1)));
        }
        check(r.path("itemId").asText().equals("tw-candidate:"+r.path("targetDate").asText()+":"+r.path("runId").asText()+":"+r.path("symbol").asText()));
        var ref=provenance(raw.get("referenceProvenance")); if(ref==null)r.putNull("referenceProvenance");else r.set("referenceProvenance",ref);
        boolean observed=r.path("referenceState").asText().equals("OBSERVED");
        check(observed ? !r.get("referenceClose").isNull() && ref!=null && r.path("referenceReasonCode").asText().equals("OFFICIAL_CLOSE_OBSERVED") : r.get("referenceClose").isNull() && ref==null);
        r.set("calendarMarketsUsed",values(raw.get("calendarMarketsUsed"),"TWSE|SII|LISTED|TPEX|OTC|TW|",5));
        JsonNode hs=raw.get("horizons"); check(hs!=null && hs.isArray() && hs.size()==5);
        int[] order={1,3,5,10,20};var out=r.putArray("horizons");
        for(int i=0;i<5;i++){
            var rawH=hs.get(i);exactFields(rawH,"sessionCount,expectedDate,close,returnPercent,state,reasonCode,dueAt,provenance");
            var h=JsonNodeFactory.instance.objectNode();
            for(String spec:List.of("sessionCount:count","expectedDate:~day","close:~price","returnPercent:~number","state:OBSERVED|NOT_YET_DUE|PRICE_UNAVAILABLE|CALENDAR_UNAVAILABLE","reasonCode:"+REASONS,"dueAt:~stamp")){
                int c=spec.indexOf(':');h.set(spec.substring(0,c),value(rawH.get(spec.substring(0,c)),spec.substring(c+1)));
            }
            check(h.path("sessionCount").asInt()==order[i]);
            var prov=provenance(rawH.get("provenance"));if(prov==null)h.putNull("provenance");else h.set("provenance",prov);
            switch(h.path("state").asText()){
                case "OBSERVED" -> check(!h.get("expectedDate").isNull() && !h.get("close").isNull() && !h.get("returnPercent").isNull() && !h.get("dueAt").isNull() && prov!=null && h.path("reasonCode").asText().equals("OFFICIAL_CLOSE_OBSERVED"));
                case "NOT_YET_DUE" -> check(!h.get("expectedDate").isNull() && !h.get("dueAt").isNull() && h.get("close").isNull() && h.get("returnPercent").isNull() && prov==null && h.path("reasonCode").asText().equals("SESSION_NOT_YET_DUE"));
                case "CALENDAR_UNAVAILABLE" -> check(h.get("expectedDate").isNull() && h.get("dueAt").isNull() && h.get("close").isNull() && h.get("returnPercent").isNull() && prov==null);
                case "PRICE_UNAVAILABLE" -> check(!h.get("expectedDate").isNull() && !h.get("dueAt").isNull() && h.get("returnPercent").isNull());
            }
            check(observed || h.get("returnPercent").isNull());
            out.add(h); // Source-owned dates/clocks/returns; preserve visible close when reference is unavailable.
        }
        return r;
    }
    private static void exactFields(JsonNode raw,String keys) {
        object(raw);var expected=new HashSet<>(Arrays.asList(keys.split(",")));var actual=new HashSet<String>();raw.fieldNames().forEachRemaining(actual::add);check(expected.equals(actual));
    }
    private static ObjectNode fields(JsonNode raw, String spec) {
        exactFields(raw, String.join(",", Arrays.stream(spec.split(",")).map(f -> f.substring(0,f.indexOf(':'))).toList())); var out = JsonNodeFactory.instance.objectNode();
        for (String field : spec.split(",")) { int colon = field.indexOf(':'); String key = field.substring(0, colon); out.set(key, value(raw.get(key), field.substring(colon + 1))); } return out;
    }
    private static JsonNode value(JsonNode n, String type) {
        check(n != null); if (type.startsWith("~")) { if (n.isNull()) return NullNode.instance; type = type.substring(1); }
        switch (type) {
            case "null" -> check(n.isNull());
            case "bool" -> check(n.isBoolean());
            case "number" -> check(n.isNumber() && Double.isFinite(n.doubleValue()));
            case "price" -> check(n.isNumber() && Double.isFinite(n.doubleValue()) && n.doubleValue()>0);
            case "symbol" -> check(n.isTextual() && n.asText().matches("[A-Za-z0-9]{1,16}"));
            case "itemId" -> check(n.isTextual() && n.asText().matches("tw-candidate:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{32}:[A-Za-z0-9]{1,16}"));
            case "count" -> check(n.isIntegralNumber() && n.canConvertToLong() && n.asLong() >= 0 && n.asLong() <= 1_000_000_000);
            case "day" -> { check(n.isTextual()); TwStocksProjection.date(n.asText()); }
            case "stamp" -> { check(n.isTextual() && n.asText().length() <= 40 && n.asText().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})")); TwStocksProjection.date(n.asText().substring(0, 10)); OffsetDateTime.parse(n.asText()); }
            case "id" -> check(n.isTextual() && n.asText().matches("[0-9a-f]{32}"));
            default -> check(n.isTextual() && Arrays.asList(type.split("[|]", -1)).contains(n.asText()));
        } return n.deepCopy();
    }
    private static ArrayNode values(JsonNode raw, String type, int max) {
        check(raw != null && raw.isArray() && raw.size() <= max); var out = JsonNodeFactory.instance.arrayNode(); var seen = new HashSet<JsonNode>();
        for (var n : raw) { var v = value(n, type); check(seen.add(v)); out.add(v); } return out;
    }
    private static boolean contains(JsonNode array, String code) { for (var w : array) if (w.asText().equals(code)) return true; return false; }
    private static void object(JsonNode n) { check(n != null && n.isObject()); }
    private static void check(boolean ok) { if (!ok) throw new IllegalStateException("Invalid Performance source contract"); }
}
