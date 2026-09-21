package io.github.neil1031.dashboard;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Readiness/identity only: never collects tasks or writes history. */
@RestController
public class LauncherStatusController {
    private volatile boolean ready;

    @EventListener(ApplicationReadyEvent.class)
    public void ready() { ready = true; }

    @EventListener(ContextClosedEvent.class)
    public void closing() { ready = false; }

    @GetMapping(value = "/api/launcher/status", produces = "text/plain")
    public ResponseEntity<String> status() {
        return ResponseEntity.status(ready ? 200 : 503)
                .header("Cache-Control", "no-store")
                .body(ready ? "local-dashboard:ready:v1" : "local-dashboard:starting:v1");
    }
}
