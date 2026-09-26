package io.github.neil1031.dashboard;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static io.github.neil1031.dashboard.Models.*;

@Component
public class ScheduleSnapshotObserver {
    private static final Logger log = LoggerFactory.getLogger(ScheduleSnapshotObserver.class);
    private final ScheduleSnapshotRepository repository;

    public ScheduleSnapshotObserver(ScheduleSnapshotRepository repository) { this.repository = repository; }

    public Optional<Diagnostic> observe(List<Job> jobs, Instant at, String windowsTimezoneId, boolean complete,
                                        List<String> includes, List<String> excludes) {
        try {
            repository.observe(jobs, at, windowsTimezoneId, complete, includes, excludes);
            return Optional.empty();
        } catch (HistoryPersistenceException failure) {
            log.error("Schedule snapshot persistence failed at {}", at, failure);
            return Optional.of(new Diagnostic("SCHEDULE_SNAPSHOT_PERSISTENCE_FAILED", null, null,
                    "Current scheduler data is available, but schedule history could not be saved. Check the server log."));
        }
    }
}
