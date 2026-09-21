package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "dashboard.scheduler.include[0]=\\\\")
@AutoConfigureMockMvc
class JobsApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean SchedulerCollector collector;
    JsonNode fixture;

    @BeforeEach void setup() throws Exception {
        fixture = mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"));
        when(collector.collect()).thenReturn(fixture);
    }

    @Test void listAndDetailExposeNormalizedStateAndRawEvidence() throws Exception {
        mvc.perform(get("/api/jobs")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.collectionStatus").value("OK"))
                .andExpect(jsonPath("$.jobs.length()").value(4));
        String id = new JobNormalizer().normalize(fixture.path("tasks").get(0)).id();
        mvc.perform(get("/api/jobs/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.lastRunStatus").value("SUCCESS"))
                .andExpect(jsonPath("$.raw.TaskName").value("Daily Report 中文"));
        mvc.perform(get("/api/jobs/not-a-known-task")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_NOT_FOUND"));
    }

    @Test void collectorFailureIs503NotEmptySuccessAndDoesNotReusePriorSnapshot() throws Exception {
        mvc.perform(get("/api/jobs")).andExpect(status().isOk());
        when(collector.collect()).thenThrow(new CollectionException("COLLECTOR_TIMEOUT", "Timed out"));
        mvc.perform(get("/api/jobs")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.collectionStatus").value("ERROR"))
                .andExpect(jsonPath("$.code").value("COLLECTOR_TIMEOUT"))
                .andExpect(jsonPath("$.jobs").doesNotExist());
    }

    @Test void partialAndMissingTasksAreVisible() throws Exception {
        ((ObjectNode) fixture.path("tasks").get(0)).set("CollectionError", mapper.createObjectNode().put("code", "PERMISSION_DENIED"));
        ((ObjectNode) fixture).withArray("unmatchedIncludes").add("Missing task");
        mvc.perform(get("/api/jobs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.collectionStatus").value("PARTIAL"))
                .andExpect(jsonPath("$.errors[0].code").value("TASK_DATA_INCOMPLETE"))
                .andExpect(jsonPath("$.unmatchedIncludes[0]").value("Missing task"));
    }

    @Test void malformedSnapshotIsVisibleError() throws Exception {
        when(collector.collect()).thenReturn(mapper.createObjectNode());
        mvc.perform(get("/api/jobs")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("INVALID_COLLECTOR_OUTPUT"));
    }

    @Test void noMutationEndpointAndPrototypeIsStillServed() throws Exception {
        mvc.perform(post("/api/jobs")).andExpect(status().isMethodNotAllowed());
        mvc.perform(get("/index.html")).andExpect(status().isOk())
                .andExpect(content().bytes(java.nio.file.Files.readAllBytes(java.nio.file.Path.of("index.html"))));
        verifyNoInteractions(collector);
    }
}
