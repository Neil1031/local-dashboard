package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class TwReportsController {
    private final TaiwanReportsAdapter adapter;
    public TwReportsController(TaiwanReportsAdapter adapter) { this.adapter = adapter; }
    private static void keys(MultiValueMap<String, String> query, Set<String> allowed) {
        if (!allowed.containsAll(query.keySet()) || query.values().stream().anyMatch(v -> v.size() != 1 || v.get(0) == null || v.get(0).isEmpty())) throw new IllegalArgumentException();
    }
    private static int number(String raw, int fallback) {
        if (raw == null) return fallback;
        if (!raw.matches("0|[1-9][0-9]{0,4}")) throw new IllegalArgumentException(); return Integer.parseInt(raw);
    }
    @GetMapping("/api/reports/tw")
    ResponseEntity<?> list(@RequestParam MultiValueMap<String, String> query) {
        try {
            keys(query, Set.of("type", "limit", "offset"));
            var q = TwReportsProjection.Query.list(query.getFirst("type"), number(query.getFirst("limit"), 20), number(query.getFirst("offset"), 0));
            return ok(adapter.list(q.type().toLowerCase(Locale.ROOT), q.limit(), q.offset()));
        } catch (IllegalArgumentException e) { return invalid(); }
    }
    @GetMapping("/api/reports/tw/detail")
    ResponseEntity<?> detail(@RequestParam MultiValueMap<String, String> query) {
        try {
            keys(query, Set.of("reportId")); var q = TwReportsProjection.Query.detail(query.getFirst("reportId")); return ok(adapter.detail(q.reportId()));
        } catch (IllegalArgumentException e) { return invalid(); }
    }
    private ResponseEntity<?> ok(Object body) { return ResponseEntity.ok().header("Cache-Control", "no-store").body(body); }
    private ResponseEntity<?> invalid() { return ResponseEntity.badRequest().header("Cache-Control", "no-store").body(Map.of("code", "INVALID_TW_REPORTS_QUERY")); }
}
