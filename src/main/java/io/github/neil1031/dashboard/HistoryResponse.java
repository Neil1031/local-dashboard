package io.github.neil1031.dashboard;

import java.time.Instant;
import java.util.List;
import io.github.neil1031.dashboard.Models.Status;

/** Public DTO deliberately excludes raw evidence and observation metadata. */
public record HistoryResponse(Instant from, Instant to, List<HistoryJob> jobs) {
    public record HistoryJob(String id, String taskPath, String taskName, Boolean enabled, List<Run> runs) {}
    public record Run(long id, Instant observedRunAt, Status outcome, Long schedulerResult,
                      Long durationMs, String message) {}
}
