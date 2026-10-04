package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class TwPerformanceController {
    private final TaiwanPerformanceAdapter adapter;
    public TwPerformanceController(TaiwanPerformanceAdapter adapter) { this.adapter = adapter; }
    private static int number(String raw, int fallback) {
        if (raw == null) return fallback;
        if (!raw.matches("0|[1-9][0-9]{0,4}")) throw new IllegalArgumentException();
        return Integer.parseInt(raw);
    }
    @GetMapping("/api/tw/performance")
    ResponseEntity<?> list(@RequestParam MultiValueMap<String, String> query) {
        try {
            if (!Set.of("startDate", "endDate", "limit", "offset").containsAll(query.keySet())
                    || query.values().stream().anyMatch(v -> v.size() != 1 || v.get(0) == null || v.get(0).isEmpty())) throw new IllegalArgumentException();
            var q = TwPerformanceProjection.Query.list(query.getFirst("startDate"), query.getFirst("endDate"),
                    number(query.getFirst("limit"),20), number(query.getFirst("offset"),0));
            return ResponseEntity.ok().header("Cache-Control","no-store").body(adapter.list(q.startDate(),q.endDate(),q.limit(),q.offset()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().header("Cache-Control","no-store").body(Map.of("code","INVALID_TW_PERFORMANCE_QUERY"));
        }
    }
}
