package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/settings/job-metadata")
public class JobMetadataController {
    private final JobMetadataStore store;
    private final ObjectMapper mapper;
    public JobMetadataController(JobMetadataStore store, ObjectMapper mapper) { this.store = store; this.mapper = mapper; }

    @GetMapping public ResponseEntity<?> get() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(store.read());
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> put(HttpServletRequest request) throws IOException {
        byte[] bytes = request.getInputStream().readNBytes(JobMetadataStore.MAX_BYTES + 1);
        if (bytes.length > JobMetadataStore.MAX_BYTES) throw new JobMetadataStore.Invalid("PAYLOAD_TOO_LARGE");
        JsonNode body;
        try { body = mapper.readTree(bytes); }
        catch (IOException ex) { throw new JobMetadataStore.Invalid("INVALID_CONFIG"); }
        if (body == null || !body.isObject() || body.size() != 2 || !body.has("expectedRevision") || !body.path("expectedRevision").isTextual()
                || !body.has("overrides")) throw new JobMetadataStore.Invalid("INVALID_CONFIG");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(store.save(body.get("expectedRevision").textValue(), body.get("overrides")));
    }

    @ExceptionHandler(JobMetadataStore.Conflict.class)
    public ResponseEntity<?> conflict() { return error(409, "REVISION_CONFLICT"); }
    @ExceptionHandler(JobMetadataStore.Invalid.class)
    public ResponseEntity<?> invalid(JobMetadataStore.Invalid ex) {
        return error(ex.getMessage().equals("INVALID_FILE") ? 409 : 400, ex.getMessage());
    }
    @ExceptionHandler(IOException.class)
    public ResponseEntity<?> writeFailed() { return error(500, "PERSISTENCE_FAILED"); }
    private ResponseEntity<?> error(int status, String code) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("code", code));
    }
}
