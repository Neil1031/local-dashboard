package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

import static java.nio.file.StandardOpenOption.*;

@Component
public class JobMetadataStore {
    static final int MAX_BYTES = 131072;
    private static final Set<String> FIELDS = Set.of("displayName", "description", "market", "order", "hidden", "dependsOn");
    private static final Set<String> KNOWN = Set.of("InsiderTracker-Market", "InsiderTracker-SyncImport", "InsiderTracker-SEC",
            "AIStockHunter-UnexplainedVolume-Daily", "AIStockHunter-Accumulation-Weekly-Check",
            "AIStockHunter-Accumulation-Check-*", "AIStockHunter-UnexplainedVolume-HealthCheck",
            "AIStockHunter-UnexplainedVolume-V2-Weekly");
    private static final String DATED_PATTERN = "AIStockHunter-Accumulation-Check-*";
    private static final String DATED_PREFIX = "AIStockHunter-Accumulation-Check-";
    // Mirror the versioned internal dependency defaults in dashboard.mjs. External defaults have no graph edge.
    private static final Map<String, Set<String>> DEFAULT_INTERNAL_DEPENDENCIES = Map.of(
            "InsiderTracker-SEC", Set.of("InsiderTracker-SyncImport"),
            "AIStockHunter-Accumulation-Weekly-Check", Set.of("AIStockHunter-UnexplainedVolume-Daily"),
            DATED_PATTERN, Set.of("AIStockHunter-UnexplainedVolume-Daily"));
    private final ObjectMapper mapper;
    private final Path path;

    @Autowired public JobMetadataStore(ObjectMapper mapper) {
        this(mapper, defaultPath());
    }

    JobMetadataStore(ObjectMapper mapper, Path path) {
        this.mapper = mapper;
        this.path = path;
    }

    private static Path defaultPath() {
        String override = System.getProperty("dashboard.metadata.path");
        if (override != null && !override.isBlank()) return Path.of(override);
        String home = System.getenv("LOCALAPPDATA");
        if (home == null || home.isBlank()) home = Path.of(System.getProperty("user.home"), "AppData", "Local").toString();
        return Path.of(home, "LocalDashboard", "config", "job-metadata.json");
    }

    public record State(int version, String revision, JsonNode overrides, String warning) {}

    public synchronized State read() {
        if (!Files.exists(path)) return new State(1, "0", mapper.createObjectNode(), null);
        try {
            if (Files.size(path) > MAX_BYTES) throw new Invalid("INVALID_FILE");
            byte[] bytes = Files.readAllBytes(path);
            JsonNode root = mapper.readTree(bytes);
            if (root == null || !root.isObject() || root.path("version").asInt(-1) != 1
                    || !root.has("overrides") || root.size() != 2) throw new Invalid("INVALID_FILE");
            validate(root.get("overrides"));
            return new State(1, hash(bytes), root.get("overrides"), null);
        } catch (Exception ex) {
            return new State(1, null, mapper.createObjectNode(), "自訂顯示設定無法載入，已使用預設值");
        }
    }

    public synchronized State save(String expectedRevision, JsonNode overrides) throws IOException {
        State previous = read();
        if (previous.warning() != null) throw new Invalid("INVALID_FILE");
        if (expectedRevision == null || !expectedRevision.equals(previous.revision())) throw new Conflict();
        validate(overrides);
        ObjectNode root = mapper.createObjectNode();
        root.put("version", 1);
        root.set("overrides", overrides);
        byte[] bytes = mapper.writeValueAsBytes(root);
        if (bytes.length > MAX_BYTES) throw new Invalid("PAYLOAD_TOO_LARGE");
        Path parent = path.toAbsolutePath().getParent();
        Files.createDirectories(parent);
        Path temp = Files.createTempFile(parent, ".job-metadata-", ".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temp, WRITE, TRUNCATE_EXISTING)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            replace(temp, path);
        } finally {
            Files.deleteIfExists(temp);
        }
        return new State(1, hash(bytes), overrides, null);
    }

