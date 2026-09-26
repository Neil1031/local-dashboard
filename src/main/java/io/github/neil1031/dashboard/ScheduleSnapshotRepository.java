package io.github.neil1031.dashboard;

import org.springframework.stereotype.Repository;
import org.sqlite.SQLiteConfig;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.*;
import static io.github.neil1031.dashboard.Models.*;

@Repository
public class ScheduleSnapshotRepository {
    private static final DateTimeFormatter UTC = new DateTimeFormatterBuilder().appendInstant(9).toFormatter();
    private final HistoryProperties properties;
    private final HistoryRepository history;

    public ScheduleSnapshotRepository(HistoryProperties properties, HistoryRepository history) {
        this.properties = properties;
        this.history = history;
    }

    public void observe(List<Job> jobs, Instant observedAt, String windowsTimezoneId, boolean complete,
                        List<String> includes, List<String> excludes) {
        try {
            // The shared schema is upgraded by the existing transactional migrator.
            history.initialize();
            Path file = Path.of(properties.databasePath()).toAbsolutePath().normalize();
            Files.createDirectories(file.getParent());
            SQLiteConfig config = new SQLiteConfig();
            config.enforceForeignKeys(true);
            config.setBusyTimeout(properties.busyTimeoutMs());
            config.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
            config.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);
            try (Connection connection = config.createConnection("jdbc:sqlite:" + file.toUri())) {
                connection.setAutoCommit(false);
                try {
                    String at = UTC.format(observedAt);
                    Set<String> present = new HashSet<>();
                    for (Job job : jobs) {
                        present.add(job.id());
                        ScheduleDefinition definition = ScheduleDefinition.from(job, windowsTimezoneId);
                        upsertJob(connection, job, at);
                        present(connection, job.id(), definition, at, complete ? "OK" : "PARTIAL");
                    }
                    if (complete) absentForSelectedMissingJobs(connection, present, at, includes, excludes);
                    connection.commit();
                } catch (Exception failure) {
                    connection.rollback();
                    throw failure;
                }
            }
        } catch (Exception failure) { throw new HistoryPersistenceException(failure); }
    }

    private static void upsertJob(Connection db, Job job, String at) throws SQLException {
        try (PreparedStatement statement = db.prepareStatement("""
                INSERT INTO job(id, task_path, task_name, enabled, first_seen_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    task_path = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.task_path ELSE job.task_path END,
                    task_name = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.task_name ELSE job.task_name END,
                    enabled = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.enabled ELSE job.enabled END,
                    first_seen_at = min(job.first_seen_at, excluded.first_seen_at),
                    last_seen_at = max(job.last_seen_at, excluded.last_seen_at)
                """)) {
            statement.setString(1, job.id());
            statement.setString(2, job.taskPath());
            statement.setString(3, job.name());
            statement.setObject(4, job.enabled() == null ? null : job.enabled() ? 1 : 0);
            statement.setString(5, at);
            statement.setString(6, at);
            statement.executeUpdate();
        }
    }

    private static void present(Connection db, String jobId, ScheduleDefinition definition, String at, String status)
            throws SQLException {
        Latest latest = latest(db, jobId);
        if (latest != null && at.compareTo(latest.observedAt) < 0) return;
        if (latest != null && at.equals(latest.observedAt)) {
            if ("PRESENT".equals(latest.presence) && definition.fingerprint().equals(latest.fingerprint)) return;
            throw new SQLException("Conflicting schedule observation timestamp");
        }
        Long versionId = latest != null && "PRESENT".equals(latest.presence)
                && definition.fingerprint().equals(latest.fingerprint) ? latest.versionId : null;
        if (versionId == null) {
            String previous = latest == null ? null : lastPresentAt(db, jobId);
            try (PreparedStatement insert = db.prepareStatement("""
                    INSERT INTO schedule_version(job_id, fingerprint, definition_json, first_observed_at,
                                                 last_observed_at, windows_timezone_id, previous_last_observed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS)) {
                insert.setString(1, jobId);
                insert.setString(2, definition.fingerprint());
                insert.setString(3, definition.json());
                insert.setString(4, at);
                insert.setString(5, at);
                insert.setString(6, definition.windowsTimezoneId());
                insert.setString(7, previous);
                insert.executeUpdate();
                try (ResultSet key = insert.getGeneratedKeys()) { key.next(); versionId = key.getLong(1); }
            }
        } else {
            try (PreparedStatement update = db.prepareStatement(
                    "UPDATE schedule_version SET last_observed_at = ? WHERE id = ?")) {
                update.setString(1, at);
                update.setLong(2, versionId);
                update.executeUpdate();
            }
        }
        try (PreparedStatement insert = db.prepareStatement("""
                INSERT INTO schedule_observation(job_id, observed_at, schedule_version_id, presence_status, collection_status)
                VALUES (?, ?, ?, 'PRESENT', ?)
                """)) {
            insert.setString(1, jobId);
            insert.setString(2, at);
            insert.setLong(3, versionId);
            insert.setString(4, status);
            insert.executeUpdate();
        }
    }

    private static void absentForSelectedMissingJobs(Connection db, Set<String> present, String at,
                                                       List<String> includes, List<String> excludes) throws SQLException {
        try (PreparedStatement known = db.prepareStatement("""
                SELECT DISTINCT j.id, j.task_path, j.task_name FROM job j
                JOIN schedule_observation o ON o.job_id = j.id
                """); ResultSet rows = known.executeQuery()) {
            while (rows.next()) {
                String id = rows.getString(1);
                if (present.contains(id) || !TaskSelection.selected(includes, excludes, rows.getString(2), rows.getString(3))) continue;
                Latest latest = latest(db, id);
                if (latest == null || at.compareTo(latest.observedAt) <= 0 || !"PRESENT".equals(latest.presence)) continue;
                try (PreparedStatement insert = db.prepareStatement("""
                        INSERT INTO schedule_observation(job_id, observed_at, schedule_version_id, presence_status, collection_status)
                        VALUES (?, ?, NULL, 'ABSENT_OBSERVED', 'OK')
                        """)) {
                    insert.setString(1, id);
                    insert.setString(2, at);
                    insert.executeUpdate();
                }
            }
        }
    }

    private static String lastPresentAt(Connection db, String jobId) throws SQLException {
        try (PreparedStatement statement = db.prepareStatement("""
                SELECT observed_at FROM schedule_observation
                WHERE job_id = ? AND presence_status = 'PRESENT' ORDER BY observed_at DESC LIMIT 1
                """)) {
            statement.setString(1, jobId);
            try (ResultSet rows = statement.executeQuery()) { return rows.next() ? rows.getString(1) : null; }
        }
    }

    private static Latest latest(Connection db, String jobId) throws SQLException {
        try (PreparedStatement statement = db.prepareStatement("""
                SELECT o.observed_at, o.presence_status, o.schedule_version_id, v.fingerprint
                FROM schedule_observation o LEFT JOIN schedule_version v ON v.id = o.schedule_version_id
                WHERE o.job_id = ? ORDER BY o.observed_at DESC LIMIT 1
                """)) {
            statement.setString(1, jobId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? new Latest(rows.getString(1), rows.getString(2),
                        rows.getObject(3) == null ? null : rows.getLong(3), rows.getString(4)) : null;
            }
        }
    }

    private record Latest(String observedAt, String presence, Long versionId, String fingerprint) {}
}
