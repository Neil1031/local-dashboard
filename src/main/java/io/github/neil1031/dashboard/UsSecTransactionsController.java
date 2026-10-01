package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class UsSecTransactionsController {
    private final InsiderSignalsAdapter adapter;
    public UsSecTransactionsController(InsiderSignalsAdapter adapter) { this.adapter = adapter; }
    @GetMapping("/api/us/sec-transactions")
    ResponseEntity<?> list(@RequestParam(required = false) String ticker,
            @RequestParam(defaultValue = "50") int limit, @RequestParam(defaultValue = "0") int offset) {
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(adapter.readSec(ticker, limit, offset));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().header("Cache-Control", "no-store")
                    .body(java.util.Map.of("code", "INVALID_SEC_TRANSACTIONS_QUERY"));
        }
    }
}
