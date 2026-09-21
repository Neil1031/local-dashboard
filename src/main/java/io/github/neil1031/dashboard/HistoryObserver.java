package io.github.neil1031.dashboard;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static io.github.neil1031.dashboard.Models.*;

@Component
public class HistoryObserver {
    private static final Logger log = LoggerFactory.getLogger(HistoryObserver.class);
    private final HistoryRepository repository;

    public HistoryObserver(HistoryRepository repository) { this.repository = repository; }

    @PostConstruct
    public void initialize() {
        try { repository.initialize(); }
        catch (HistoryPersistenceException failure) {
            // Keep the current scheduler service usable. Each observation retries initialization.
            log.error("History initialization failed; observations will report HISTORY_PERSISTENCE_FAILED", failure);
        }
    }

    public Optional<Diagnostic> observe(List<Job> jobs, Instant collectedAt) {
        try {
            repository.observe(jobs, collectedAt);
            return Optional.empty();
        } catch (HistoryPersistenceException failure) {
            log.error("History persistence failed for snapshot at {}", collectedAt, failure);
            return Optional.of(new Diagnostic("HISTORY_PERSISTENCE_FAILED", null, null,
                    "Current scheduler data is available, but observed execution history could not be saved. Check the server log."));
        }
    }
}
