package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.time.Instant;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.*;
import static io.github.neil1031.dashboard.Models.*;
import static org.assertj.core.api.Assertions.*;

class HistoryRepositoryTest {
    @TempDir Path temp;
    final ObjectMapper mapper = new ObjectMapper();
    final JobNormalizer normalizer = new JobNormalizer();
    final Instant first = Instant.parse("2026-09-21T00:00:00Z");
    Path database() { return temp.resolve("資料 history #1").resolve("observed.db"); }
    HistoryRepository repository() { return new HistoryRepository(new HistoryProperties(database().toString(), 2000)); }
    ObjectNode row() throws Exception {
        return (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json")).path("tasks").get(0).deepCopy();
    }
    Connection connection() throws Exception { return DriverManager.getConnection("jdbc:sqlite:" + database().toUri()); }
    long number(String sql) throws Exception {
        try (var connection = connection(); var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            return rows.getLong(1);
        }
    }
    void execute(String sql) throws Exception {
        try (var connection = connection(); var statement = connection.createStatement()) { statement.execute(sql); }
    }

    @Test void freshDatabaseCreatesVersionedSchemaAndExistingDatabaseSurvivesReinitialization() throws Exception {
        var repository = repository();
        assertThat(database()).doesNotExist();
        repository.initialize();
        assertThat(database()).exists();
        assertThat(number("PRAGMA user_version")).isEqualTo(1);
        assertThat(number("SELECT count(*) FROM job")).isZero();
        var job = normalizer.normalize(row());
        repository.observe(List.of(job), first);
        repository().initialize();
        assertThat(repository().recentRuns(job.id(), 10)).hasSize(1);
        assertThat(number("SELECT count(*) FROM pragma_foreign_key_check")).isZero();
    }

    @Test void tenObservationsAndRepositoryRestartKeepOneStableRunWithEvidence() throws Exception {
        var repository = repository();
        var job = normalizer.normalize(row());
        for (int i = 0; i < 10; i++) repository.observe(List.of(job), first.plusSeconds(i));
        var run = repository.recentRuns(job.id(), 10).getFirst();
        var restarted = repository(); // All earlier JDBC connections have already been closed.
        restarted.observe(List.of(job), first.plusSeconds(10));
        assertThat(restarted.recentRuns(job.id(), 10)).singleElement().satisfies(saved -> {
            assertThat(saved.id()).isEqualTo(run.id());
            assertThat(saved.outcome()).isEqualTo(Status.SUCCESS);
            assertThat(saved.schedulerResult()).isZero();
            assertThat(saved.durationMs()).isNull();
            assertThat(saved.rawResult()).contains("+08:00", "Daily Report 中文");
            assertThat(saved.message()).contains("application-level success is not verified");
            assertThat(saved.firstObservedAt()).isEqualTo(first);
            assertThat(saved.lastObservedAt()).isEqualTo(first.plusSeconds(10));
        });
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(1);
        assertThat(number("SELECT count(*) FROM job")).isEqualTo(1);
    }

    @Test void changingExactSelectionToPrefixPreservesJobAndSqliteRunIdentity() throws Exception {
        String name = "AIStockHunter-Accumulation-Check-2026-09-22";
        var raw = row().put("TaskPath", "\\").put("TaskName", name);
        var snapshot = mapper.createObjectNode().put("schemaVersion", 1).put("collectedAt", first.toString());
        snapshot.putArray("tasks").add(raw);
        snapshot.putArray("errors");
        snapshot.putArray("unmatchedIncludes");
        var repository = repository();
        var observer = new HistoryObserver(repository);
        var exact = new JobService(() -> snapshot, new SchedulerProperties(List.of("\\" + name), List.of(), 15, 30), normalizer, observer).jobs();
        String id = "XGFpc3RvY2todW50ZXItYWNjdW11bGF0aW9uLWNoZWNrLTIwMjYtMDktMjI";
        assertThat(exact.jobs()).singleElement().satisfies(job -> assertThat(job.id()).isEqualTo(id));
        var saved = repository.recentRuns(id, 10).getFirst();
        var prefix = new JobService(() -> snapshot,
                new SchedulerProperties(List.of("\\AIStockHunter-Accumulation-Check-*"), List.of(), 15, 30), normalizer, observer).jobs();
        assertThat(prefix.collectionStatus()).isEqualTo("OK");
        assertThat(prefix.jobs()).isEqualTo(exact.jobs());
        assertThat(repository.recentRuns(id, 10)).containsExactly(saved);
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(1);
        assertThat(number("PRAGMA user_version")).isEqualTo(1);
    }

    @Test void distinctExecutionsAndJobsRemainDistinctIncludingFailureAndDisabledHistory() throws Exception {
        var repository = repository();
        var success = normalizer.normalize(row());
        var disabled = normalizer.normalize(row().put("Enabled", false).put("State", "Disabled"));
        var failed = normalizer.normalize(row().put("LastRunTime", "2026-09-21T00:00:00Z").put("LastTaskResult", -2147024891L));
        var other = normalizer.normalize(row().put("TaskPath", "\\Other\\"));
        repository.observe(List.of(success, other), first);
        repository.observe(List.of(disabled), first.plusSeconds(1));
        repository.observe(List.of(failed), first.plusSeconds(2));
        assertThat(repository.recentRuns(success.id(), 10)).hasSize(2).first().satisfies(run -> {
            assertThat(run.outcome()).isEqualTo(Status.FAILED);
            assertThat(run.schedulerResult()).isEqualTo(2147942405L);
            assertThat(run.rawResult()).contains("-2147024891");
        });
        assertThat(repository.recentRuns(other.id(), 10)).hasSize(1);
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(3);
        // A disabled job's first observation is itself sufficient if the last run is completed.
        var disabledOnly = normalizer.normalize(row().put("TaskName", "Disabled only").put("Enabled", false).put("State", "Disabled"));
        repository.observe(List.of(disabledOnly), first);
        assertThat(repository.recentRuns(disabledOnly.id(), 10)).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"running", "informational", "never-run-code", "sentinel", "no-time", "invalid-time", "collection-error", "missing-result", "missing-enabled"})
    void uncertainObservationsNeverCreateCompletedHistory(String scenario) throws Exception {
        var raw = row();
        switch (scenario) {
            case "running" -> raw.put("State", "Running");
            case "informational" -> raw.put("LastTaskResult", 0x41300);
            case "never-run-code" -> raw.put("LastTaskResult", 0x41303);
            case "sentinel" -> raw.put("LastRunTime", "1899-12-30T00:00:00+08:00");
            case "no-time" -> raw.putNull("LastRunTime");
            case "invalid-time" -> raw.put("LastRunTime", "2026-09-21T00:00:00");
            case "collection-error" -> raw.putObject("CollectionError").put("code", "PERMISSION_DENIED");
            case "missing-result" -> raw.putNull("LastTaskResult");
            case "missing-enabled" -> raw.putNull("Enabled");
        }
        var job = normalizer.normalize(raw);
        assertThat(job.lastRunStatus()).isEqualTo(Status.UNKNOWN);
        repository().observe(List.of(job), first);
        assertThat(number("SELECT count(*) FROM job")).isEqualTo(1);
        assertThat(number("SELECT count(*) FROM job_run")).isZero();
    }

