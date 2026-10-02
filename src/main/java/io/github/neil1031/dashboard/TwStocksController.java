package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import org.springframework.util.MultiValueMap;

@RestController
public class TwStocksController {
    private final TaiwanStocksAdapter adapter;
    public TwStocksController(TaiwanStocksAdapter adapter) { this.adapter = adapter; }
    @GetMapping("/api/tw/stocks")
    ResponseEntity<?> read(@RequestParam MultiValueMap<String, String> query) {
        try {
            if (query.keySet().stream().anyMatch(k -> !k.equals("date")) || query.containsKey("date") && query.get("date").size() != 1) throw new IllegalArgumentException();
            String date = TwStocksProjection.date(query.getFirst("date"));
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(adapter.read(date));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().header("Cache-Control", "no-store")
                    .body(Map.of("code", "TARGET_DATE_INVALID"));
        }
    }
}
