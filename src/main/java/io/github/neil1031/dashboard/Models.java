package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

public final class Models {
    private Models() {}
    public enum Status { SUCCESS, FAILED, MISSED, RUNNING, READY, DISABLED, UNKNOWN }
    public record Diagnostic(String code, String taskPath, String taskName, String message) {}
    public record Job(String id, String name, String taskPath, String description, Boolean enabled,
                      String state, Status status, Status lastRunStatus, Instant scheduledAt,
                      Instant lastRunAt, Instant nextRunAt, Long durationMs, Long lastTaskResult,
                      String resultText, String source, JsonNode triggers, JsonNode raw,
                      List<String> warnings) {}
    public record JobsResponse(String collectionStatus, Instant collectedAt, List<Job> jobs,
                               List<Diagnostic> errors, List<String> unmatchedIncludes) {}
}
