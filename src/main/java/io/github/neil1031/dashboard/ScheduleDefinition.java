package io.github.neil1031.dashboard;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/** A bounded allowlist of definition fields. No runtime state or action data enters this object. */
public record ScheduleDefinition(String json, String fingerprint, String windowsTimezoneId) {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> SETTINGS = List.of("StartWhenAvailable", "WakeToRun", "MultipleInstances",
            "RunOnlyIfIdle", "RunOnlyIfNetworkAvailable");
    private static final List<String> TRIGGER_FIELDS = List.of("Id", "type", "Enabled", "StartBoundary",
            "EndBoundary", "ExecutionTimeLimit", "RandomDelay", "Delay", "DaysInterval", "WeeksInterval",
            "DaysOfWeek", "DaysOfMonth", "MonthsOfYear", "WeeksOfMonth", "RunOnLastDayOfMonth",
            "RunOnLastWeekOfMonth", "UserId", "Subscription", "StateChange", "Period", "Duration");
    private static final List<String> REPETITION_FIELDS = List.of("Interval", "Duration", "StopAtDurationEnd");
    private static final Set<String> SUPPORTED_TRIGGERS = Set.of("MSFT_TaskTimeTrigger", "MSFT_TaskDailyTrigger",
            "MSFT_TaskWeeklyTrigger", "MSFT_TaskMonthlyTrigger", "MSFT_TaskMonthlyDOWTrigger");

    public static ScheduleDefinition from(Models.Job job, String zone) {
        if (zone != null && (zone.length() > 128 || !zone.matches("[A-Za-z0-9 ._+()/-]+")))
            throw new IllegalArgumentException("Invalid Windows timezone ID");
        var root = new TreeMap<String, Object>();
        root.put("enabled", job.enabled());
        root.put("windowsTimezoneId", zone);
        JsonNode raw = job.raw();
        for (String field : SETTINGS) putScalar(root, field, raw.get(field));
        var triggers = new ArrayList<Map<String, Object>>();
        JsonNode rawTriggers = raw.get("Triggers");
        if (rawTriggers != null && !rawTriggers.isNull()) {
            if (!rawTriggers.isArray() || rawTriggers.size() > 32) throw new IllegalArgumentException("Invalid trigger list");
            for (JsonNode trigger : rawTriggers) {
                if (!trigger.isObject()) throw new IllegalArgumentException("Invalid trigger");
                if (!SUPPORTED_TRIGGERS.contains(trigger.path("type").asText()))
                    throw new IllegalArgumentException("Unsupported trigger definition");
                var item = new TreeMap<String, Object>();
                for (String field : TRIGGER_FIELDS) {
                    // Principal and event subscription are not needed for schedule inference.
                    if (field.equals("UserId") || field.equals("Subscription")) continue;
                    putScalarOrArray(item, field, trigger.get(field));
                }
                JsonNode repetition = trigger.get("Repetition");
                if (repetition != null && !repetition.isNull()) {
                    if (!repetition.isObject()) throw new IllegalArgumentException("Invalid repetition");
                    var repeat = new TreeMap<String, Object>();
                    for (String field : REPETITION_FIELDS) putScalar(repeat, field, repetition.get(field));
                    item.put("Repetition", repeat);
                }
                for (String boundary : List.of("StartBoundary", "EndBoundary")) {
                    Object value = item.get(boundary);
                    if (value instanceof String text) {
                        try {
                            item.put(boundary + "Instant", OffsetDateTime.parse(text).toInstant().toString());
                            item.put(boundary + "Resolution", "EXPLICIT_OFFSET");
                        } catch (DateTimeParseException ignored) {
                            item.put(boundary + "Resolution", zone == null ? "ZONE_UNAVAILABLE" : "LOCAL_WINDOWS_TIMEZONE");
                        }
                    }
                }
                triggers.add(item);
            }
        }
        // Windows CIM enumeration order is not a definition. Sort by content; duplicates remain distinct.
        triggers.sort(Comparator.comparing(ScheduleDefinition::canonical));
        for (int i = 0; i < triggers.size(); i++) triggers.get(i).put("indexWithinVersion", i);
        root.put("triggers", triggers);
        String canonical = canonical(root);
        if (canonical.getBytes(StandardCharsets.UTF_8).length > 64 * 1024)
            throw new IllegalArgumentException("Schedule definition too large");
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return new ScheduleDefinition(canonical, HexFormat.of().formatHex(hash), zone);
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static void putScalarOrArray(Map<String, Object> target, String field, JsonNode value) {
        if (value == null || value.isNull()) return;
        if (value.isArray()) {
            if (value.size() > 64) throw new IllegalArgumentException("Schedule array too large");
            var items = new ArrayList<Object>();
            for (JsonNode child : value) items.add(scalar(child));
            target.put(field, items);
        } else putScalar(target, field, value);
    }

    private static void putScalar(Map<String, Object> target, String field, JsonNode value) {
        if (value != null && !value.isNull()) target.put(field, scalar(value));
    }

    private static Object scalar(JsonNode value) {
        if (value.isTextual()) {
            String text = value.textValue();
            if (text.length() > 512 || text.indexOf('\u0000') >= 0) throw new IllegalArgumentException("Invalid schedule text");
            if (text.matches("(?i).*[a-z]:[\\\\/].*") || text.startsWith("\\\\")
                    || text.matches("(?i).*S-1-[0-9]+-[0-9-]+.*"))
                throw new IllegalArgumentException("Private path or SID in schedule field");
            return text;
        }
        if (value.isBoolean()) return value.booleanValue();
        if (value.isIntegralNumber() && value.canConvertToLong()) return value.longValue();
        throw new IllegalArgumentException("Unsupported schedule field type");
    }

    private static String canonical(Object value) {
        try { return JSON.writeValueAsString(value); }
        catch (JsonProcessingException impossible) { throw new IllegalStateException(impossible); }
    }
}
