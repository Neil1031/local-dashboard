package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.*;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "dashboard.scheduler.include[0]=\\\\")
@AutoConfigureMockMvc
class HistoryApiTest {
    @TempDir static Path temp;
    static Path database() { return temp.resolve("private history #1.db"); }
    @DynamicPropertySource static void config(DynamicPropertyRegistry registry) {
        registry.add("dashboard.history.database-path", () -> database().toString());
        registry.add("dashboard.history.busy-timeout-ms", () -> 50);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired HistoryRepository repository;
    @MockitoBean SchedulerCollector collector;
    final String from = "2026-09-14T16:00:00Z", to = "2026-09-21T16:00:00Z";

    @BeforeEach void setup() throws Exception {
        Files.deleteIfExists(database());
        repository.initialize();
        reset(collector);
    }
    @AfterEach void noCollector() { verifyNoInteractions(collector); }

    void observe(String name, String timestamp, long result) throws Exception {
        var row = (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json")).path("tasks").get(0).deepCopy();
        row.put("TaskName", name).put("LastRunTime", timestamp).put("LastTaskResult", result);
        repository.observe(List.of(new JobNormalizer().normalize(row)), Instant.parse(to));
    }
    String query(String start, String end) throws Exception {
        return mvc.perform(get("/api/history").param("from", start).param("to", end))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }
    void sql(String sql) throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database().toUri()); var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    @Test void boundedJoinReturnsEveryExecutionAndHistoricalOnlyJobsWithoutAnyWrites() throws Exception {
        observe("old task", "2026-09-14T15:59:59.999999999Z", 0);
        observe("old task", from, 0);
        observe("old task", "2026-09-20T00:00:00Z", 1);
        observe("old task", "2026-09-20T10:00:00Z", 0);
        observe("old task", "2026-09-21T15:59:59.999999999Z", 0);
        observe("old task", to, 0);
        observe("other task", from, 0);
        // Any attempted mutation is rejected, including observation metadata updates.
        for (String table : List.of("job", "job_run")) for (String action : List.of("INSERT", "UPDATE", "DELETE"))
            sql("CREATE TRIGGER forbid_" + table + action + " BEFORE " + action + " ON " + table + " BEGIN SELECT RAISE(ABORT, 'read-only test'); END");
        byte[] before = Files.readAllBytes(database());
        String response = query(from, to);
        var jobs = mapper.readTree(response).path("jobs");
        assertThat(jobs).hasSize(2);
        var old = java.util.stream.StreamSupport.stream(jobs.spliterator(), false)
                .filter(j -> j.path("taskName").asText().equals("old task")).findFirst().orElseThrow();
        assertThat(old.path("runs")).hasSize(4);
        assertThat(old.path("runs").get(0).path("observedRunAt").asText()).isEqualTo(from);
        assertThat(old.path("runs").get(1).path("outcome").asText()).isEqualTo("FAILED");
        assertThat(old.path("runs").get(2).path("outcome").asText()).isEqualTo("SUCCESS");
        assertThat(old.path("runs").get(3).path("observedRunAt").asText()).isEqualTo("2026-09-21T15:59:59.999999999Z");
        assertThat(old.path("runs").get(1).path("schedulerResult").asLong()).isEqualTo(1);
        assertThat(old.path("runs").get(0).path("durationMs").isNull()).isTrue();
        assertThat(response).doesNotContain("raw", "firstObserved", "lastObserved", "private history", "SELECT");
        for (int i = 0; i < 5; i++) assertThat(query(from, to)).isEqualTo(response);
        assertThat(Files.readAllBytes(database())).isEqualTo(before);
    }

    @Test void emptyHistoryAndExactly31DaysAreValid() throws Exception {
        assertThat(mapper.readTree(query(from, to)).path("jobs")).isEmpty();
        query("2026-08-21T00:00:00Z", "2026-09-21T00:00:00Z");
    }

    @Test void invalidRangesAre400BeforeAnyDatabaseAccess() throws Exception {
        Files.delete(database());
        for (String[] pair : new String[][]{{null, to}, {from, null}, {from, from}, {to, from},
                {"2026-08-21T00:00:00Z", "2026-09-21T00:00:00.000000001Z"},
                {"not a time", to}, {from, "2026-02-30T00:00:00Z"}, {"2026-09-14", to},
                {"2026-09-14T16:00:00+08:00", to}, {"2026-09-14T24:00:00Z", to},
                {"2026-09-14T16:00:60Z", to}, {"' OR 1=1 --", to}}) {
            var request = get("/api/history");
            if (pair[0] != null) request.param("from", pair[0]);
            if (pair[1] != null) request.param("to", pair[1]);
            mvc.perform(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_HISTORY_RANGE"));
        }
        assertThat(database()).doesNotExist();
    }

    void unavailable() throws Exception {
        String body = mvc.perform(get("/api/history").param("from", from).param("to", to))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("HISTORY_UNAVAILABLE"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("private history", temp.toString(), "SQLITE", "jdbc:", "SELECT", "Exception");
    }
    @Test void missingCorruptAndNewerSchemaFailSafelyWithoutRepairOrCreation() throws Exception {
        Files.delete(database());
        unavailable();
        assertThat(database()).doesNotExist();
        var missingParent = temp.resolve("absent/never-created.db");
        assertThatThrownBy(() -> new HistoryRepository(new HistoryProperties(missingParent.toString(), 50))
                .history(HistoryRange.parse(from, to))).isInstanceOf(HistoryPersistenceException.class);
        assertThat(missingParent.getParent()).doesNotExist();
        Files.writeString(database(), "corrupt fixture");
        unavailable();
        assertThat(Files.readString(database())).isEqualTo("corrupt fixture");
        Files.delete(database());
        repository.initialize();
        sql("PRAGMA user_version = 99");
        byte[] before = Files.readAllBytes(database());
        unavailable();
        assertThat(Files.readAllBytes(database())).isEqualTo(before);
    }

    @Test void readWorksAlongsideReservedWriterAndExclusiveLockFailsSafely() throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database().toUri()); var statement = connection.createStatement()) {
            statement.execute("BEGIN IMMEDIATE");
            query(from, to);
            statement.execute("ROLLBACK");
            statement.execute("BEGIN EXCLUSIVE");
            unavailable();
            statement.execute("ROLLBACK");
        }
        query(from, to);
        mvc.perform(post("/api/history")).andExpect(status().isMethodNotAllowed());
    }
}
