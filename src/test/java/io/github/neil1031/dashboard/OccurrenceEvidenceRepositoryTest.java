package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class OccurrenceEvidenceRepositoryTest {
    @TempDir Path temp;

    @Test void readsStageAAndExistingJobRunWithoutChangingIdentityOrSchema() throws Exception {
        Path file = temp.resolve("history.db");
        var properties = new HistoryProperties(file.toString(), 2000);
        var history = new HistoryRepository(properties);
        var snapshot = new ScheduleSnapshotRepository(properties, history);
        var fixture = new ObjectMapper().readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"));
        var job = new JobNormalizer().normalize(fixture.path("tasks").get(0));
        Instant observed = Instant.parse("2026-09-21T03:00:00Z");
        history.observe(List.of(job), observed);
        snapshot.observe(List.of(job), observed, "Taipei Standard Time", true, List.of("\\"), List.of());
        long runId;
        try (var db = DriverManager.getConnection("jdbc:sqlite:" + file.toUri());
             var rows = db.createStatement().executeQuery("SELECT id FROM job_run")) {
            assertThat(rows.next()).isTrue();
            runId = rows.getLong(1);
        }
        var reader = new OccurrenceEvidenceRepository(properties);
        assertThat(reader.versions(job.id())).hasSize(1);
        var executions = reader.schedulerRuns(job.id(), Instant.parse("2026-09-20T00:00:00Z"),
                Instant.parse("2026-09-21T00:00:00Z"));
        assertThat(executions).hasSize(1);
        assertThat(executions.getFirst().evidenceId()).isEqualTo("job_run:" + runId);
        assertThat(executions.getFirst().jobId()).isEqualTo(job.id());
        assertThat(executions.getFirst().startedAt()).isEqualTo(Instant.parse("2026-09-20T12:46:08Z"));
        try (var db = DriverManager.getConnection("jdbc:sqlite:" + file.toUri());
             var rows = db.createStatement().executeQuery("SELECT id FROM job_run")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getLong(1)).isEqualTo(runId);
            assertThat(rows.next()).isFalse();
        }
    }

    @Test void readOnlyPathNeverCreatesDatabase() {
        Path absent = temp.resolve("absent.db");
        var reader = new OccurrenceEvidenceRepository(new HistoryProperties(absent.toString(), 2000));
        assertThatThrownBy(() -> reader.versions("job")).isInstanceOf(HistoryPersistenceException.class);
        assertThat(absent).doesNotExist();
    }
}