    @Test void metadataChangesDoNotChangeIdentityAndStaleObservationCannotOverwriteNewerEvidence() throws Exception {
        var repository = repository();
        var old = normalizer.normalize(row());
        var updated = normalizer.normalize(row().put("LastTaskResult", 1).put("Enabled", false).put("State", "Disabled"));
        repository.observe(List.of(old), first);
        long id = repository.recentRuns(old.id(), 1).getFirst().id();
        repository.observe(List.of(updated), first.plusSeconds(10));
        repository.observe(List.of(old), first.minusSeconds(1));
        assertThat(number("SELECT enabled FROM job")).isZero();
        repository.observe(List.of(normalizer.normalize(row().put("State", "Running"))), first.plusSeconds(20));
        assertThat(repository.recentRuns(old.id(), 10)).singleElement().satisfies(run -> {
            assertThat(run.id()).isEqualTo(id);
            assertThat(run.outcome()).isEqualTo(Status.FAILED);
            assertThat(run.schedulerResult()).isEqualTo(1);
            assertThat(run.firstObservedAt()).isEqualTo(first.minusSeconds(1));
            assertThat(run.lastObservedAt()).isEqualTo(first.plusSeconds(10));
        });
    }

    @Test void utcOffsetsTaipeiMidnightAndDefaultTimezoneDoNotChangeIdentity() throws Exception {
        var originalZone = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Taipei"));
            var local = normalizer.normalize(row().put("LastRunTime", "2026-09-21T00:00:00+08:00"));
            repository().observe(List.of(local), first);
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
            var utc = normalizer.normalize(row().put("LastRunTime", "2026-09-20T16:00:00.000000000Z"));
            repository().observe(List.of(utc), first.plusSeconds(1));
            repository().observe(List.of(normalizer.normalize(row().put("LastRunTime", "2026-09-20T23:59:59.9999999+08:00"))), first);
            var runs = repository().recentRuns(local.id(), 10);
            assertThat(runs).hasSize(2);
            assertThat(runs.getFirst().observedRunAt()).isEqualTo(Instant.parse("2026-09-20T16:00:00Z"));
            assertThat(runs.getLast().observedRunAt()).isEqualTo(Instant.parse("2026-09-20T15:59:59.999999900Z"));
            try (var connection = connection(); var statement = connection.createStatement();
                 var rows = statement.executeQuery("SELECT observed_run_at FROM job_run ORDER BY observed_run_at DESC")) {
                assertThat(rows.getString(1)).isEqualTo("2026-09-20T16:00:00.000000000Z");
            }
        } finally { TimeZone.setDefault(originalZone); }
    }

    @Test void independentConcurrentInstancesInitializeAndDeduplicateAtDatabaseLevel() throws Exception {
        var job = normalizer.normalize(row());
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var futures = new java.util.ArrayList<Future<?>>();
            for (int i = 0; i < 8; i++) futures.add(executor.submit(() -> {
                start.await();
                repository().observe(List.of(job), first);
                return null;
            }));
            start.countDown();
            for (var future : futures) future.get(20, TimeUnit.SECONDS);
        }
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(1);
        // Bypass all Java dedup logic: the database itself must reject a duplicate.
        assertThatThrownBy(() -> execute("""
                INSERT INTO job_run (job_id, observed_run_at, outcome, raw_result, first_observed_at, last_observed_at)
                SELECT job_id, observed_run_at, outcome, raw_result, first_observed_at, last_observed_at FROM job_run
                """)).isInstanceOf(SQLException.class).hasMessageContaining("UNIQUE");
    }

    @Test void wholeSnapshotRollsBackAfterMidBatchFailureAndRecoversWithoutDroppingHistory() throws Exception {
        var old = normalizer.normalize(row());
        repository().observe(List.of(old), first);
        execute("CREATE TRIGGER reject_fixture BEFORE INSERT ON job WHEN NEW.task_name = 'bad' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
        var next = normalizer.normalize(row().put("LastRunTime", "2026-09-21T00:00:00Z"));
        var bad = normalizer.normalize(row().put("TaskName", "bad"));
        assertThatThrownBy(() -> repository().observe(List.of(next, bad), first.plusSeconds(1))).isInstanceOf(HistoryPersistenceException.class);
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(1);
        assertThat(repository().recentRuns(old.id(), 1).getFirst().lastObservedAt()).isEqualTo(first);
        execute("DROP TRIGGER reject_fixture");
        repository().observe(List.of(next, bad), first.plusSeconds(1));
        assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(3);
    }

    @Test void initialSchemaAndVersionRollBackTogetherOnFailure() throws Exception {
        var job = normalizer.normalize(row());
        // Invalid internal input fails after migration but before the snapshot can commit.
        assertThatThrownBy(() -> repository().observe(List.of(job), null)).isInstanceOf(HistoryPersistenceException.class);
        assertThat(number("PRAGMA user_version")).isZero();
        assertThat(number("SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).isZero();
        repository().initialize();
        assertThat(number("PRAGMA user_version")).isEqualTo(1);
    }

    @Test void unsupportedOrUnversionedExistingDatabaseFailsWithoutDeletingHistory() throws Exception {
        var job = normalizer.normalize(row());
        repository().observe(List.of(job), first);
        for (int version : new int[]{99, 0}) {
            execute("PRAGMA user_version = " + version);
            assertThatThrownBy(() -> repository().initialize()).isInstanceOf(HistoryPersistenceException.class);
            assertThat(number("PRAGMA user_version")).isEqualTo(version);
            assertThat(number("SELECT count(*) FROM job_run")).isEqualTo(1);
        }
    }

    @Test void versionedDatabaseMissingUniqueConstraintIsRejected() throws Exception {
        repository().initialize();
        execute("ALTER TABLE job_run RENAME TO original_job_run");
        execute("CREATE TABLE job_run AS SELECT * FROM original_job_run");
        assertThatThrownBy(() -> repository().initialize()).isInstanceOf(HistoryPersistenceException.class);
        assertThat(number("PRAGMA user_version")).isEqualTo(1);
        assertThat(number("SELECT count(*) FROM sqlite_schema WHERE name = 'original_job_run'")).isEqualTo(1);
    }

    @Test void unversionedDatabaseWithSimilarToReservedNameIsNeverAdopted() throws Exception {
        Files.createDirectories(database().getParent());
        execute("CREATE TABLE sqlitex_evidence (value TEXT)");
        execute("INSERT INTO sqlitex_evidence VALUES ('preserve me')");
        assertThatThrownBy(() -> repository().initialize()).isInstanceOf(HistoryPersistenceException.class);
        assertThat(number("PRAGMA user_version")).isZero();
        assertThat(number("SELECT count(*) FROM sqlitex_evidence")).isEqualTo(1);
        assertThat(number("SELECT count(*) FROM sqlite_schema WHERE name = 'job_run'")).isZero();
    }

    @Test void corruptDatabaseIsNotReplacedAndLockFailureIsBounded() throws Exception {
        Files.createDirectories(database().getParent());
        byte[] corrupt = "not a SQLite database".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(database(), corrupt);
        assertThatThrownBy(() -> repository().initialize()).isInstanceOf(HistoryPersistenceException.class);
        assertThat(Files.readAllBytes(database())).isEqualTo(corrupt);
        // This file belongs only to this test's temporary directory.
        Files.delete(database());
        repository().initialize();
        try (var connection = connection(); var statement = connection.createStatement()) {
            statement.execute("BEGIN IMMEDIATE");
            var bounded = new HistoryRepository(new HistoryProperties(database().toString(), 50));
            long start = System.nanoTime();
            assertThatThrownBy(bounded::initialize).isInstanceOf(HistoryPersistenceException.class);
            assertThat(java.time.Duration.ofNanos(System.nanoTime() - start)).isLessThan(java.time.Duration.ofSeconds(3));
            statement.execute("ROLLBACK");
        }
        repository().initialize();
    }

    @Test void internalReadIsBoundedAndUsesParameters() throws Exception {
        var job = normalizer.normalize(row());
        repository().observe(List.of(job), first);
        assertThat(repository().recentRuns("' OR 1=1 --", 10)).isEmpty();
        assertThatThrownBy(() -> repository().recentRuns(job.id(), 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> repository().recentRuns(job.id(), 1001)).isInstanceOf(IllegalArgumentException.class);
    }
}