    void replace(Path temp, Path target) throws IOException {
        Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    static void validate(JsonNode overrides) {
        if (overrides == null || !overrides.isObject() || overrides.size() > 256) throw new Invalid("INVALID_CONFIG");
        Set<String> valid = new HashSet<>(KNOWN);
        overrides.fieldNames().forEachRemaining(valid::add);
        overrides.fields().forEachRemaining(entry -> {
            String key = entry.getKey();
            JsonNode value = entry.getValue();
            if (key.isBlank() || key.length() > 200 || key.indexOf('*') >= 0 && !key.equals("AIStockHunter-Accumulation-Check-*")
                    || !value.isObject() || value.size() > FIELDS.size()) throw new Invalid("INVALID_CONFIG");
            if (value.has("dependsOn")) {
                JsonNode list = value.get("dependsOn");
                if (!list.isArray() || list.size() > 32) throw new Invalid("INVALID_DEPENDENCY");
                for (JsonNode item : list) {
                    if (!item.isObject() || item.size() < 2 || item.size() > 3 || !item.has("task") || !item.has("kind")) throw new Invalid("INVALID_DEPENDENCY");
                    String kind = string(item.get("kind"), 20), task = string(item.get("task"), 200);
                    if (!Set.of("data", "external", "orderOnly").contains(kind) || task.isBlank()
                            || item.has("note") && (item.get("note").isNull() || string(item.get("note"), 200).isBlank())
                            || item.fieldNames().hasNext() && !fieldsOnly(item, Set.of("task", "kind", "note"))) throw new Invalid("INVALID_DEPENDENCY");
                    if (!kind.equals("external") && (task.equals(key) || !valid.contains(task))) throw new Invalid("INVALID_DEPENDENCY");
                }
            }
            value.fields().forEachRemaining(field -> {
                String name = field.getKey(); JsonNode fieldValue = field.getValue();
                if (!FIELDS.contains(name)) throw new Invalid("INVALID_CONFIG");
                switch (name) {
                    case "displayName" -> { if (string(fieldValue, 100).isBlank()) throw new Invalid("INVALID_CONFIG"); }
                    case "description" -> string(fieldValue, 1000);
                    case "market" -> { if (!Set.of("台股", "美股", "其他").contains(string(fieldValue, 2))) throw new Invalid("INVALID_CONFIG"); }
                    case "order" -> { if (!fieldValue.isIntegralNumber() || fieldValue.asLong() < 0 || fieldValue.asLong() > 10000) throw new Invalid("INVALID_ORDER"); }
                    case "hidden" -> { if (!fieldValue.isBoolean()) throw new Invalid("INVALID_CONFIG"); }
                    default -> { }
                }
            });
        });
        Map<String, Set<String>> edges = new HashMap<>();
        for (String key : valid) edges.put(key, effectiveInternalDependencies(key, overrides, valid));
        Set<String> active = new HashSet<>(), done = new HashSet<>();
        for (String node : edges.keySet()) visit(node, edges, active, done);
    }

    private static Set<String> effectiveInternalDependencies(String key, JsonNode overrides, Set<String> valid) {
        String pattern = datedPatternFor(key);
        JsonNode exact = overrides.path(key);
        JsonNode patternUser = pattern == null ? null : overrides.path(pattern);
        JsonNode selected = exact.has("dependsOn") ? exact.get("dependsOn")
                : patternUser != null && patternUser.has("dependsOn") ? patternUser.get("dependsOn") : null;
        if (selected == null) return DEFAULT_INTERNAL_DEPENDENCIES.getOrDefault(key,
                pattern == null ? Set.of() : DEFAULT_INTERNAL_DEPENDENCIES.getOrDefault(pattern, Set.of()));
        Set<String> targets = new HashSet<>();
        for (JsonNode dependency : selected) {
            if (dependency.path("kind").asText().equals("external")) continue;
            String target = dependency.path("task").asText();
            if (target.equals(key) || !valid.contains(target)) throw new Invalid("INVALID_DEPENDENCY");
            targets.add(target);
        }
        return targets;
    }

    private static String datedPatternFor(String key) {
        if (!key.startsWith(DATED_PREFIX)) return null;
        String date = key.substring(DATED_PREFIX.length());
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
        try { LocalDate.parse(date); return DATED_PATTERN; }
        catch (DateTimeParseException ex) { return null; }
    }

    private static boolean fieldsOnly(JsonNode node, Set<String> allowed) {
        Iterator<String> names = node.fieldNames();
        while (names.hasNext()) if (!allowed.contains(names.next())) return false;
        return true;
    }

    private static String string(JsonNode value, int max) {
        if (value == null || !value.isTextual() || value.textValue().length() > max) throw new Invalid("INVALID_CONFIG");
        return value.textValue();
    }

    private static void visit(String node, Map<String, Set<String>> edges, Set<String> active, Set<String> done) {
        if (done.contains(node)) return;
        if (!active.add(node)) throw new Invalid("DEPENDENCY_CYCLE");
        for (String next : edges.getOrDefault(node, Set.of())) visit(next, edges, active, done);
        active.remove(node);
        done.add(node);
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }

    static class Invalid extends RuntimeException { Invalid(String code) { super(code); } }
    static class Conflict extends RuntimeException {}
}
