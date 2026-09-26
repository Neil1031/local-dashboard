package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.github.neil1031.dashboard.runner.RunnerReceiptService;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;
import static io.github.neil1031.dashboard.OccurrenceCorrelation.*;
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
        assertThat(executions.getFirst().schedulerJobId()).isEqualTo(job.id());
        assertThat(executions.getFirst().schedulerTask()).isEqualTo("\\Research\\Daily Report 中文");
        assertThat(executions.getFirst().runnerJobId()).isNull();
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

    @Test void realSchedulerAndRunnerNamespacesCombineOnlyWithExactTrustedMapping() throws Exception {
        Path file = temp.resolve("identities.db");
        var properties = new HistoryProperties(file.toString(), 2000);
        var inventory = new ObjectMapper().readTree(getClass().getResourceAsStream("/fixtures/schedule-inventory.json"));
        ObjectNode task = (ObjectNode) inventory.path("tasks").get(4).deepCopy();
        task.put("State", "Ready").put("LastRunTime", "2026-10-02T22:00:02+08:00")
                .put("LastTaskResult", 0).put("NextRunTime", "2026-10-09T22:00:00+08:00");
        var job = new JobNormalizer().normalize(task);
        String fullTask = "\\AIStockHunter-Accumulation-Weekly-Check";
        assertThat(job.id()).isEqualTo(JobNormalizer.canonicalIdFromFullTask(fullTask));
        assertThat(job.id()).isNotEqualTo("aistockhunter-accumulation-weekly");
        new HistoryRepository(properties).observe(List.of(job), Instant.parse("2026-10-02T14:01:00Z"));
        var scheduler = new OccurrenceEvidenceRepository(properties).schedulerRuns(job.id(),
                Instant.parse("2026-10-02T14:00:00Z"), Instant.parse("2026-10-02T14:01:00Z")).getFirst();
        assertThat(scheduler.schedulerJobId()).isEqualTo(job.id());
        assertThat(scheduler.schedulerTask()).isEqualTo(fullTask);
        assertThat(scheduler.runnerJobId()).isNull();
        var mapping = new RunnerReceiptService.JobExecutions(fullTask, "aistockhunter-accumulation-weekly",
                "aistockhunter-accumulation-weekly", "AVAILABLE", "COMPLETE", null, List.of(), List.of());
        var receipt = new RunnerReceiptService.Execution("receipt-1", "aistockhunter-accumulation-weekly",
                "aistockhunter-accumulation-weekly", "TERMINAL", "2026-10-02T14:00:01Z",
                "2026-10-02T14:00:03Z", "2026-10-02T14:00:10Z", 9000L, true, 0, 0,
                "SUCCESS", "COMPLETE", "primary", null, List.of(), List.of());
        var runner = fromRunner(mapping, receipt);
        assertThat(runner.schedulerJobId()).isEqualTo(job.id());
        assertThat(runner.runnerJobId()).isEqualTo("aistockhunter-accumulation-weekly");
        assertThat(runner.runnerExecutionId()).isEqualTo("receipt-1");
        var combined = combine(List.of(scheduler), List.of(runner), List.of(mapping));
        assertThat(combined).hasSize(1);
        assertThat(combined.getFirst().source()).isEqualTo(Source.COMBINED);
        assertThat(combined.getFirst().schedulerJobId()).isEqualTo(job.id());
        assertThat(combined.getFirst().runnerJobId()).isEqualTo(receipt.jobId());
        assertThat(combine(List.of(scheduler), List.of(runner), List.of(
                new RunnerReceiptService.JobExecutions("\\Other", mapping.profileId(), mapping.jobId(),
                        "AVAILABLE", "COMPLETE", null, List.of(), List.of())))).hasSize(2);
        assertThat(combine(List.of(scheduler), List.of(runner), List.of(
                new RunnerReceiptService.JobExecutions(fullTask, "other-profile", mapping.jobId(),
                        "AVAILABLE", "COMPLETE", null, List.of(), List.of())))).hasSize(2);
        assertThat(combine(List.of(scheduler), List.of(runner), List.of(
                new RunnerReceiptService.JobExecutions(fullTask, mapping.profileId(), "other-runner-job",
                        "AVAILABLE", "COMPLETE", null, List.of(), List.of())))).hasSize(2);
        assertThatThrownBy(() -> fromRunner(mapping, new RunnerReceiptService.Execution("receipt-2", "wrong-job",
                receipt.commandProfileId(), "TERMINAL", receipt.startedAt(), receipt.processStartedAt(),
                receipt.terminalAt(), 9000L, true, 0, 0, "SUCCESS", "COMPLETE", "primary", null,
                List.of(), List.of()))).isInstanceOf(IllegalArgumentException.class);
    }
}
