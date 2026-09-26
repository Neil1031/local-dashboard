package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;

class ScheduleSnapshotTest {
    @TempDir Path temp;
    final ObjectMapper mapper = new ObjectMapper();
    final JobNormalizer normalizer = new JobNormalizer();
    final Instant t0 = Instant.parse("2026-09-26T01:00:00Z");
    HistoryProperties props() { return new HistoryProperties(temp.resolve("history.db").toString(), 2000); }
    HistoryRepository history() { return new HistoryRepository(props()); }
    ScheduleSnapshotRepository repo() { return new ScheduleSnapshotRepository(props(), history()); }
    ObjectNode row() throws Exception {
        return (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"))
                .path("tasks").get(0).deepCopy();
    }
    long count(String sql) throws Exception {
        try (var db = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("history.db").toUri());
             var statement = db.createStatement(); var rows = statement.executeQuery(sql)) { return rows.getLong(1); }
    }
    String value(String sql) throws Exception {
        try (var db = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("history.db").toUri());
             var statement = db.createStatement(); var rows = statement.executeQuery(sql)) { return rows.next() ? rows.getString(1) : null; }
    }
    void observe(ObjectNode row, Instant at, boolean complete) {
        repo().observe(List.of(normalizer.normalize(row)), at, "Taipei Standard Time", complete,
                List.of("\\"), List.of());
    }

    @Test void canonicalFingerprintIgnoresRuntimeOrderAndSensitiveFields() throws Exception {
        var raw = row();
        var triggers = raw.withArray("Triggers");
        triggers.addObject().put("type", "MSFT_TaskWeeklyTrigger")
                .put("StartBoundary", "2026-09-01T17:00:00").put("DaysOfWeek", 62).put("WeeksInterval", 1);
        var first = ScheduleDefinition.from(normalizer.normalize(raw), "Taipei Standard Time");
        raw.put("LastTaskResult", 99).put("State", "Running").put("LastRunTime", "2026-09-27T01:00:00Z")
                .put("NextRunTime", "2026-09-28T01:00:00Z").put("ActionArgs", "secret")
                .put("Executable", "C:\\private\\run.exe").put("Account", "private");
        var reversed = mapper.createArrayNode().add(triggers.get(1)).add(triggers.get(0));
        raw.set("Triggers", reversed);
        var second = ScheduleDefinition.from(normalizer.normalize(raw), "Taipei Standard Time");
        assertThat(second.fingerprint()).isEqualTo(first.fingerprint());
        assertThat(second.json()).isEqualTo(first.json()).contains("indexWithinVersion", "LOCAL_WINDOWS_TIMEZONE");
        assertThat(second.json()).doesNotContain("secret", "Executable", "Account", "LastRun", "NextRun", "State");
        assertThat(mapper.readTree(second.json()).path("triggers")).hasSize(2);
    }

    @Test void definitionChangesAndObservationGapCreateEpisodes() throws Exception {
        var raw = row();
        observe(raw, t0, true);
        observe(raw, t0.plusSeconds(60), true);
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(1);
        assertThat(value("SELECT last_observed_at FROM schedule_version")).isEqualTo("2026-09-26T01:01:00.000000000Z");
        raw.withArray("Triggers").get(0).deepCopy();
        ((ObjectNode) raw.path("Triggers").get(0)).put("StartBoundary", "2026-09-01T07:30:00+08:00");
        observe(raw, t0.plusSeconds(120), true);
        raw.put("Enabled", false);
        observe(raw, t0.plusSeconds(180), true);
        raw.put("StartWhenAvailable", true);
        observe(raw, t0.plusSeconds(240), true);
        raw.withArray("Triggers").addObject().put("type", "MSFT_TaskWeeklyTrigger")
                .put("StartBoundary", "2026-09-01T17:00:00").put("DaysOfWeek", 62);
        observe(raw, t0.plusSeconds(300), true);
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(5);
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(6);
        assertThat(value("SELECT previous_last_observed_at FROM schedule_version ORDER BY id LIMIT 1 OFFSET 1"))
                .isEqualTo("2026-09-26T01:01:00.000000000Z");
        assertThat(value("SELECT definition_json FROM schedule_version ORDER BY id DESC LIMIT 1"))
                .contains("StartBoundaryInstant", "2026-08-31T23:30:00Z", "17:00:00", "triggers");
    }

    @Test void completeMissingRecordsAbsenceButPartialAndChangedSelectorDoNot() throws Exception {
        var raw = row();
        observe(raw, t0, true);
        repo().observe(List.of(), t0.plusSeconds(60), "Taipei Standard Time", false, List.of("\\"), List.of());
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(1);
        repo().observe(List.of(), t0.plusSeconds(120), "Taipei Standard Time", true, List.of("Other"), List.of());
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(1);
        repo().observe(List.of(), t0.plusSeconds(180), "Taipei Standard Time", true, List.of("\\"), List.of());
        assertThat(value("SELECT presence_status FROM schedule_observation ORDER BY id DESC LIMIT 1"))
                .isEqualTo("ABSENT_OBSERVED");
        repo().observe(List.of(), t0.plusSeconds(240), "Taipei Standard Time", true, List.of("\\"), List.of());
        assertThat(count("SELECT count(*) FROM schedule_observation WHERE presence_status='ABSENT_OBSERVED'"))
                .isEqualTo(1);
        observe(raw, t0.plusSeconds(300), true);
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(2);
    }

    @Test void restartAndV1MigrationPreserveRuns() throws Exception {
        var raw = row();
        history().observe(List.of(normalizer.normalize(raw)), t0);
        assertThat(count("SELECT count(*) FROM job_run")).isEqualTo(1);
        // Simulate a v1 database by removing only the newly created empty schedule tables.
        try (var db = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("history.db").toUri());
             var statement = db.createStatement()) {
            statement.execute("DROP TABLE schedule_observation");
            statement.execute("DROP TABLE schedule_version");
            statement.execute("PRAGMA user_version = 1");
        }
        observe(raw, t0.plusSeconds(60), true);
        observe(raw, t0.plusSeconds(120), true);
        assertThat(count("PRAGMA user_version")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM job_run")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(2);
    }

    @Test void oneCollectorCallAndNoObservationOnErrorOrUnconfigured() throws Exception {
        var raw = row();
        var snapshot = mapper.createObjectNode().put("schemaVersion", 1).put("collectedAt", t0.toString())
                .put("windowsTimezoneId", "Taipei Standard Time");
        snapshot.putArray("tasks").add(raw);
        snapshot.putArray("errors");
        snapshot.putArray("unmatchedIncludes");
        var calls = new AtomicInteger();
        SchedulerCollector collector = () -> { calls.incrementAndGet(); return snapshot; };
        var service = new JobService(collector, new SchedulerProperties(List.of("\\"), List.of(), 15, 30),
                normalizer, new HistoryObserver(history()), new ScheduleSnapshotObserver(repo()));
        assertThat(service.jobs().collectionStatus()).isEqualTo("OK");
        assertThat(calls).hasValue(1);
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(1);
        var noConfig = new JobService(collector, new SchedulerProperties(List.of(), List.of(), 15, 30),
                normalizer, new HistoryObserver(history()), new ScheduleSnapshotObserver(repo()));
        assertThat(noConfig.jobs().collectionStatus()).isEqualTo("NOT_CONFIGURED");
        assertThat(calls).hasValue(1);
        var failing = new JobService(() -> { throw new CollectionException("TEST", "failed"); },
                new SchedulerProperties(List.of("\\"), List.of(), 15, 30), normalizer,
                new HistoryObserver(history()), new ScheduleSnapshotObserver(repo()));
        assertThatThrownBy(failing::jobs).isInstanceOf(CollectionException.class);
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(1);
    }

    @Test void sensitiveScheduledFieldIsRejectedWithoutPartialWrites() throws Exception {
        var raw = row();
        ((ObjectNode) raw.path("Triggers").get(0)).put("Id", "C:\\private\\schedule.xml");
        assertThatThrownBy(() -> observe(raw, t0, true)).isInstanceOf(HistoryPersistenceException.class);
        assertThat(count("SELECT count(*) FROM schedule_version")).isZero();
        assertThat(count("SELECT count(*) FROM schedule_observation")).isZero();
        assertThatThrownBy(() -> ScheduleDefinition.from(normalizer.normalize(row()), "C:\\private\\zone"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void currentInventoryRetainsIndependentWeekdayTriggersAndFridayCheck() throws Exception {
        var inventory = mapper.readTree(getClass().getResourceAsStream("/fixtures/schedule-inventory.json"));
        assertThat(inventory.path("tasks")).hasSize(5);
        for (var task : inventory.path("tasks")) {
            var definition = ScheduleDefinition.from(normalizer.normalize(task), inventory.path("windowsTimezoneId").asText());
            var saved = mapper.readTree(definition.json()).path("triggers");
            if (task.path("TaskName").asText().equals("AIStockHunter-UnexplainedVolume-Daily")) {
                assertThat(saved).hasSize(2);
                assertThat(saved.toString()).contains("14:30:00", "17:00:00", "DaysOfWeek");
                assertThat(saved.get(0).path("indexWithinVersion").asInt()).isNotEqualTo(saved.get(1).path("indexWithinVersion").asInt());
            } else assertThat(saved).hasSize(1);
        }
        assertThat(inventory.toString()).doesNotContain("13:35");
    }

    @Test void concurrentRefreshesCannotDuplicateVersionOrObservation() throws Exception {
        var raw = row();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(6)) {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 6; i++) futures.add(executor.submit(() -> {
                start.await();
                observe(raw, t0, true);
                return null;
            }));
            start.countDown();
            for (var future : futures) future.get(20, TimeUnit.SECONDS);
        }
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM schedule_observation")).isEqualTo(1);
    }

    @Test void timezoneContextChangesVersionAndOffsetlessBoundaryKeepsOriginalText() throws Exception {
        var raw = row();
        ((ObjectNode) raw.path("Triggers").get(0)).put("StartBoundary", "2026-09-01T06:30:00");
        var taipei = ScheduleDefinition.from(normalizer.normalize(raw), "Taipei Standard Time");
        assertThat(taipei.json()).contains("2026-09-01T06:30:00", "LOCAL_WINDOWS_TIMEZONE");
        assertThat(taipei.json()).doesNotContain("StartBoundaryInstant");
        repo().observe(List.of(normalizer.normalize(raw)), t0, "Taipei Standard Time", true, List.of("\\"), List.of());
        repo().observe(List.of(normalizer.normalize(raw)), t0.plusSeconds(60), "Pacific Standard Time", true,
                List.of("\\"), List.of());
        assertThat(count("SELECT count(*) FROM schedule_version")).isEqualTo(2);
        assertThat(value("SELECT windows_timezone_id FROM schedule_version ORDER BY id DESC LIMIT 1"))
                .isEqualTo("Pacific Standard Time");
    }
}
