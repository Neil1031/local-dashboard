package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.*;
import java.util.*;

/** Dashboard's consumed-field allowlist, not a second source schema or raw payload proxy. */
final class TwStocksProjection {
    static final String VERSION = "tw-daily-accumulation-v1";
    private static final String RESULT = "SUCCESS|PARTIAL|FAILED|SKIPPED_NON_TRADING_DAY";
    private static final String STATUS = RESULT + "|RUNNING|ABANDONED|NOT_DUE|NOT_CHECKED|UNKNOWN|UNAVAILABLE|NOT_REQUESTED|IMPORTED";
    private static final String COVERAGE = "COMPLETE|PARTIAL|UNKNOWN|UNAVAILABLE";
    private static final String DIAGNOSTICS = "AVAILABLE|UNAVAILABLE|LEGACY_DIAGNOSTICS_UNAVAILABLE";
    private static final String SOURCE_NAMES = "annual-calendar|closure-announcements|official-disclosures|corporate-actions|security-status|capital-suspensions|candidate-original-news|TPEX:quote-scopes|TWSE:master|TWSE:prices|TWSE:institutional|TPEX:master|TPEX:prices|TPEX:institutional";
    private static final String REASONS = "ATTEMPT_DATES_UNAVAILABLE|BASELINE_DIAGNOSTICS_INVALID|CANDIDATE_INVALID|COLLECTION_LIMIT_EXCEEDED|DATABASE_CHANGED_DURING_READ|DATABASE_MISSING|DATABASE_UNAVAILABLE|FINALIZED_JOURNAL_BINDING_MISMATCH|FINALIZED_JOURNAL_BINDING_UNAVAILABLE|JOURNAL_CHANGED_DURING_READ|JOURNAL_INVALID|JOURNAL_MISSING|JOURNAL_UNAVAILABLE|LATEST_ATTEMPT_UNAVAILABLE|LEGACY_DIAGNOSTICS_UNAVAILABLE|LEGACY_MAPPING_DIAGNOSTICS_UNAVAILABLE|LEGACY_PUBLIC_INFO_CHECK_UNAVAILABLE|MARKET_DIAGNOSTICS_INVALID|MARKET_DIAGNOSTICS_UNAVAILABLE|OBSERVATION_IDENTITY_MISMATCH|OBSERVATION_UNAVAILABLE|PROJECTION_SANITIZED|PUBLIC_INFO_CHECK_INVALID|READINESS_UNAVAILABLE|RESULT_IDENTITY_MISMATCH|RESULT_INVALID|RESULT_UNAVAILABLE|SCOPE_UNAVAILABLE|SOURCE_HEADERS_INVALID|SOURCE_HEADERS_MISMATCH|SOURCE_HEADERS_UNAVAILABLE|SQLITE_HEADER_INVALID|SQLITE_SIDECAR_UNSUPPORTED|SQLITE_WAL_UNSUPPORTED|TARGET_BEFORE_SCOPE|TARGET_DATE_INVALID|WEEKLY_BINDING_MISMATCH|WEEKLY_BINDING_UNAVAILABLE|WEEKLY_CHANGED_DURING_READ|WEEKLY_MISSING|WEEKLY_POINTER_INVALID|WEEKLY_POINTER_MISSING|WEEKLY_POINTER_STALE|WEEKLY_REPORT_INVALID|WEEKLY_STALE|WEEKLY_UNAVAILABLE";
    static class Unsupported extends RuntimeException {}
    static String date(String s) {
        if (s == null) return null;
        try { if (!s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || s.startsWith("0000-") || !LocalDate.parse(s).toString().equals(s)) throw new IllegalArgumentException(); }
        catch (DateTimeException e) { throw new IllegalArgumentException(); }
        return s;
    }
    static ObjectNode envelope(String date, String state, ObjectMapper json) {
        var r = json.createObjectNode().put("contractVersion", 1).put("sourceContractVersion", VERSION)
                .put("dataState", state).put("observedAt", Instant.now().toString());
        r.putObject("query").put("mode", date == null ? "LATEST_FINALIZED" : "TARGET_DATE").put("targetDate", date);
        for (String key : List.of("generatedAt", "snapshot", "scope", "latestAttempt", "latestFinalized", "observation", "responsibility", "weeklyCheck")) r.putNull(key);
        r.putArray("warnings");
        return r;
    }
    static ObjectNode normalize(JsonNode source, String target, int exit, ObjectMapper json) {
        object(source);
        if (!VERSION.equals(source.path("contract_version").textValue())) throw new Unsupported();
        var query = fields(source.path("query"), "mode:LATEST_FINALIZED|TARGET_DATE,target_date:~day");
        check(source.path("query").size() == 2 && source.path("pagination").isObject() && source.path("pagination").size() == 1);
        check(query.path("mode").asText().equals(target == null ? "LATEST_FINALIZED" : "TARGET_DATE")
                && Objects.equals(query.path("targetDate").textValue(), target));
        check("NONE".equals(source.path("pagination").path("mode").textValue()));
        var snapshot = fields(source.path("snapshot"), "state:COHERENT|PARTIAL|UNAVAILABLE,read_only:true,read_started_at:stamp,read_finished_at:stamp");
        snapshot.set("reasonCodes", values(source.path("snapshot").path("reason_codes"), REASONS, 46));
        check(!after(snapshot, "readStartedAt", "readFinishedAt"));
        String state = snapshot.path("state").asText();
        check(exit == (state.equals("COHERENT") ? 0 : 2));
        var r = envelope(target, state, json);
        r.set("query", query); r.set("snapshot", snapshot);
        r.set("generatedAt", value(source.get("generated_at"), "stamp"));
        check(!OffsetDateTime.parse(r.path("generatedAt").asText()).toInstant().isBefore(OffsetDateTime.parse(snapshot.path("readFinishedAt").asText()).toInstant()));
        var scope = fields(source.path("scope"), "state:AVAILABLE|UNAVAILABLE,mode:~DAILY_ACCUMULATION,start_date:~day");
        if (scope.path("state").asText().equals("AVAILABLE")) check(!scope.path("mode").isNull() && !scope.path("startDate").isNull());
        else check(scope.path("mode").isNull() && scope.path("startDate").isNull());
        r.set("scope", scope);
        object(source.path("status_summary"));
        JsonNode attempt = source.path("status_summary").get("latest_attempt"), finalized = source.path("status_summary").get("latest_finalized");
        check(attempt != null && finalized != null);
        if (!attempt.isNull()) {
            var a = fields(attempt, "run_id:~id,state:DONE|RETRY|RUNNING|UNKNOWN,status:" + STATUS + ",created_at:~stamp,started_at:~stamp,finished_at:~stamp,business_finalized:~bool");
            a.set("scheduledDates", nullableValues(attempt.get("scheduled_dates"), "day", 256));
            if (a.path("state").asText().equals("UNKNOWN")) check(a.path("runId").isNull() && a.path("status").asText().equals("UNKNOWN"));
            else check(!a.path("runId").isNull() && !a.path("createdAt").isNull());
            if (!a.path("startedAt").isNull() && !a.path("finishedAt").isNull()) check(!after(a, "startedAt", "finishedAt"));
            r.set("latestAttempt", a);
        }
        if (!finalized.isNull()) r.set("latestFinalized", fields(finalized, "run_id:id,target_date:day,finished_at:stamp,status:" + RESULT));
        JsonNode rawObservation = source.get("observation"); check(rawObservation != null);
        if (!rawObservation.isNull()) {
            var o = observation(rawObservation);
            check(!finalized.isNull());
            for (String key : List.of("runId", "targetDate", "finishedAt", "status")) check(o.get(key).equals(r.path("latestFinalized").get(key)));
            check(target == null || o.path("targetDate").asText().equals(target));
            r.set("observation", o);
        } else check(finalized.isNull());
        if (state.equals("COHERENT")) check(!rawObservation.isNull() && scope.path("state").asText().equals("AVAILABLE") && snapshot.path("reasonCodes").isEmpty()
                && r.path("observation").path("targetDate").asText().compareTo(scope.path("startDate").asText()) >= 0);
        if (state.equals("UNAVAILABLE")) check(rawObservation.isNull() && (attempt.isNull() || r.path("latestAttempt").path("runId").isNull()));
        r.set("responsibility", responsibility(source.path("responsibility")));
        var weekly = fields(source.path("weekly_check"), "state:AVAILABLE|STALE|UNAVAILABLE,check_run_id:~id,checked_at:~stamp,week_start:~day,week_end:~day,status:SUCCESS|FAILED|NOT_DUE|UNKNOWN,problem_count:~count,pending_revalidation_count:~count,unfinished_run_count:~count,binding:INDEPENDENT|SELECTED_RESULT|UNKNOWN,pointer_state:CORROBORATED|INVALID|MISSING|STALE|UNKNOWN");
        weekly.set("dayStatusCounts", counts(source.path("weekly_check").get("day_status_counts"), RESULT, true));
        if (weekly.path("state").asText().equals("UNAVAILABLE")) check(weekly.path("checkRunId").isNull() && weekly.path("status").asText().equals("UNKNOWN"));
        else {
            for (String key : List.of("checkRunId", "checkedAt", "weekStart", "weekEnd", "problemCount", "pendingRevalidationCount", "unfinishedRunCount", "dayStatusCounts")) check(!weekly.path(key).isNull());
            var end = LocalDate.parse(weekly.path("weekEnd").asText());
            check(end.getDayOfWeek() == DayOfWeek.FRIDAY && end.minusDays(4).toString().equals(weekly.path("weekStart").asText()));
        }
        if (weekly.path("binding").asText().equals("SELECTED_RESULT")) check(!rawObservation.isNull());
        if (state.equals("UNAVAILABLE")) check(weekly.path("checkRunId").isNull());
        r.set("weeklyCheck", weekly);
        r.set("warnings", snapshot.path("reasonCodes").deepCopy());
        if (containsRedaction(r)) r.withArray("warnings").add("SOURCE_TEXT_LOCAL_PATH_REDACTED");
        return r;
    }
    private static ObjectNode observation(JsonNode raw) {
        var o = fields(raw, "run_id:id,target_date:day,finished_at:stamp,status:" + RESULT + ",classification_status:WARMING_UP|OBSERVATIONS_AVAILABLE|UNAVAILABLE|NOT_APPLICABLE|NO_MARKET_DATA|UNKNOWN,strategy_status:OUT_OF_SCOPE|UNKNOWN");
        var identity = fields(raw.path("identity"), "run_id:id,target_date:day");
        check(raw.path("identity").size() == 2);
        check(identity.path("runId").equals(o.path("runId")) && identity.path("targetDate").equals(o.path("targetDate")));
        o.set("identity", identity);
        var sources = o.putArray("sources"); var names = new HashSet<String>();
        for (var row : array(raw.path("sources"), 64)) {
            check(!row.has("run_id") && !row.has("target_date") && !row.has("identity"));
            var s = fields(row, "name:" + SOURCE_NAMES + ",status:SUCCESS|PARTIAL|FAILED,started_at:stamp,finished_at:stamp,reason_code:SOURCE_SUCCESS|SOURCE_PARTIAL|SOURCE_FAILED");
            check(names.add(s.path("name").asText()) && !after(s, "startedAt", "finishedAt") && s.path("reasonCode").asText().equals("SOURCE_" + s.path("status").asText())); sources.add(s);
        }
        var markets = o.putArray("markets"); var marketIds = new HashSet<String>();
        for (var row : array(raw.path("markets"), 2)) {
            var m = fields(row, "market:TWSE|TPEX,complete:?bool,quote_scope_complete:?bool,rows:?count,expected_master_symbols:?count,fresh_rows:?count,unpriced_unknown_count:?count,status_unknown_count:?count,quote_scope_status:?" + STATUS);
            check(marketIds.add(m.path("market").asText())); markets.add(m);
        }
        var baseline = fields(raw.path("baseline_session_diagnostics"), "state:" + DIAGNOSTICS);
        var records = baseline.putArray("records"); var diagnosticIds = new HashSet<String>();
        for (var row : array(raw.path("baseline_session_diagnostics").path("records"), 5000)) {
            var b = fields(row, "symbol:symbol,status:READY|INSUFFICIENT_HISTORY|BASELINE_SESSION_GAP,reason_code:READY|SCOPE_UNAVAILABLE|CALENDAR_UNKNOWN|CALENDAR_ALIAS_CONFLICT|VALID_RANGE_HAS_TOO_FEW_SESSIONS|INVALID_BASELINE_SESSIONS|EXPECTED_PRICE_SESSION_MISSING,reason_date:?day,lower_bound:?day");
            check(diagnosticIds.add(b.path("symbol").asText()));
            for (String key : List.of("expected_dates", "missing_dates", "actual_dates")) if (row.has(key)) b.set(camel(key), key.equals("expected_dates") ? values(row.get(key), "day", 256) : nullableValues(row.get(key), "day", 256));
            records.add(b);
        }
        o.set("baselineSessionDiagnostics", baseline);
        var mapping = fields(raw.path("mapping_diagnostics"), "state:AVAILABLE|UNAVAILABLE|LEGACY_DIAGNOSTICS_UNAVAILABLE");
        mapping.set("unmappedSymbols", nullableValues(raw.path("mapping_diagnostics").get("unmapped_symbols"), "symbol", 5000));
        JsonNode exclusions = raw.path("mapping_diagnostics").get("recognized_exclusions"); check(exclusions != null);
        var blocked = new HashSet<String>(); if (mapping.path("unmappedSymbols").isArray()) mapping.path("unmappedSymbols").forEach(n -> blocked.add(n.asText()));
        if (exclusions.isNull()) mapping.putNull("recognizedExclusions"); else {
            var list = mapping.putArray("recognizedExclusions"); var keys = new HashSet<String>();
            for (var row : array(exclusions, 5000)) {
                var e = fields(row, "symbol:symbol,market:TWSE|TPEX,source:TWSE:master|TPEX:master,source_date:day,reason_code:OFFICIAL_TDR_OUTSIDE_COMMON_STOCK_UNIVERSE");
                check(e.path("source").asText().equals(e.path("market").asText() + ":master") && keys.add(e.path("market").asText() + ":" + e.path("symbol").asText()));
                blocked.add(e.path("symbol").asText()); list.add(e);
            }
        }
        if (mapping.path("state").asText().equals("AVAILABLE")) check(!mapping.path("unmappedSymbols").isNull() && !mapping.path("recognizedExclusions").isNull());
        o.set("mappingDiagnostics", mapping);
        var readiness = fields(raw.path("readiness"), "warming_symbols:~count,reason_code:NO_ELIGIBLE_OBSERVATION_SYMBOLS|NO_MARKET_DATA|READINESS_UNAVAILABLE|SAVED_READINESS");
        readiness.set("skippedCounts", counts(raw.path("readiness").get("skipped_counts"), "INSUFFICIENT_HISTORY|BASELINE_SESSION_GAP|ZERO_VOLUME_OR_RECENT_HALT|BELOW_ANOMALY_THRESHOLD", true));
        readiness.set("pendingCandidateNews", nullableValues(raw.path("readiness").get("pending_candidate_news"), "symbol", 5000)); o.set("readiness", readiness);
        var candidates = o.putArray("candidates"); var symbols = new HashSet<String>();
        for (var row : array(raw.path("candidates"), 5000)) {
            check(!row.has("run_id") && !row.has("target_date") && !row.has("identity"));
            var c = fields(row, "symbol:symbol,market:TWSE|TPEX,signal_date:day,classification:UNEXPLAINED_VOLUME|POSSIBLY_UNEXPLAINED|PUBLIC_INFO_COVERAGE_GAP|PUBLIC_INFO_FOUND|POST_CLOSE_PUBLIC_INFO_FOUND|MECHANICAL_EVENT_EXCLUDED,classification_basis:AS_KNOWN|POINT_IN_TIME_AS_KNOWN|LATEST_FINALIZABLE,coverage_status:" + COVERAGE + ",analysis_eligible:null,analysis_eligible_semantics:NOT_APPLICABLE_DAILY_OBSERVATION,stock_name:?text,anomaly_rank:?count,anomaly_score:?number,volume_ratio:?number,volume_zscore:?number,baseline_volume:?number");
            check(c.path("signalDate").equals(o.path("targetDate")) && symbols.add(c.path("symbol").asText()) && !blocked.contains(c.path("symbol").asText()));
            var p = fields(row.path("public_info_check"), "record_exists:~bool,status:" + STATUS + ",succeeded:~bool,checked_at:~stamp,as_of:~stamp,coverage_status:" + COVERAGE + ",reason_code:LEGACY_PUBLIC_INFO_CHECK_UNAVAILABLE|PUBLIC_INFO_CHECK_INVALID|SAVED_PUBLIC_INFO_CHECK");
            boolean invalidCheck = p.path("reasonCode").asText().equals("PUBLIC_INFO_CHECK_INVALID");
            check(invalidCheck || p.path("coverageStatus").equals(c.path("coverageStatus")) || p.path("reasonCode").asText().equals("LEGACY_PUBLIC_INFO_CHECK_UNAVAILABLE"));
            if (!p.path("recordExists").asBoolean(false)) check(p.path("succeeded").isNull() && p.path("checkedAt").isNull());
            if (p.path("succeeded").asBoolean(false) || p.path("status").asText().equals("SUCCESS")) check(p.path("recordExists").asBoolean(false) && p.path("succeeded").asBoolean(false) && p.path("status").asText().equals("SUCCESS") && !p.path("checkedAt").isNull());
            if (!p.path("checkedAt").isNull() && !p.path("asOf").isNull()) check(!after(p, "checkedAt", "asOf"));
            c.set("publicInfoCheck", p); c.set("riskFlags", values(row.path("risk_flags"), "OFFICIAL_CONTENT_VERSION_UNKNOWN|LARGE_SAME_DAY_PRICE_MOVE|PUBLIC_INFO_COVERAGE_INCOMPLETE|MECHANICAL_CORPORATE_ACTION|POST_CLOSE_PUBLIC_INFO", 32)); candidates.add(c);
        }
        var summary = fields(raw.path("candidate_summary"), "state:AVAILABLE|UNKNOWN,saved_candidate_count:~count,saved_total_candidates_before_limit:~count,saved_truncated:~bool,exported_count:count");
        check(summary.path("exportedCount").asInt() == candidates.size());
        if (summary.path("state").asText().equals("AVAILABLE")) {
            check(!summary.path("savedCandidateCount").isNull() && !summary.path("savedTotalCandidatesBeforeLimit").isNull() && !summary.path("savedTruncated").isNull());
            long saved = summary.path("savedCandidateCount").asLong(), total = summary.path("savedTotalCandidatesBeforeLimit").asLong();
            check(total >= saved && saved >= candidates.size() && summary.path("savedTruncated").asBoolean() == (total > saved));
        }
        o.set("candidateSummary", summary); return o;
    }
    private static ObjectNode responsibility(JsonNode raw) {
        var r = fields(raw, "state:AVAILABLE|PARTIAL|UNKNOWN,pending_count:~count,unfinished_count:~count,truncated:bool");
        JsonNode pending = raw.get("pending_revalidation"), unfinished = raw.get("unfinished_runs"); check(pending != null && unfinished != null);
        if (pending.isNull()) r.putNull("pendingRevalidation"); else {
            var rows = r.putArray("pendingRevalidation"); var ids = new HashSet<String>();
            for (var row : array(pending, 5000)) { var p = fields(row, "target_date:day,origin_run_id:id,required_at:stamp"); check(ids.add(p.toString())); rows.add(p); }
        }
        if (unfinished.isNull()) r.putNull("unfinishedRuns"); else {
            var rows = r.putArray("unfinishedRuns"); var ids = new HashSet<String>();
            for (var row : array(unfinished, 1000)) { var u = fields(row, "run_id:id,state:RUNNING|RETRY"); check(ids.add(u.path("runId").asText())); u.set("relevantTargetDates", nullableValues(row.get("relevant_target_dates"), "day", 256)); rows.add(u); }
        }
        if (r.path("state").asText().equals("UNKNOWN")) check(pending.isNull() && unfinished.isNull() && r.path("pendingCount").isNull() && r.path("unfinishedCount").isNull());
        if (r.path("truncated").asBoolean()) check(r.path("pendingCount").isNull() && r.path("unfinishedCount").isNull());
        if (r.path("state").asText().equals("AVAILABLE")) check(!pending.isNull() && !unfinished.isNull() && !r.path("pendingCount").isNull() && !r.path("unfinishedCount").isNull() && !r.path("truncated").asBoolean()
                && r.path("pendingCount").asInt() == pending.size() && r.path("unfinishedCount").asInt() == unfinished.size());
        return r;
    }
    private static ObjectNode fields(JsonNode raw, String spec) {
        object(raw); var out = JsonNodeFactory.instance.objectNode();
        for (String field : spec.split(",")) {
            int colon = field.indexOf(':'); String key = field.substring(0, colon), type = field.substring(colon + 1);
            if (type.startsWith("?") && !raw.has(key)) continue;
            out.set(camel(key), value(raw.get(key), type.startsWith("?") ? type.substring(1) : type));
        }
        return out;
    }
    private static JsonNode value(JsonNode n, String type) {
        check(n != null);
        if (type.startsWith("~")) { if (n.isNull()) return NullNode.instance; type = type.substring(1); }
        if (type.equals("null")) { check(n.isNull()); return NullNode.instance; }
        if (type.equals("bool") || type.equals("true")) { check(n.isBoolean() && (!type.equals("true") || n.booleanValue())); return n.deepCopy(); }
        if (type.equals("count")) { check(n.isIntegralNumber() && n.canConvertToLong() && n.longValue() >= 0 && n.longValue() <= 1_000_000_000); return n.deepCopy(); }
        if (type.equals("number")) { check(n.isNumber() && Double.isFinite(n.doubleValue())); return n.deepCopy(); }
        check(n.isTextual()); String s = n.textValue();
        switch (type) {
            case "id" -> check(s.matches("[0-9a-f]{32}"));
            case "symbol" -> check(s.matches("[A-Za-z0-9]{1,16}"));
            case "day" -> date(s);
            case "stamp" -> { check(s.length() <= 40 && !s.startsWith("0000-") && s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})")); date(s.substring(0,10)); OffsetDateTime.parse(s); }
            case "text" -> { check(!s.isBlank() && s.length() <= 100); s = InsiderSignalsAdapter.safeText(s); }
            default -> check(Arrays.asList(type.split("\\|", -1)).contains(s));
        }
        return TextNode.valueOf(s);
    }
    private static ArrayNode values(JsonNode raw, String type, int max) {
        var a = JsonNodeFactory.instance.arrayNode(); var seen = new HashSet<JsonNode>();
        for (var n : array(raw, max)) { JsonNode v = value(n, type); check(seen.add(v)); a.add(v); } return a;
    }
    private static JsonNode nullableValues(JsonNode raw, String type, int max) { check(raw != null); return raw.isNull() ? NullNode.instance : values(raw, type, max); }
    private static JsonNode counts(JsonNode raw, String names, boolean nullable) {
        check(raw != null); if (nullable && raw.isNull()) return NullNode.instance;
        object(raw); var out = JsonNodeFactory.instance.objectNode(); var allowed = Arrays.asList(names.split("\\|"));
        raw.fields().forEachRemaining(e -> { check(allowed.contains(e.getKey())); out.set(e.getKey(), value(e.getValue(), "count")); }); return out;
    }
    private static JsonNode array(JsonNode n, int max) { check(n != null && n.isArray() && n.size() <= max); return n; }
    private static void object(JsonNode n) { check(n != null && n.isObject()); }
    private static void check(boolean ok) { if (!ok) throw new IllegalStateException("Invalid TW source contract"); }
    private static boolean after(JsonNode n, String a, String b) { return OffsetDateTime.parse(n.path(a).asText()).toInstant().isAfter(OffsetDateTime.parse(n.path(b).asText()).toInstant()); }
    private static String camel(String name) { StringBuilder out = new StringBuilder(); boolean up = false; for (char c : name.toCharArray()) { if (c == '_') up = true; else { out.append(up ? Character.toUpperCase(c) : c); up = false; } } return out.toString(); }
    private static boolean containsRedaction(JsonNode n) { if (n.isTextual()) return n.textValue().contains("[local path omitted]"); if (n.isContainerNode()) for (var child : n) if (containsRedaction(child)) return true; return false; }
}
