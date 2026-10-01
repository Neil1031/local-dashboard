package io.github.neil1031.dashboard;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/** Fixed read-only source command. No database driver, shell or configurable arguments. */
@Service
public class InsiderSignalsAdapter {
    private enum Operation {
        REPORTS("reports", "report:", "ai_report_assessment", "Imported AI report"),
        SEC("sec", "sec:", "insider_transaction", "SEC Transactions · partial");
        final String source, prefix, type, label;
        Operation(String source, String prefix, String type, String label) {
            this.source = source; this.prefix = prefix; this.type = type; this.label = label;
        }
    }
    static final int MAX_STDOUT = 2 * 1024 * 1024, MAX_STDERR = 64 * 1024, MAX_OFFSET = 1_000_000;
    private final InsiderProperties config;
    private final ObjectMapper json;
    private final Semaphore slots = new Semaphore(2);
    public InsiderSignalsAdapter(InsiderProperties config, ObjectMapper json) {
        this.config = config;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    static String ticker(String value) {
        if (value == null) return null;
        value = value.trim().toUpperCase(Locale.ROOT);
        if (!value.matches("[A-Z0-9][A-Z0-9.\\-]{0,15}")) throw new IllegalArgumentException();
        return value;
    }
    List<String> command(String ticker, int limit, int offset) {
        return command(Operation.REPORTS, ticker, limit, offset);
    }
    List<String> secCommand(String ticker, int limit, int offset) {
        return command(Operation.SEC, ticker, limit, offset);
    }
    private List<String> command(Operation operation, String ticker, int limit, int offset) {
        var args = new ArrayList<>(List.of(config.cliPath(), "--db", config.databasePath(),
                "list-signals", "--source", operation.source, "--limit", String.valueOf(limit), "--offset", String.valueOf(offset)));
        if (ticker != null) args.addAll(List.of("--ticker", ticker));
        return args;
    }
    public ObjectNode read(String inputTicker, int limit, int offset) {
        return read(Operation.REPORTS, inputTicker, limit, offset);
    }
    public ObjectNode readSec(String inputTicker, int limit, int offset) {
        return read(Operation.SEC, inputTicker, limit, offset);
    }
    private ObjectNode read(Operation operation, String inputTicker, int limit, int offset) {
        String ticker = ticker(inputTicker);
        if (limit < 1 || limit > 100 || offset < 0 || offset > MAX_OFFSET) throw new IllegalArgumentException();
        if (!config.enabled()) return unavailable(operation, limit, offset, "SOURCE_DISABLED");
        if (!configured()) return unavailable(operation, limit, offset, "SOURCE_NOT_CONFIGURED");
        if (!slots.tryAcquire()) return unavailable(operation, limit, offset, "SOURCE_BUSY");
        Process process = null;
        Thread outThread = null, errThread = null;
        try {
            process = start(command(operation, ticker, limit, offset));
            process.getOutputStream().close();
            var out = new Capture(process.getInputStream(), MAX_STDOUT);
            var err = new Capture(process.getErrorStream(), MAX_STDERR);
            outThread = Thread.startVirtualThread(out); errThread = Thread.startVirtualThread(err);
            if (!process.waitFor(config.timeoutSeconds(), TimeUnit.SECONDS)) {
                stop(process); return unavailable(operation, limit, offset, "SOURCE_TIMEOUT");
            }
            outThread.join(1000); errThread.join(1000);
            if (outThread.isAlive() || errThread.isAlive() || out.failed || err.failed)
                return failure(operation, limit, offset, "SOURCE_OUTPUT_ERROR");
            if (out.overflow || err.overflow) return failure(operation, limit, offset, "SOURCE_OUTPUT_LIMIT");
            if (process.exitValue() != 0) return unavailable(operation, limit, offset, "SOURCE_READ_FAILED");
            String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(out.bytes.toByteArray())).toString();
            return normalize(operation, json.readTree(text), ticker, limit, offset);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); return unavailable(operation, limit, offset, "SOURCE_INTERRUPTED");
        } catch (com.fasterxml.jackson.core.JsonProcessingException | java.nio.charset.CharacterCodingException e) {
            return failure(operation, limit, offset, "SOURCE_INVALID_OUTPUT");
        } catch (IOException e) {
            return unavailable(operation, limit, offset, "SOURCE_READ_FAILED");
        } catch (InvalidContract e) {
            return unavailable(operation, limit, offset, "SOURCE_CONTRACT_UNSUPPORTED");
        } catch (RuntimeException e) {
            return failure(operation, limit, offset, "SOURCE_INVALID_OUTPUT");
        } finally {
            if (process != null) { if (process.isAlive()) stop(process); close(process.getInputStream()); close(process.getErrorStream()); }
            if (outThread != null) outThread.interrupt();
            if (errThread != null) errThread.interrupt();
            slots.release();
        }
    }
    Process start(List<String> command) throws IOException {
        var builder = new ProcessBuilder(command);
        builder.environment().put("PYTHONDONTWRITEBYTECODE", "1");
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        builder.environment().put("PYTHONUTF8", "1");
        return builder.start();
    }
    private boolean configured() {
        try {
            Path cli = Path.of(config.cliPath()), db = Path.of(config.databasePath());
            String name = cli.getFileName().toString().toLowerCase(Locale.ROOT);
            return config.timeoutSeconds() >= 1 && config.timeoutSeconds() <= 30
                    && cli.isAbsolute() && db.isAbsolute() && Files.isRegularFile(cli) && Files.isRegularFile(db)
                    && !name.matches(".*\\.(bat|cmd|ps1|sh)")
                    && !Set.of("cmd.exe", "powershell.exe", "pwsh.exe", "bash", "sh").contains(name);
        } catch (RuntimeException e) { return false; }
    }
    private static void stop(Process p) {
        p.descendants().forEach(ProcessHandle::destroyForcibly); p.destroyForcibly();
    }
    private static void close(InputStream stream) { try { stream.close(); } catch (IOException ignored) {} }
    static final class Capture implements Runnable {
        final InputStream stream; final int max; final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        volatile boolean overflow, failed;
        Capture(InputStream stream, int max) { this.stream = stream; this.max = max; }
        public void run() {
            try (stream) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    int keep = Math.min(count, max - bytes.size());
                    if (keep > 0) bytes.write(buffer, 0, keep);
                    if (keep < count) overflow = true;
                }
            } catch (IOException e) { failed = true; }
        }
    }
    static class InvalidContract extends RuntimeException {}
    ObjectNode normalize(JsonNode source, String filter, int limit, int offset) {
        return normalize(Operation.REPORTS, source, filter, limit, offset);
    }
    ObjectNode normalizeSec(JsonNode source, String filter, int limit, int offset) {
        return normalize(Operation.SEC, source, filter, limit, offset);
    }
    private ObjectNode normalize(Operation operation, JsonNode source, String filter, int limit, int offset) {
        if (source == null || !source.isObject()) throw new IllegalStateException();
        if (!integer(source.path("contract_version"), 1)
                || !source.path("source").isTextual() || !source.path("source").textValue().equals(operation.source)) throw new InvalidContract();
        if (!integer(source.path("limit"), limit)
                || !integer(source.path("offset"), offset)
                || !source.path("has_more").isBoolean() || !source.path("signals").isArray()
                || source.path("signals").size() > limit) throw new IllegalStateException();
        boolean more = source.path("has_more").booleanValue();
        JsonNode next = source.get("next_offset");
        if (next == null || (more ? !integer(next, (long) offset + limit)
                || source.path("signals").size() != limit : !next.isNull())) throw new IllegalStateException();
        var response = envelope(operation, source.path("signals").isEmpty() ? "EMPTY" : "READY", limit, offset);
        ((ObjectNode) response.withArray("sources").get(0)).put("lastObservedAt", response.path("observedAt").textValue());
        // The source can advance beyond our public offset cap; expose only queryable pages.
        response.withObject("page").put("hasMore", more && offset + limit <= MAX_OFFSET);
        if (more && offset + limit <= MAX_OFFSET) response.withObject("page").put("nextOffset", offset + limit);
        else if (more) response.withArray("warnings").add("PAGINATION_BOUND_REACHED");
        var ids = new HashSet<String>();
        for (JsonNode row : source.path("signals")) {
            String id = required(row, "signal_id");
            if (!id.startsWith(operation.prefix) || id.length() == operation.prefix.length()
                    || !ids.add(id) || !required(row, "signal_type").equals(operation.type)) throw new IllegalStateException();
            if (filter != null && !filter.equalsIgnoreCase(row.path("ticker").asText())) throw new IllegalStateException();
            var item = response.withArray("items").addObject();
            copyText(row, item, "signal_id", "signalId"); copyText(row, item, "ticker", "ticker");
            copyText(row, item, "company_name", "company"); copyText(row, item, "event_date", "eventDate");
            copyText(row, item, "filing_date", "filingDate"); copyText(row, item, "discovered_at", "discoveredAt");
            copyText(row, item, "discovery_basis", "discoveryBasis"); copyText(row, item, "recorded_at", "recordedAt");
            copyText(row, item, "updated_at", "updatedAt");
            if (operation == Operation.SEC) {
                SecTransactionProjection.map(row, item);
                continue;
            }
            copyText(row, item, "positive_reasons", "positiveReasons"); copyText(row, item, "negative_reasons", "risks");
            var scores = item.putObject("scores");
            for (String key : List.of("signal", "investment")) {
                JsonNode score = row.path("scores").path(key);
                if (!required(score, "origin").equals("imported_ai_report")) throw new IllegalStateException();
                var result = scores.putObject(key); number(score, result, "value", "value"); result.put("origin", "imported_ai_report");
            }
            copyStrings(row, item, "data_quality_flags", "qualityFlags");
            JsonNode metadata = row.path("metadata");
            copyText(metadata, item, "report_date", "reportDate");
            number(metadata, item, "approximate_purchase_amount", "approximatePurchaseAmount");
            copyText(metadata, item, "person_name", "personName"); copyText(metadata, item, "person_role", "personRole");
            JsonNode buyers = metadata.path("buyers");
            if (!buyers.isArray()) throw new IllegalStateException();
            item.put("listedBuyerCount", buyers.size());
            var buyerRows = item.putArray("buyers");
            for (var buyer : buyers) {
                var b = buyerRows.addObject();
                for (String key : List.of("person_name", "person_role", "transaction_date", "filing_date")) copyText(buyer, b, key, key);
                for (String key : List.of("shares", "insider_execution_price", "transaction_amount")) number(buyer, b, key, key);
            }
            JsonNode refs = row.path("source_references");
            if (!refs.isArray() || refs.isEmpty()) throw new IllegalStateException();
            var provenance = item.putArray("provenance");
            for (var ref : refs) {
                if (!required(ref, "kind").equals("git_report") || !required(ref, "table").equals("report_revision")
                        || !ref.path("record_id").isIntegralNumber() || !ref.path("record_id").canConvertToLong()
                        || ref.path("record_id").longValue() <= 0) throw new IllegalStateException();
                var p = provenance.addObject(); p.put("sourceType", "git_report"); p.put("table", "report_revision");
                p.set("recordId", ref.get("record_id"));
                copyText(ref, p, "document_id", "documentId"); copyText(ref, p, "content_hash", "contentHash");
                copyText(ref, p, "first_observed_at", "firstObservedAt"); copyText(ref, p, "last_observed_at", "lastObservedAt");
                // location is deliberately absent; source metadata is never passed through.
            }
        }
        return response;
    }
    private static boolean integer(JsonNode n, long expected) {
        return n.isIntegralNumber() && n.canConvertToLong() && n.longValue() == expected;
    }
    static String required(JsonNode row, String key) {
        JsonNode n = row.get(key);
        if (n == null || !n.isTextual() || n.textValue().isBlank() || n.textValue().length() > 32768) throw new IllegalStateException();
        return n.textValue();
    }
    static void copyText(JsonNode row, ObjectNode dest, String from, String to) {
        JsonNode n = row.get(from);
        if (n == null || (!n.isNull() && (!n.isTextual() || n.textValue().length() > 32768))) throw new IllegalStateException();
        if (n.isNull()) dest.putNull(to); else dest.put(to, safeText(n.textValue()));
    }
    static String safeText(String text) {
        return text.replaceAll("(?i)(?:file://[^\\s<>\"']+|[a-z]:[\\\\/][^\\s<>\"']+|\\\\\\\\[^\\s<>\"']+|(?<![\\w:])/(?:[^\\s/]+/)+[^\\s<>\"']*)", "[local path omitted]");
    }
    static void number(JsonNode row, ObjectNode dest, String from, String to) {
        JsonNode n = row.get(from);
        if (n == null || (!n.isNull() && (!n.isNumber() || !Double.isFinite(n.doubleValue())))) throw new IllegalStateException();
        dest.set(to, n);
    }
    static void copyStrings(JsonNode row, ObjectNode dest, String from, String to) {
        JsonNode n = row.path(from); if (!n.isArray()) throw new IllegalStateException();
        var values = dest.putArray(to);
        for (var v : n) { if (!v.isTextual() || v.textValue().length() > 32768) throw new IllegalStateException(); values.add(safeText(v.textValue())); }
    }
    private ObjectNode envelope(Operation operation, String state, int limit, int offset) {
        var result = json.createObjectNode(); String observed = Instant.now().toString();
        result.put("contractVersion", 1).put("dataState", state).put("observedAt", observed);
        result.putArray("items"); result.putObject("page").put("limit", limit).put("offset", offset).put("hasMore", false).putNull("nextOffset");
        result.putArray("sources").addObject().put("sourceId", "insider-" + operation.source).put("sourceVersion", 1)
                .put("sourceType", operation.label).putNull("lastObservedAt");
        result.putArray("warnings");
        if (operation == Operation.SEC) result.withArray("warnings").add("SEC_PARTIAL_NOT_RECONCILED_OR_CERTIFIED");
        return result;
    }
    private ObjectNode unavailable(Operation op, int limit, int offset, String warning) { var r = envelope(op, "UNAVAILABLE", limit, offset); r.withArray("warnings").add(warning); return r; }
    private ObjectNode failure(Operation op, int limit, int offset, String warning) { var r = envelope(op, "ERROR", limit, offset); r.withArray("warnings").add(warning); return r; }
}
