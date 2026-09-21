package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;
import static io.github.neil1031.dashboard.Models.*;

@Service
public class JobService {
    private final SchedulerCollector collector;
    private final SchedulerProperties properties;
    private final JobNormalizer normalizer;
    private final HistoryObserver history;

    public JobService(SchedulerCollector collector, SchedulerProperties properties, JobNormalizer normalizer, HistoryObserver history) {
        this.collector = collector;
        this.properties = properties;
        this.normalizer = normalizer;
        this.history = history;
    }

    public JobsResponse jobs() {
        if (properties.include().isEmpty()) {
            return new JobsResponse("NOT_CONFIGURED", Instant.now(), List.of(), List.of(), List.of());
        }
        JsonNode snapshot = collector.collect();
        if (snapshot == null || snapshot.path("schemaVersion").asInt() != 1
                || !snapshot.path("tasks").isArray() || !snapshot.path("errors").isArray()
                || !snapshot.path("unmatchedIncludes").isArray()) {
            throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Collector returned an invalid snapshot.");
        }
        Instant collectedAt;
        try { collectedAt = OffsetDateTime.parse(snapshot.path("collectedAt").asText()).toInstant(); }
        catch (RuntimeException e) {
            throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Collector timestamp is invalid.");
        }
        List<Job> jobs = new ArrayList<>();
        List<Diagnostic> errors = new ArrayList<>();
        List<String> unmatched = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonNode row : snapshot.path("tasks")) {
            Job job = normalizer.normalize(row);
            if (!TaskSelection.selected(properties.include(), properties.exclude(), job.taskPath(), job.name())) continue;
            if (!ids.add(job.id())) throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Duplicate task identity.");
            jobs.add(job);
            if (!job.warnings().isEmpty()) errors.add(new Diagnostic("TASK_DATA_INCOMPLETE", job.taskPath(), job.name(), String.join(" ", job.warnings())));
        }
        for (JsonNode error : snapshot.path("errors")) {
            errors.add(new Diagnostic(error.path("code").asText("TASK_INFO_UNAVAILABLE"),
                    error.path("taskPath").asText(), error.path("taskName").asText(), error.path("message").asText()));
        }
        for (JsonNode selector : snapshot.path("unmatchedIncludes")) unmatched.add(selector.asText());
        jobs.sort(Comparator.comparing(j -> (j.taskPath() + j.name()).toLowerCase(Locale.ROOT)));
        history.observe(jobs, collectedAt).ifPresent(errors::add);
        return new JobsResponse(errors.isEmpty() && unmatched.isEmpty() ? "OK" : "PARTIAL", collectedAt,
                List.copyOf(jobs), List.copyOf(errors), List.copyOf(unmatched));
    }
}
