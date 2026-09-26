package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class JobMetadataControllerTest {
    @TempDir Path temp;

    @Test void validatesPayloadAndRevisionWithoutCollector() throws Exception {
        var mapper = new ObjectMapper();
        var mvc = MockMvcBuilders.standaloneSetup(new JobMetadataController(
                new JobMetadataStore(mapper, temp.resolve("settings.json")), mapper)).build();
        mvc.perform(get("/api/settings/job-metadata")).andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value("0"));
        mvc.perform(put("/api/settings/job-metadata").contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":\"0\",\"overrides\":{\"A\":{\"order\":10001}}}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ORDER"));
        String put = "{\"expectedRevision\":\"0\",\"overrides\":{\"My-New-Task\":{\"displayName\":\"新工作\"}}}";
        mvc.perform(put("/api/settings/job-metadata").contentType(MediaType.APPLICATION_JSON).content(put))
                .andExpect(status().isOk()).andExpect(jsonPath("$.overrides.My-New-Task.displayName").value("新工作"));
        mvc.perform(put("/api/settings/job-metadata").contentType(MediaType.APPLICATION_JSON).content(put))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REVISION_CONFLICT"));
        mvc.perform(put("/api/settings/job-metadata").contentType(MediaType.APPLICATION_JSON)
                .content(" ".repeat(JobMetadataStore.MAX_BYTES + 1)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
    }
}
