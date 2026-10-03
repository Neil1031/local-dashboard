package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static io.github.neil1031.dashboard.PerformanceProjection.*;

@RestController
public class PerformanceController {
    private final PerformanceAdapter adapter;
    public PerformanceController(PerformanceAdapter adapter) { this.adapter = adapter; }
    @GetMapping("/api/performance/{operation:summary|signals|detail}")
    ResponseEntity<?> read(@PathVariable String operation, @RequestParam MultiValueMap<String, String> params) {
        try {
            var allowed = switch (operation) { case "summary" -> Set.of("horizon", "minInvestment", "minSignal");
                case "signals" -> Set.of("horizon", "ticker", "limit", "offset"); default -> Set.of("signalId"); };
            if (!allowed.containsAll(params.keySet()) || params.values().stream().anyMatch(v -> v.size() != 1 || v.get(0).isEmpty())) throw new IllegalArgumentException();
            String horizon = params.getFirst("horizon"); if (horizon == null) horizon = "3m";
            Query q = switch (operation) {
                case "summary" -> new Query(Operation.SUMMARY, horizon, score(params.getFirst("minInvestment")), score(params.getFirst("minSignal")), null, 20, 0, null);
                case "signals" -> new Query(Operation.LIST, horizon, null, null, params.getFirst("ticker"), integer(params.getFirst("limit"), 20), integer(params.getFirst("offset"), 0), null);
                default -> new Query(Operation.DETAIL, null, null, null, null, 20, 0, params.getFirst("signalId"));
            };
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(adapter.read(q));
        } catch (IllegalArgumentException ignored) { return ResponseEntity.badRequest().header("Cache-Control", "no-store").body(Map.of("code", "INVALID_PERFORMANCE_QUERY")); }
    }
    private static int integer(String s, int fallback) { if (s == null) return fallback; if (!s.matches("[0-9]+")) throw new IllegalArgumentException(); return Integer.parseInt(s); }
    private static Double score(String s) { if (s == null) return null; if (!s.matches("(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")) throw new IllegalArgumentException(); Double n = Double.valueOf(s); threshold(n); return n; }
}
