package io.github.neil1031.dashboard.runner;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runner/executions")
public class RunnerReceiptController {
    private final RunnerReceiptService service;
    public RunnerReceiptController(RunnerReceiptService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<RunnerReceiptService.Response> executions() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.recent());
    }
}
