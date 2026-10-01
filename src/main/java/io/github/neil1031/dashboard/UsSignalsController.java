package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class UsSignalsController {
    private final InsiderSignalsAdapter adapter;
    public UsSignalsController(InsiderSignalsAdapter adapter) { this.adapter = adapter; }
    @GetMapping("/api/us/signals")
    ResponseEntity<?> list(@RequestParam(required = false) String ticker,
            @RequestParam(defaultValue = "50") int limit, @RequestParam(defaultValue = "0") int offset) {
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(adapter.read(ticker, limit, offset));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().header("Cache-Control", "no-store")
                    .body(java.util.Map.of("code", "INVALID_SIGNALS_QUERY"));
        }
    }
}
