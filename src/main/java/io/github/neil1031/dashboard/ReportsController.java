package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class ReportsController {
    private final InsiderSignalsAdapter adapter;
    private final ObjectMapper json;
    public ReportsController(InsiderSignalsAdapter adapter, ObjectMapper json) { this.adapter = adapter; this.json = json; }
    @GetMapping("/api/reports/us-insider")
    ResponseEntity<?> list(@RequestParam(required=false) String date, @RequestParam(defaultValue="20") String limit, @RequestParam(defaultValue="0") String offset) {
        try { String exact = ReportProjection.date(date, false); int size = size(limit), start = offset(offset);
            return result(adapter.readReports(exact, size, start)); }
        catch (IllegalArgumentException ignored) { return invalid(); }
    }
    @GetMapping("/api/reports/us-insider/detail")
    ResponseEntity<?> detail(@RequestParam(required=false) String reportDate, @RequestParam(defaultValue="20") String revisionLimit, @RequestParam(defaultValue="0") String revisionOffset) {
        try {
            String exact = ReportProjection.date(reportDate, true); int size = size(revisionLimit), start = offset(revisionOffset);
            var response = adapter.readReport(exact, size, start);
            // Successful get is one source read. On nonzero get only, a bounded exact-date
            // list distinguishes missingness without interpreting private stderr.
            if (response.path("dataState").asText().equals("UNAVAILABLE") && response.path("warnings").toString().contains("\"SOURCE_READ_FAILED\"")) {
                var existence = adapter.readReports(exact, 1, 0);
                if (existence.path("dataState").asText().equals("EMPTY")) {
                    response = ReportProjection.envelope("EMPTY", size, start, true, json);
                    response.withArray("warnings").add("REPORT_NOT_FOUND");
                    response.set("sources", existence.path("sources").deepCopy());
                }
            }
            return result(response);
        } catch (IllegalArgumentException ignored) { return invalid(); }
    }
    private static int size(String value) { int n=Integer.parseInt(value); if(n<1||n>100)throw new IllegalArgumentException();return n; }
    private static int offset(String value) { int n=Integer.parseInt(value);if(n<0||n>InsiderSignalsAdapter.MAX_OFFSET)throw new IllegalArgumentException();return n; }
    private static ResponseEntity<?> result(ObjectNode value) { return ResponseEntity.ok().header("Cache-Control","no-store").body(value); }
    private static ResponseEntity<?> invalid() { return ResponseEntity.badRequest().header("Cache-Control","no-store").body(Map.of("code","INVALID_REPORTS_QUERY")); }
}
