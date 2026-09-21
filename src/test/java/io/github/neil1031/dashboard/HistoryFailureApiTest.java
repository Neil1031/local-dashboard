package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "dashboard.scheduler.include[0]=\\\\")
@AutoConfigureMockMvc
class HistoryFailureApiTest {
    static final Path temp;
    static final Path database;
    static {
        try {
            temp = Files.createTempDirectory("dashboard-history-failure-");
            // A directory cannot be opened as a SQLite file: real startup failure, no mocked DB.
            database = Files.createDirectory(temp.resolve("private-host-history.db"));
        } catch (Exception failure) { throw new ExceptionInInitializerError(failure); }
    }
    @DynamicPropertySource static void configuration(DynamicPropertyRegistry registry) {
        registry.add("dashboard.history.database-path", database::toString);
        registry.add("dashboard.history.busy-timeout-ms", () -> 50);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired HistoryRepository repository;
    @MockitoBean SchedulerCollector collector;

    JsonNode partial() throws Exception {
        var result = mvc.perform(get("/api/jobs")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.collectionStatus").value("PARTIAL"))
                .andExpect(jsonPath("$.jobs.length()").value(4))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(result).contains("HISTORY_PERSISTENCE_FAILED").doesNotContain(
                "private-host-history", "jdbc:", "SQLITE_", "INSERT INTO", temp.toString());
        return mapper.readTree(result);
    }

    @Test void startupRuntimeLockAndCorruptionFailuresPreserveCurrentDataAndRecover() throws Exception {
        try {
            var fixture = (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"));
            when(collector.collect()).thenReturn(fixture);
            assertThat(Files.isDirectory(database)).isTrue();
            var response = partial(); // Application started successfully with history unavailable.
            String id = response.path("jobs").get(0).path("id").asText();
            assertThat(response.path("jobs").get(0).path("lastRunStatus").asText()).isEqualTo("FAILED");
            Files.delete(database); // Test-owned empty directory only.
            mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.collectionStatus").value("OK"));
            assertThat(repository.recentRuns(id, 10)).hasSize(1);

            try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database.toUri());
                 var statement = connection.createStatement()) {
                statement.execute("BEGIN IMMEDIATE");
                var locked = partial();
                assertThat(locked.path("jobs")).isEqualTo(response.path("jobs"));
                statement.execute("ROLLBACK");
            }
            mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.collectionStatus").value("OK"));
            assertThat(repository.recentRuns(id, 10)).hasSize(1);

            byte[] healthy = Files.readAllBytes(database);
            byte[] corrupt = "fixture corrupt database".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            Files.write(database, corrupt);
            fixture.withArray("unmatchedIncludes").add("Missing task");
            fixture.withArray("errors").addObject().put("code", "FIXTURE_COLLECTION_DIAGNOSTIC");
            var broken = partial();
            assertThat(broken.path("errors")).hasSize(2);
            assertThat(broken.path("unmatchedIncludes").get(0).asText()).isEqualTo("Missing task");
            assertThat(Files.readAllBytes(database)).isEqualTo(corrupt);
            when(collector.collect()).thenThrow(new CollectionException("COLLECTOR_TIMEOUT", "Timed out"));
            mvc.perform(get("/api/jobs")).andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("COLLECTOR_TIMEOUT"));
            Files.write(database, healthy);
            doReturn(fixture).when(collector).collect();
            var recovered = mvc.perform(get("/api/jobs")).andReturn().getResponse().getContentAsString();
            assertThat(recovered).doesNotContain("HISTORY_PERSISTENCE_FAILED");
            assertThat(repository.recentRuns(id, 10)).hasSize(1);
        } finally {
            Files.deleteIfExists(database);
            Files.deleteIfExists(temp);
        }
    }
}
