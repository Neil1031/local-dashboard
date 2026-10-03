package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.function.Function;

/** Consumed-field allowlist. Never opens source files or reconstructs report facts. */
final class TwReportsProjection {
    static final String VERSION = "tw-reports-v1";
    private static final String DAILY = "SUCCESS|PARTIAL|FAILED|SKIPPED_NON_TRADING_DAY";
    private static final String STATUS = DAILY + "|ABANDONED|IMPORTED|NOT_CHECKED|NOT_DUE|NOT_REQUESTED|RUNNING|UNAVAILABLE|UNKNOWN";
    private static final String COVERAGE = "COMPLETE|PARTIAL|UNAVAILABLE|UNKNOWN";
    private static final String DIAGNOSTICS = "AVAILABLE|UNAVAILABLE|LEGACY_DIAGNOSTICS_UNAVAILABLE";
    private static final String PROBLEM = "ACCUMULATION_SCOPE_MISSING|DATABASE_INTEGRITY_FAILED|DAY_INCOMPLETE|NOTIFICATION_UNVERIFIED|NO_COLLECTION|PENDING_REVALIDATION|REPORTED_PROBLEM_REDACTED|RUN_NOT_FINALIZED|SOURCE_INCOMPLETE|UNFINISHED_RUN|UNRESOLVED_REVALIDATION";
    private static final String WARNINGS = "ATTEMPT_DATES_UNAVAILABLE|BASELINE_DIAGNOSTICS_INVALID|BODY_TRUNCATED|CANDIDATE_INVALID|CLASSIFICATION_UNAVAILABLE|COLLECTION_LIMIT_EXCEEDED|DATABASE_CHANGED_DURING_READ|DATABASE_MISSING|DATABASE_UNAVAILABLE|FINALIZED_JOURNAL_BINDING_MISMATCH|FINALIZED_JOURNAL_BINDING_UNAVAILABLE|INPUT_INVALID|ITEMS_TRUNCATED|JOURNAL_CHANGED_DURING_READ|JOURNAL_INVALID|JOURNAL_MISSING|JOURNAL_UNAVAILABLE|LATEST_ATTEMPT_UNAVAILABLE|LEGACY_DIAGNOSTICS_UNAVAILABLE|LEGACY_MAPPING_DIAGNOSTICS_UNAVAILABLE|LEGACY_PUBLIC_INFO_CHECK_UNAVAILABLE|MARKET_DIAGNOSTICS_INVALID|MARKET_DIAGNOSTICS_UNAVAILABLE|NONCANONICAL_WEEKLY_ENTRY_IGNORED|OBSERVATION_IDENTITY_MISMATCH|OBSERVATION_UNAVAILABLE|PAGE_SIZE_LIMIT|PROJECTION_SANITIZED|PUBLIC_INFO_CHECK_INVALID|READINESS_UNAVAILABLE|REPORT_ID_INVALID|REPORT_NOT_FOUND|RESULT_IDENTITY_MISMATCH|RESULT_INVALID|RESULT_UNAVAILABLE|SAVED_FACT_UNKNOWN|SCOPE_UNAVAILABLE|SOURCE_HEADERS_INVALID|SOURCE_HEADERS_MISMATCH|SOURCE_HEADERS_UNAVAILABLE|SOURCE_INVALID|SOURCE_ITEM_LIMIT|SOURCE_SIZE_LIMIT|SOURCE_TEXT_REDACTED|SOURCE_TEXT_TRUNCATED|SOURCE_UNAVAILABLE|SQLITE_HEADER_INVALID|SQLITE_SIDECAR_UNSUPPORTED|SQLITE_WAL_UNSUPPORTED|STDOUT_SIZE_LIMIT|STRATEGY_STATUS_UNKNOWN|TARGET_BEFORE_SCOPE|TARGET_DATE_INVALID|WEEKLY_AUTHORITY_UNSAFE|WEEKLY_BINDING_MISMATCH|WEEKLY_BINDING_UNAVAILABLE|WEEKLY_CHANGED_DURING_READ|WEEKLY_DAILY_BINDING_UNPROVEN|WEEKLY_IDENTITY_MISMATCH|WEEKLY_INVENTORY_LIMIT|WEEKLY_MISSING|WEEKLY_POINTER_INVALID|WEEKLY_POINTER_MISSING|WEEKLY_POINTER_STALE|WEEKLY_REPORT_INVALID|WEEKLY_SOURCE_UNAVAILABLE|WEEKLY_STALE|WEEKLY_UNAVAILABLE";
    static class Unsupported extends RuntimeException {}
    record Query(String type, int limit, int offset, String reportId) {
        boolean detail() { return reportId != null; }
        static Query list(String type, int limit, int offset) {
            check(Set.of("daily", "weekly").contains(type == null ? "" : type)); check(limit >= 1 && limit <= 100 && offset >= 0 && offset <= 10000);
            return new Query(type.toUpperCase(Locale.ROOT), limit, offset, null);
        }
        static Query detail(String id) { return new Query(TwReportsProjection.reportId(id), 0, 0, id); }
    }
    static String reportId(String id) {
        check(id != null && id.matches("tw-(daily|weekly):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{32}"));
        String day = id.substring(id.indexOf(':') + 1, id.lastIndexOf(':')); TwStocksProjection.date(day);
        boolean weekly = id.startsWith("tw-weekly:"); check(!weekly || LocalDate.parse(day).getDayOfWeek() == DayOfWeek.FRIDAY);
        return weekly ? "WEEKLY" : "DAILY";
    }
    static ObjectNode envelope(Query query, String state, ObjectMapper json) {
        var r = json.createObjectNode().put("contractVersion", 1).put("sourceContractVersion", VERSION).put("source", "taiwan-reports")
                .put("dataState", state).put("observedAt", Instant.now().toString()).putNull("generatedAt").put("reportType", query.type());
        r.put("provenance", query.type().equals("DAILY") ? "SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS" : "SAVED_IMMUTABLE_WEEKLY_CHECK");
        r.putArray("warnings"); r.putNull("report"); r.putArray("items"); r.putNull("page");
        return r;
    }
    static ObjectNode normalize(JsonNode raw, Query query, int exit, ObjectMapper json) {
        object(raw); if (!VERSION.equals(raw.path("contractVersion").textValue())) throw new Unsupported();
        check("TAIWAN_VOLUME_WATCH".equals(raw.path("source").textValue()));
        String state = value(raw.get("dataState"), "READY|EMPTY|PARTIAL|UNAVAILABLE|ERROR").asText();
        check(exit == (Set.of("READY", "EMPTY").contains(state) ? 0 : 2));
        var warnings = values(raw.get("warnings"), WARNINGS, 100);
        check(Set.of("READY", "EMPTY").contains(state) ? warnings.isEmpty() : !warnings.isEmpty());
        var q = raw.get("query"); check(q != null);
        if (q.isNull()) check(state.equals("ERROR") && warnings.size() == 1 && warnings.get(0).asText().equals("INPUT_INVALID"));
        else {
            var projected = fields(q, query.detail() ? "operation:DETAIL,reportType:DAILY|WEEKLY,reportId:textId" : "operation:LIST,reportType:DAILY|WEEKLY,limit:count,offset:count");
            check(projected.path("reportType").asText().equals(query.type()));
            check(query.detail() ? projected.path("reportId").asText().equals(query.reportId()) : projected.path("limit").asInt() == query.limit() && projected.path("offset").asInt() == query.offset());
        }
        var r = envelope(query, state, json); r.set("generatedAt", value(raw.get("generatedAt"), "stamp")); r.set("warnings", warnings);
        check(raw.has("report") && raw.has("page"));
        if (Set.of("UNAVAILABLE", "ERROR").contains(state)) { check(raw.get("report").isNull() && raw.get("page").isNull()); return r; }
        if (query.detail()) {
            check(!state.equals("EMPTY") && raw.get("page").isNull());
            var report = summary(raw.get("report"), query.type(), true);
            check(report.path("reportId").asText().equals(query.reportId()));
            var facts = query.type().equals("DAILY") ? dailyFacts(raw.path("report").path("facts"), report, warnings) : weeklyFacts(raw.path("report").path("facts"), report, warnings);
            report.set("facts", facts); String body = value(raw.path("report").get("markdown"), "markdown").asText();
            report.put("markdown", body); report.set("bodyTruncated", value(raw.path("report").get("bodyTruncated"), "bool"));
            check(report.path("bodyTruncated").asBoolean() == contains(warnings, "BODY_TRUNCATED")); r.set("report", report);
        } else {
            check(raw.get("report").isNull()); var p = fields(raw.get("page"), "limit:count,offset:count,hasMore:bool,total:null");
            check(p.path("limit").asInt() == query.limit() && p.path("offset").asInt() == query.offset());
            var items = rows(raw.path("page").get("items"), query.limit(), x -> summary(x, query.type(), false));
            check(!state.equals("EMPTY") || items.isEmpty() && !p.path("hasMore").asBoolean()); check(!state.equals("READY") || !items.isEmpty());
            check(!p.path("hasMore").asBoolean() || !items.isEmpty()); unique(items, "reportId");
            for (var item : items) for (var warning : item.path("warnings")) check(contains(warnings, warning.asText()));
            // Preserve the source hasMore fact; nextOffset is capped for the browser's bounded query.
            int next = query.offset() + query.limit(); if (p.path("hasMore").asBoolean() && next <= 10000) p.put("nextOffset", next); else p.putNull("nextOffset");
            r.set("items", items); r.set("page", p);
        }
        return r;
    }
    private static ObjectNode summary(JsonNode raw, String type, boolean detail) {
        var r = fields(raw, "reportId:textId,reportType:" + type + ",effectiveDate:day,status:" + (type.equals("DAILY") ? DAILY : "SUCCESS|FAILED|NOT_DUE"));
        check(reportId(r.path("reportId").asText()).equals(type));
        var more = fields(raw, type.equals("DAILY") ? "targetDate:day,accumulationRunId:id,savedAt:stamp,classificationStatus:WARMING_UP|OBSERVATIONS_AVAILABLE|UNAVAILABLE|NOT_APPLICABLE|NO_MARKET_DATA|UNKNOWN,candidateCount:~count" : "weekStart:day,weekEnd:day,checkRunId:id,checkedAt:stamp,problemCount:~count,pendingRevalidationCount:~count,unfinishedRunCount:~count"); r.setAll(more);
        String day = r.path(type.equals("DAILY") ? "targetDate" : "weekEnd").asText();
        check(r.path("effectiveDate").asText().equals(day) && r.path("reportId").asText().equals("tw-" + type.toLowerCase(Locale.ROOT) + ":" + day + ":" + r.path(type.equals("DAILY") ? "accumulationRunId" : "checkRunId").asText()));
        if (type.equals("WEEKLY")) {
            check(LocalDate.parse(day).minusDays(4).toString().equals(r.path("weekStart").asText())); r.set("dayStatusCounts", counts(raw.get("dayStatusCounts"), DAILY, false, false));
            if (r.path("status").asText().equals("SUCCESS")) for (String key : List.of("problemCount", "pendingRevalidationCount", "unfinishedRunCount")) check(r.path(key).isNull() || r.path(key).asLong() == 0);
        }
        if (!detail) r.set("warnings", values(raw.get("warnings"), WARNINGS, 100)); return r;
    }
    private static ObjectNode dailyFacts(JsonNode raw, ObjectNode report, JsonNode warnings) {
        var r = fields(raw, "strategyStatus:OUT_OF_SCOPE|UNKNOWN,provenance:SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS");
        r.set("scope", fields(raw.get("scope"), "mode:~DAILY_ACCUMULATION,startDate:~day"));
        var sources = rows(raw.get("sources"), 64, x -> {
            var s = fields(x, "name:annual-calendar|closure-announcements|official-disclosures|corporate-actions|security-status|capital-suspensions|candidate-original-news|TPEX:quote-scopes|TWSE:master|TWSE:prices|TWSE:institutional|TPEX:master|TPEX:prices|TPEX:institutional,status:SUCCESS|PARTIAL|FAILED,started_at:stamp,finished_at:stamp,reason_code:SOURCE_SUCCESS|SOURCE_PARTIAL|SOURCE_FAILED");
            check(s.path("reasonCode").asText().equals("SOURCE_" + s.path("status").asText())); before(s, "startedAt", "finishedAt"); return s;
        }); unique(sources, "name"); r.set("sources", sources);
        var markets = rows(raw.get("markets"), 2, x -> fields(x, "market:TWSE|TPEX,complete:~bool,quote_scope_complete:~bool,rows:~count,expected_master_symbols:~count,fresh_rows:~count,unpriced_unknown_count:~count,status_unknown_count:~count,quote_scope_status:" + STATUS)); unique(markets, "market"); r.set("markets", markets);
        var readiness = fields(raw.get("readiness"), "warmingSymbols:~count,reasonCode:NO_ELIGIBLE_OBSERVATION_SYMBOLS|NO_MARKET_DATA|SAVED_READINESS");
        readiness.set("skippedCounts", counts(raw.path("readiness").get("skippedCounts"), "BASELINE_SESSION_GAP|BELOW_ANOMALY_THRESHOLD|INSUFFICIENT_HISTORY|ZERO_VOLUME_OR_RECENT_HALT", true, true));
        readiness.set("pendingCandidateNews", nullableValues(raw.path("readiness").get("pendingCandidateNews"), "symbol", 100)); r.set("readiness", readiness);
        var mapping = fields(raw.get("mappingDiagnostics"), "state:" + DIAGNOSTICS);
        mapping.set("unmappedSymbols", nullableValues(raw.path("mappingDiagnostics").get("unmapped_symbols"), "symbol", 100));
        mapping.set("recognizedExclusions", nullableRows(raw.path("mappingDiagnostics").get("recognized_exclusions"), 100, x -> {
            var e = fields(x, "symbol:symbol,market:TWSE|TPEX,source:TPEX:master|TWSE:master,source_date:day,reason_code:OFFICIAL_TDR_OUTSIDE_COMMON_STOCK_UNIVERSE"); check(e.path("source").asText().equals(e.path("market").asText() + ":master")); return e;
        })); r.set("mappingDiagnostics", mapping);
        var baseline = fields(raw.get("baselineDiagnostics"), "state:" + DIAGNOSTICS);
        var records = rows(raw.path("baselineDiagnostics").get("records"), 100, x -> {
            var b = fields(x, "symbol:symbol,status:BASELINE_SESSION_GAP|INSUFFICIENT_HISTORY|READY,reason_code:CALENDAR_ALIAS_CONFLICT|CALENDAR_UNKNOWN|EXPECTED_PRICE_SESSION_MISSING|INVALID_BASELINE_SESSIONS|READY|SCOPE_UNAVAILABLE|VALID_RANGE_HAS_TOO_FEW_SESSIONS,?lower_bound:day,?reason_date:day");
            for (String key : List.of("expected_dates", "actual_dates", "missing_dates")) if (x.has(key)) b.set(camel(key), key.equals("expected_dates") ? values(x.get(key), "day", 256) : nullableValues(x.get(key), "day", 256)); return b;
        }); unique(records, "symbol"); baseline.set("records", records); r.set("baselineDiagnostics", baseline);
        var candidates = nullableRows(raw.get("candidates"), 100, x -> candidate(x, report.path("targetDate").asText())); if (!candidates.isNull()) unique(candidates, "symbol"); r.set("candidates", candidates);
        var cs = fields(raw.get("candidateSummary"), "savedCandidateCount:~count,savedTotalCandidatesBeforeLimit:~count,savedTruncated:~bool,exportedCount:count,exportTruncated:bool");
        check(cs.path("exportedCount").asLong() == (candidates.isNull() ? 0 : candidates.size()));
        // Saved totals and exported totals are distinct authorities; validate only known contradictions.
        check(cs.path("savedCandidateCount").equals(report.path("candidateCount")));
        if (!cs.path("savedCandidateCount").isNull()) {
            long saved = cs.path("savedCandidateCount").asLong(), exported = cs.path("exportedCount").asLong();
            check(exported == Math.min(saved, 100) && cs.path("exportTruncated").asBoolean() == (saved > exported));
            if (!cs.path("savedTotalCandidatesBeforeLimit").isNull()) {
                long total = cs.path("savedTotalCandidatesBeforeLimit").asLong();
                check(total >= saved && (cs.path("savedTruncated").isNull() || cs.path("savedTruncated").asBoolean() == (total > saved)));
            }
        }
        if (cs.path("exportTruncated").asBoolean()) check(contains(warnings, "ITEMS_TRUNCATED"));
        r.set("candidateSummary", cs); return r;
    }
    private static ObjectNode candidate(JsonNode raw, String date) {
        var c = fields(raw, "symbol:symbol,stockName:~text,market:TWSE|TPEX,signalDate:day,classification:MECHANICAL_EVENT_EXCLUDED|POSSIBLY_UNEXPLAINED|POST_CLOSE_PUBLIC_INFO_FOUND|PUBLIC_INFO_COVERAGE_GAP|PUBLIC_INFO_FOUND|UNEXPLAINED_VOLUME|UNKNOWN,classificationBasis:AS_KNOWN|LATEST_FINALIZABLE|POINT_IN_TIME_AS_KNOWN|UNKNOWN,coverageStatus:" + COVERAGE + ",analysisEligible:null,analysisEligibleSemantics:NOT_APPLICABLE_DAILY_OBSERVATION,anomalyRank:~count,sourceAnomalyScore:~number,volumeRatio:~number,volumeZscore:~number,baselineVolume:~number"); check(c.path("signalDate").asText().equals(date));
        var p = fields(raw.get("publicInfoCheck"), "record_exists:~bool,status:" + STATUS + ",succeeded:~bool,checked_at:~stamp,as_of:~stamp,coverage_status:" + COVERAGE + ",reason_code:LEGACY_PUBLIC_INFO_CHECK_UNAVAILABLE|PUBLIC_INFO_CHECK_INVALID|SAVED_PUBLIC_INFO_CHECK");
        if (!p.path("recordExists").asBoolean(false)) check(p.path("succeeded").isNull() && p.path("checkedAt").isNull());
        if (p.path("succeeded").asBoolean(false) || p.path("status").asText().equals("SUCCESS")) check(p.path("recordExists").asBoolean(false) && p.path("succeeded").asBoolean(false) && p.path("status").asText().equals("SUCCESS") && !p.path("checkedAt").isNull());
        before(p, "checkedAt", "asOf"); c.set("publicInfoCheck", p);
        c.set("riskFlags", values(raw.get("riskFlags"), "LARGE_SAME_DAY_PRICE_MOVE|MECHANICAL_CORPORATE_ACTION|OFFICIAL_CONTENT_VERSION_UNKNOWN|POST_CLOSE_PUBLIC_INFO|PUBLIC_INFO_COVERAGE_INCOMPLETE", 32)); return c;
    }
    private static ObjectNode weeklyFacts(JsonNode raw, ObjectNode report, JsonNode warnings) {
        var r = fields(raw, "pointerState:NOT_INSPECTED,dailyBinding:INDEPENDENT,provenance:SAVED_IMMUTABLE_WEEKLY_CHECK");
        var days = rows(raw.get("days"), 5, x -> {
            var d = fields(x, "targetDate:day,status:" + DAILY + ",accumulationRunId:~id,savedAt:~stamp,bindingState:SAVED_COLLECTION_IDENTITY|UNVERIFIED,savedCollectionStatus:~" + DAILY);
            check(d.path("targetDate").asText().compareTo(report.path("weekStart").asText()) >= 0 && d.path("targetDate").asText().compareTo(report.path("weekEnd").asText()) <= 0);
            if (d.path("bindingState").asText().equals("SAVED_COLLECTION_IDENTITY")) check(!d.path("accumulationRunId").isNull() && !d.path("savedAt").isNull() && !d.path("savedCollectionStatus").isNull());
            d.set("problems", nullableRows(x.get("problems"), 50, TwReportsProjection::problem)); return d;
        }); unique(days, "targetDate"); r.set("days", days);
        var actualCounts = JsonNodeFactory.instance.objectNode(); for (var day : days) { String status = day.path("status").asText(); actualCounts.put(status, actualCounts.path(status).asInt() + 1); }
        check(actualCounts.equals(report.path("dayStatusCounts")));
        r.set("problems", nullableRows(raw.get("problems"), 50, TwReportsProjection::problem));
        r.set("pendingRevalidation", nullableRows(raw.get("pendingRevalidation"), 100, x -> fields(x, "targetDate:day,originRunId:~id,requiredAt:~stamp")));
        r.set("unfinishedRuns", nullableRows(raw.get("unfinishedRuns"), 100, x -> {
            var u = fields(x, "runId:id,state:RUNNING|RETRY,targetDatesSemantics:SAVED_RELEVANT_DATES|UNPROVEN_SCHEDULED_DATES"); u.set("targetDates", nullableValues(x.get("targetDates"), "day", 256)); return u;
        }));
        for (String[] pair : new String[][] {{"problems", "problemCount"}, {"pendingRevalidation", "pendingRevalidationCount"}, {"unfinishedRuns", "unfinishedRunCount"}}) {
            var total = report.path(pair[1]); var rows = r.path(pair[0]); check(total.isNull() == rows.isNull());
            if (!total.isNull()) {
                int cap = pair[0].equals("problems") ? 50 : 100;
                check(rows.size() == Math.min(total.asLong(), cap));
                if (total.asLong() > rows.size()) check(contains(warnings, "ITEMS_TRUNCATED"));
            }
        }
        return r;
    }
    private static ObjectNode problem(JsonNode x) { return fields(x, "code:" + PROBLEM + ",targetDate:~day,runId:~id"); }
    private static ObjectNode fields(JsonNode raw, String spec) {
        object(raw); var out = JsonNodeFactory.instance.objectNode();
        for (String field : spec.split(",")) {
            int colon = field.indexOf(':'); String key = field.substring(0, colon), type = field.substring(colon + 1);
            boolean optional = key.startsWith("?"); if (optional) key = key.substring(1); if (optional && !raw.has(key)) continue;
            out.set(camel(key), value(raw.get(key), type));
        } return out;
    }
    private static JsonNode value(JsonNode n, String type) {
        check(n != null); if (type.startsWith("~")) { if (n.isNull()) return n; type = type.substring(1); }
        switch (type) {
            case "null" -> check(n.isNull());
            case "bool" -> check(n.isBoolean());
            case "count" -> check(n.isIntegralNumber() && n.canConvertToLong() && n.asLong() >= 0 && n.asLong() <= 1_000_000_000);
            case "number" -> check(n.isNumber() && Double.isFinite(n.asDouble()) && Math.abs(n.asDouble()) <= 1e15);
            case "day" -> { check(n.isTextual()); TwStocksProjection.date(n.textValue()); }
            case "stamp" -> { check(n.isTextual() && n.textValue().length() <= 40 && n.textValue().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})")); TwStocksProjection.date(n.textValue().substring(0, 10)); OffsetDateTime.parse(n.textValue()); }
            case "id" -> check(n.isTextual() && n.textValue().matches("[0-9a-f]{32}"));
            case "textId" -> { check(n.isTextual()); reportId(n.textValue()); }
            case "symbol" -> check(n.isTextual() && n.textValue().matches("[A-Za-z0-9]{1,16}"));
            case "text" -> check(n.isTextual() && n.textValue().codePointCount(0, n.textValue().length()) >= 1 && n.textValue().codePointCount(0, n.textValue().length()) <= 160 && n.textValue().matches("[\\p{L}\\p{N}_ ()&.,-]+") && !n.textValue().toUpperCase(Locale.ROOT).matches(".*\\b(BUY|SELL|BUY_SIGNAL|SELL_SIGNAL|AI_TRADE_DECISION)\\b.*"));
            case "markdown" -> {
                check(n.isTextual() && n.textValue().getBytes(StandardCharsets.UTF_8).length <= 65536);
                // Any absolute path token is unsafe, regardless of Unix root. Spaced prose slashes remain valid.
                check(!java.util.regex.Pattern.compile("(?i)(?:(?<!\\w)[a-z]:[\\\\/]|\\\\\\\\|file:|(?<![\\w/<])/[^\\s/<>]+)").matcher(n.textValue()).find());
            }
            default -> check(n.isTextual() && Arrays.asList(type.split("\\|")).contains(n.textValue()));
        } return n.deepCopy();
    }
    private static ArrayNode values(JsonNode raw, String type, int max) { return rows(raw, max, x -> value(x, type)); }
    private static JsonNode nullableValues(JsonNode raw, String type, int max) { return nullableRows(raw, max, x -> value(x, type)); }
    private static ArrayNode rows(JsonNode raw, int max, Function<JsonNode, ? extends JsonNode> project) {
        check(raw != null && raw.isArray() && raw.size() <= max); var out = JsonNodeFactory.instance.arrayNode(); raw.forEach(x -> out.add(project.apply(x))); return out;
    }
    private static JsonNode nullableRows(JsonNode raw, int max, Function<JsonNode, ? extends JsonNode> project) { check(raw != null); return raw.isNull() ? raw : rows(raw, max, project); }
    private static JsonNode counts(JsonNode raw, String keys, boolean nullable, boolean nullableCounts) {
        check(raw != null); if (nullable && raw.isNull()) return raw; object(raw); var out = JsonNodeFactory.instance.objectNode(); var allowed = Arrays.asList(keys.split("\\|"));
        raw.fields().forEachRemaining(e -> { check(allowed.contains(e.getKey())); out.set(e.getKey(), value(e.getValue(), nullableCounts ? "~count" : "count")); }); return out;
    }
    private static void before(JsonNode node, String start, String end) {
        if (!node.path(start).isNull() && !node.path(end).isNull()) check(!OffsetDateTime.parse(node.path(start).asText()).toInstant().isAfter(OffsetDateTime.parse(node.path(end).asText()).toInstant()));
    }
    private static String camel(String key) { String[] parts = key.split("_"); var out = new StringBuilder(parts[0]); for (int i = 1; i < parts.length; i++) out.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1)); return out.toString(); }
    private static boolean contains(JsonNode array, String value) { for (var n : array) if (n.asText().equals(value)) return true; return false; }
    private static void unique(JsonNode array, String key) { var seen = new HashSet<String>(); for (var n : array) check(seen.add(n.path(key).asText())); }
    private static void object(JsonNode n) { check(n != null && n.isObject()); }
    private static void check(boolean valid) { if (!valid) throw new IllegalArgumentException("INVALID_TW_REPORTS_SOURCE"); }
}
