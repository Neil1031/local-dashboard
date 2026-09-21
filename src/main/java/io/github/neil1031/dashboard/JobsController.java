package io.github.neil1031.dashboard;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.Map;
import static io.github.neil1031.dashboard.Models.*;

@RestController
@RequestMapping("/api/jobs")
public class JobsController {
    private final JobService service;
    public JobsController(JobService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<JobsResponse> jobs() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.jobs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> job(@PathVariable String id) {
        // Lookup only in server-selected jobs; the browser's ID never reaches PowerShell.
        JobsResponse snapshot = service.jobs();
        return snapshot.jobs().stream().filter(j -> j.id().equals(id)).findFirst()
                .<ResponseEntity<?>>map(j -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(j))
                .orElseGet(() -> ResponseEntity.status(404).cacheControl(CacheControl.noStore())
                        .body(Map.of("code", "JOB_NOT_FOUND", "message", "No monitored job has this ID.",
                                "collectionStatus", snapshot.collectionStatus())));
    }

    @ExceptionHandler(CollectionException.class)
    public ResponseEntity<?> unavailable(CollectionException exception) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of(
                "collectionStatus", "ERROR", "code", exception.code(), "message", exception.getMessage(),
                "collectedAt", Instant.now()));
    }
}
