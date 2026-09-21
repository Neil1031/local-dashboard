package io.github.neil1031.dashboard;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/history")
public class HistoryController {
    private static final Logger log = LoggerFactory.getLogger(HistoryController.class);
    private final HistoryRepository repository;

    public HistoryController(HistoryRepository repository) { this.repository = repository; }

    @GetMapping
    public ResponseEntity<?> history(@RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to) {
        final HistoryRange range;
        try { range = HistoryRange.parse(from, to); }
        catch (RuntimeException invalid) {
            return error(400, "INVALID_HISTORY_RANGE",
                    "from and to must be UTC ISO-8601 timestamps ending in Z; require from < to and at most 31 days.");
        }
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(repository.history(range));
        } catch (HistoryPersistenceException failure) {
            log.error("History read failed", failure);
            return error(503, "HISTORY_UNAVAILABLE", "Observed execution history could not be read. Please retry or check the server log.");
        }
    }

    private ResponseEntity<?> error(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("code", code, "message", message));
    }
}
