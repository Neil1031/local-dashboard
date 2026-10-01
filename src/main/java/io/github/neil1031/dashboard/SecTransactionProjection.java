package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import static io.github.neil1031.dashboard.InsiderSignalsAdapter.*;

/** SEC-only whitelist. Source-position IDs and amendment rows are never reconciled here. */
final class SecTransactionProjection {
    private SecTransactionProjection() {}
    static void map(JsonNode row, ObjectNode item) {
        copyText(row, item, "filing_accepted_at", "filingAcceptedAt");
        copyStrings(row, item, "data_quality_flags", "qualityFlags");
        // v1 explicitly supplies no SEC scoring; reject a changed source contract.
        for (String key : List.of("signal", "investment")) {
            JsonNode score = row.path("scores").path(key);
            if (!score.isObject() || !score.has("value") || !score.get("value").isNull()
                    || !score.has("origin") || !score.get("origin").isNull()) throw new IllegalStateException();
        }
        JsonNode metadata = row.path("metadata"), index = metadata.path("transaction_index");
        if (!index.isIntegralNumber() || !index.canConvertToLong() || index.longValue() < 0) throw new IllegalStateException();
        item.set("transactionIndex", index);
        for (String[] field : new String[][] {
            {"transaction_code", "transactionCode"}, {"security_type", "securityType"},
            {"security_title", "securityTitle"}, {"acquired_disposed", "acquiredDisposed"},
            {"filing_date_source", "filingDateSource"}, {"filing_date_metadata_updated_at", "filingDateMetadataUpdatedAt"}})
            copyText(metadata, item, field[0], field[1]);
        for (String[] field : new String[][] {
            {"shares", "shares"}, {"insider_execution_price", "insiderExecutionPrice"},
            {"transaction_amount", "transactionAmount"}, {"ownership_after", "ownershipAfter"},
            {"ownership_increase_pct", "ownershipIncreasePct"}}) number(metadata, item, field[0], field[1]);
        bool(metadata, item, "is_direct", "isDirect", true);
        bool(metadata, item, "is_10b5_1", "is10b51", true);
        bool(metadata, item, "candidate_open_market_purchase", "candidateOpenMarketPurchase", false);
        bool(metadata, item, "review_required", "reviewRequired", false);
        JsonNode owners = metadata.path("reporting_owners");
        if (!owners.isArray()) throw new IllegalStateException();
        var ownerRows = item.putArray("reportingOwners");
        for (JsonNode owner : owners) {
            var o = ownerRows.addObject();
            copyText(owner, o, "name", "name"); copyText(owner, o, "cik", "cik");
            copyStrings(owner, o, "roles", "roles");
        }
        JsonNode footnotes = metadata.path("footnotes");
        if (!footnotes.isObject()) throw new IllegalStateException();
        var notes = item.putArray("footnotes");
        footnotes.fields().forEachRemaining(entry -> {
            if (entry.getKey().isBlank() || entry.getKey().length() > 32768 || !entry.getValue().isTextual()
                    || entry.getValue().textValue().length() > 32768) throw new IllegalStateException();
            notes.addObject().put("id", safeText(entry.getKey())).put("text", safeText(entry.getValue().textValue()));
        });
        JsonNode refs = row.path("source_references");
        if (!refs.isArray() || refs.isEmpty()) throw new IllegalStateException();
        var provenance = item.putArray("provenance"); boolean filing = false;
        for (JsonNode ref : refs) {
            String kind = required(ref, "kind"); JsonNode record = ref.path("record_id");
            if (!Set.of("sec_filing", "filing_date_provenance").contains(kind)
                    || !required(ref, "table").equals("filing_raw") || !record.isIntegralNumber()
                    || !record.canConvertToLong() || record.longValue() <= 0) throw new IllegalStateException();
            filing |= kind.equals("sec_filing");
            var p = provenance.addObject(); p.put("sourceType", kind).put("table", "filing_raw").set("recordId", record);
            for (String[] field : new String[][] {{"document_id", "documentId"}, {"content_hash", "contentHash"},
                {"first_observed_at", "firstObservedAt"}, {"last_observed_at", "lastObservedAt"}})
                copyText(ref, p, field[0], field[1]);
            // Raw URL/location and arbitrary metadata are deliberately absent.
        }
        if (!filing) throw new IllegalStateException();
    }
    private static void bool(JsonNode row, ObjectNode dest, String from, String to, boolean nullable) {
        JsonNode n = row.get(from);
        if (n == null || (!n.isBoolean() && !(nullable && n.isNull()))) throw new IllegalStateException();
        dest.set(to, n);
    }
}
