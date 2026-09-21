package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import static io.github.neil1031.dashboard.Models.*;

@Component
public class JobNormalizer {
    public Job normalize(JsonNode raw) {
        String name = raw.path("TaskName").asText("");
        String path = raw.path("TaskPath").asText("");
        if (name.isBlank() || !path.startsWith("\\") || !path.endsWith("\\")) {
            throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Task identity is missing or invalid.");
        }
        List<String> warnings = new ArrayList<>();
        String state = state(raw.path("State").asText(""));
        Boolean enabled = raw.path("Enabled").isBoolean() ? raw.path("Enabled").booleanValue() : null;
        if (enabled == null) warnings.add("Enabled is unavailable.");
        Instant last = timestamp(raw.get("LastRunTime"), "LastRunTime", warnings);
        Instant next = timestamp(raw.get("NextRunTime"), "NextRunTime", warnings);
        Long result = resultCode(raw.get("LastTaskResult"), warnings);
        boolean collectionError = raw.hasNonNull("CollectionError");
        if (collectionError) warnings.add("Task info could not be collected; see collection errors.");
        boolean invalid = !warnings.isEmpty();
        Status lastStatus = Status.UNKNOWN;
        String text = "Last execution outcome unavailable.";
        if (result != null && result == 0x41303L) {
            last = null;
            text = "Task has not run (0x00041303).";
        } else if ("RUNNING".equals(state) || (result != null && result == 0x41301L)) {
            text = "Task is running; no completed result is available for this execution.";
        } else if (result != null && (result & 0xFFFF0000L) == 0x00040000L && result != 0x41306L) {
            text = String.format("Scheduler informational code 0x%08X; not proof of a completed execution.", result);
        } else if (last == null) {
            text = "No recorded execution time; result is not proof of a completed execution.";
        } else if (result != null) {
            lastStatus = result == 0 ? Status.SUCCESS : Status.FAILED;
            text = result == 0 ? "Scheduler reported exit code 0; application-level success is not verified."
                    : String.format("Scheduler reported result %d (0x%08X).", result, result);
        }
        if (invalid) lastStatus = Status.UNKNOWN;

        Status status;
        if (collectionError || enabled == null || !warnings.isEmpty()) status = Status.UNKNOWN;
        else if (state.equals("RUNNING")) status = Status.RUNNING;
        else if (!enabled || state.equals("DISABLED")) status = Status.DISABLED;
        else if (!state.equals("READY")) status = Status.UNKNOWN;
        else if (lastStatus == Status.FAILED) status = Status.FAILED;
        else status = Status.READY;
        // READY remains READY even after a successful last run. No execution-window inference in Stage 1.
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(
                (path + name).toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
        return new Job(id, name, path, raw.path("Description").asText(""), enabled, state,
                status, lastStatus, null, last, next, null, result, text,
                "WINDOWS_TASK_SCHEDULER", raw.path("Triggers"), raw.deepCopy(), List.copyOf(warnings));
    }

    private static String state(String value) {
        return switch (value.toUpperCase(Locale.ROOT)) {
            case "1", "DISABLED" -> "DISABLED";
            case "2", "QUEUED" -> "QUEUED";
            case "3", "READY" -> "READY";
            case "4", "RUNNING" -> "RUNNING";
            default -> "UNKNOWN";
        };
    }

    private static Instant timestamp(JsonNode value, String field, List<String> warnings) {
        if (value == null || value.isNull() || value.asText().isBlank()) return null;
        try {
            OffsetDateTime parsed = OffsetDateTime.parse(value.asText());
            // Task Scheduler uses 1899/1601 (and some providers year 1) as unset dates.
            return parsed.getYear() <= 1899 ? null : parsed.toInstant();
        } catch (DateTimeParseException e) {
            warnings.add(field + " has an invalid or timezone-less timestamp.");
            return null;
        }
    }

    private static Long resultCode(JsonNode value, List<String> warnings) {
        if (value == null || value.isNull()) return null;
        if (value.isIntegralNumber() && value.canConvertToLong()) {
            long result = value.longValue();
            if (result >= Integer.MIN_VALUE && result <= 0xFFFFFFFFL) return result & 0xFFFFFFFFL;
        }
        warnings.add("LastTaskResult is not a 32-bit Windows result.");
        return null;
    }
}
