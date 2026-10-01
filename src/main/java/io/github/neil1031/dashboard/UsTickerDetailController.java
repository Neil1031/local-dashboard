package io.github.neil1031.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class UsTickerDetailController {
    private final UsTickerDetailService service;
    public UsTickerDetailController(UsTickerDetailService service) { this.service = service; }
    @GetMapping("/api/us/ticker-detail")
    ResponseEntity<?> detail(@RequestParam(required = false) String ticker,
            @RequestParam(defaultValue = "50") String signalsLimit, @RequestParam(defaultValue = "0") String signalsOffset,
            @RequestParam(defaultValue = "50") String secLimit, @RequestParam(defaultValue = "0") String secOffset) {
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.read(ticker,
                    Integer.parseInt(signalsLimit), Integer.parseInt(signalsOffset), Integer.parseInt(secLimit), Integer.parseInt(secOffset)));
        } catch (IllegalArgumentException ignored) {
            return ResponseEntity.badRequest().header("Cache-Control", "no-store").body(Map.of("code", "INVALID_TICKER_DETAIL_QUERY"));
        }
    }
}
