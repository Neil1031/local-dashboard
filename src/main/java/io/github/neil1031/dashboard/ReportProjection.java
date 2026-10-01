package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.*;
import java.util.*;

/** Allowlisted Reports v1 projection. No SQL, paths, inferred titles or historical signal membership. */
final class ReportProjection {
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    static String date(String value, boolean required) {
        if (!required && (value == null || value.isEmpty())) return null;
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
        try { var parsed = LocalDate.parse(value); if (parsed.getYear() < 1 || !parsed.toString().equals(value)) throw new IllegalArgumentException(); }
        catch (java.time.format.DateTimeParseException e) { throw new IllegalArgumentException(); }
        return value;
    }
    static ObjectNode envelope(String state, int limit, int offset, boolean detail, ObjectMapper json) {
        var result = json.createObjectNode().put("contractVersion", 1).put("dataState", state).put("observedAt", Instant.now().toString());
        if (detail) result.putNull("item"); else result.putArray("items");
        result.putObject(detail ? "revisionPage" : "page").put("limit", limit).put("offset", offset).put("hasMore", false).putNull("nextOffset");
        result.putArray("sources").addObject().put("sourceId", "insider-report-documents").put("sourceVersion", 1)
                .put("sourceType", "US Insider / AI report").putNull("lastObservedAt");
        result.putArray("warnings").add("COUNTS_ARE_CURRENT_RETAINED_ROWS").add("REVISIONS_ARE_BODY_HASH_HISTORY")
                .add("NOT_PIT_SNAPSHOT").add("NO_SEMANTIC_DIFF");
        return result;
    }
    static ObjectNode normalize(JsonNode source, String filter, int limit, int offset, boolean detail, ObjectMapper json) {
        if (source == null || !source.isObject()) throw new IllegalStateException();
        if (!integer(source.path("contract_version"), 1) || !source.path("source").isTextual()
                || !source.path("source").textValue().equals("reports")) throw new InsiderSignalsAdapter.InvalidContract();
        var response = envelope("READY", limit, offset, detail, json);
        if (detail) {
            var report = source.path("report"); var item = summary(report, filter, json, response);
            JsonNode body = report.path("raw_markdown"); if (!body.isTextual()) throw new IllegalStateException();
            // Source-authored body is faithful untrusted text, not a filesystem/config field.
            // Consumers render it only as DOM text; no body truncation, HTML or path links.
            item.put("rawMarkdown", body.textValue());
            String status = text(report, "current_revision_status", false);
            if (!Set.of("MATCHED", "MISSING").contains(status)) throw new IllegalStateException();
            JsonNode current = report.path("current_revision_id");
            if (status.equals("MATCHED") ? !positive(current) : !current.isNull()) throw new IllegalStateException();
            item.put("currentRevisionStatus", status).set("currentRevisionId", current);
            var rows = report.path("revisions"); if (!rows.isArray() || rows.size() > limit) throw new IllegalStateException();
            var revisions = item.putArray("revisions"); var ids = new HashSet<Long>();
            for (var row : rows) {
                var id = row.path("revision_id"); var flag = row.path("is_current");
                if (!positive(id) || !ids.add(id.longValue()) || !flag.isBoolean()) throw new IllegalStateException();
                var r = revisions.addObject(); r.set("revisionId", id); r.put("isCurrent", flag.booleanValue());
                copyText(row, r, "content_hash", "contentHash"); copyText(row, r, "imported_at", "importedAt");
                boolean sameHash = Objects.equals(r.get("contentHash"), item.get("contentHash"));
                if (flag.booleanValue() != sameHash || (sameHash && (!status.equals("MATCHED") || !id.equals(current)))) throw new IllegalStateException();
            }
            long count = item.path("revisionCount").longValue();
            if (rows.size() > count || (status.equals("MATCHED") && count == 0)) throw new IllegalStateException();
            boolean more = page(report.path("revision_pagination"), rows, limit, offset, response.withObject("revisionPage"), response);
            if (more != (count > (long) offset + limit) || rows.size() != Math.min(limit, Math.max(0L, count - offset))) throw new IllegalStateException();
            response.set("item", item);
        } else {
            var rows = source.path("reports"); if (!rows.isArray() || rows.size() > limit) throw new IllegalStateException();
            page(source, rows, limit, offset, response.withObject("page"), response);
            var ids = new HashSet<String>();
            for (var row : rows) { var item = summary(row, filter, json, response); if (!ids.add(item.path("reportId").textValue())) throw new IllegalStateException(); response.withArray("items").add(item); }
            if (rows.isEmpty()) response.put("dataState", "EMPTY");
        }
        ((ObjectNode) response.withArray("sources").get(0)).put("lastObservedAt", response.path("observedAt").textValue());
        return response;
    }
    private static ObjectNode summary(JsonNode row, String filter, ObjectMapper json, ObjectNode response) {
        if (!row.isObject()) throw new IllegalStateException();
        String reportDate = text(row, "report_date", false); date(reportDate, true);
        String id = text(row, "report_id", false);
        if (!id.equals("report:" + reportDate) || filter != null && !filter.equals(reportDate)) throw new IllegalStateException();
        var item = json.createObjectNode().put("reportId", id).put("reportDate", reportDate);
        for (var pair : new String[][]{{"imported_at","importedAt"},{"content_hash","contentHash"},{"created_at","createdAt"},{"updated_at","updatedAt"}})
            copyText(row, item, pair[0], pair[1]);
        var warnings = row.path("parse_warnings"); if (!warnings.isArray()) throw new IllegalStateException();
        var output = item.putArray("parseWarnings"); boolean redacted = false;
        for (var warning : warnings) {
            if (!warning.isTextual()) throw new IllegalStateException(); String safe = InsiderSignalsAdapter.safeText(warning.textValue());
            redacted |= !safe.equals(warning.textValue()); output.add(safe);
        }
        if (redacted && !response.path("warnings").toString().contains("\"SOURCE_WARNING_LOCAL_PATH_REDACTED\""))
            response.withArray("warnings").add("SOURCE_WARNING_LOCAL_PATH_REDACTED");
        for (var pair : new String[][]{{"stored_signal_count","storedSignalCount"},{"active_signal_count","activeSignalCount"},{"revision_count","revisionCount"}}) {
            var count = row.path(pair[0]); if (!nonnegative(count)) throw new IllegalStateException(); item.set(pair[1], count);
        }
        if (item.path("activeSignalCount").longValue() > item.path("storedSignalCount").longValue()) throw new IllegalStateException();
        return item;
    }
    private static boolean page(JsonNode source, JsonNode rows, int limit, int offset, ObjectNode output, ObjectNode response) {
        if (!source.isObject() || !integer(source.path("limit"), limit) || !integer(source.path("offset"), offset) || !source.path("has_more").isBoolean()) throw new IllegalStateException();
        boolean more = source.path("has_more").booleanValue(); var next = source.get("next_offset");
        if (next == null || (more ? rows.size() != limit || !integer(next, (long) offset + limit) : !next.isNull())) throw new IllegalStateException();
        boolean boundedMore = more && (long) offset + limit <= InsiderSignalsAdapter.MAX_OFFSET;
        output.put("hasMore", boundedMore); if (boundedMore) output.put("nextOffset", offset + limit);
        else if (more) response.withArray("warnings").add("PAGINATION_BOUND_REACHED");
        return more;
    }
    private static boolean integer(JsonNode value, long expected) { return value.isIntegralNumber() && value.canConvertToLong() && value.longValue() == expected; }
    private static boolean nonnegative(JsonNode value) { return value.isIntegralNumber() && value.canConvertToLong() && value.longValue() >= 0 && value.longValue() <= MAX_SAFE_INTEGER; }
    private static boolean positive(JsonNode value) { return nonnegative(value) && value.longValue() > 0; }
    private static String text(JsonNode source, String key, boolean nullable) {
        var value = source.get(key); if (value == null || (!value.isTextual() && !(nullable && value.isNull()))) throw new IllegalStateException();
        return value.isNull() ? null : value.textValue();
    }
    private static void copyText(JsonNode source, ObjectNode output, String from, String to) {
        String value = text(source, from, true); if (value == null) output.putNull(to); else output.put(to, InsiderSignalsAdapter.safeText(value));
    }
}
