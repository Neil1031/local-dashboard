package io.github.neil1031.dashboard;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;
import org.sqlite.SQLiteConfig;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.List;
import static io.github.neil1031.dashboard.Models.*;

/** Short-lived JDBC connections; database constraints coordinate independent instances. */
@Repository
public class HistoryRepository {
    private static final int SCHEMA_VERSION = 1;
    // Fixed fractional width keeps UTC text ordering independent of source offset/precision.
    private static final DateTimeFormatter UTC = new DateTimeFormatterBuilder().appendInstant(9).toFormatter();
    private final HistoryProperties properties;

    public HistoryRepository(HistoryProperties properties) { this.properties = properties; }

    public void initialize() { write(List.of(), null); }

    public void observe(List<Job> jobs, Instant collectedAt) { write(jobs, collectedAt); }

    private Connection connect() throws SQLException, IOException {
        Path file = Path.of(properties.databasePath()).toAbsolutePath().normalize();
        Files.createDirectories(file.getParent());
        SQLiteConfig config = new SQLiteConfig();
        config.enforceForeignKeys(true);
        config.setBusyTimeout(properties.busyTimeoutMs());
        config.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
        config.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);
        return config.createConnection("jdbc:sqlite:" + file.toUri());
    }

    private void write(List<Job> jobs, Instant collectedAt) {
        try (Connection connection = connect()) {
            connection.setAutoCommit(false); // BEGIN IMMEDIATE: acquire writer before inspecting schema.
            try {
                migrate(connection);
                if (!jobs.isEmpty()) persist(connection, jobs, UTC.format(collectedAt));
                connection.commit();
            } catch (Exception failure) {
                try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
                throw failure;
            }
        } catch (Exception failure) {
            throw new HistoryPersistenceException(failure);
        }
    }

    private void migrate(Connection connection) throws SQLException, IOException {
        try (Statement statement = connection.createStatement()) {
            int version;
            try (ResultSet result = statement.executeQuery("PRAGMA user_version")) {
                version = result.getInt(1);
            }
            if (version < 0 || version > SCHEMA_VERSION) {
                throw new SQLException("Unsupported history schema version: " + version);
            }
            if (version == 0) {
                // Never adopt or rebuild an unknown database containing existing user objects.
                try (ResultSet result = statement.executeQuery(
                        "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")) {
                    if (result.getInt(1) != 0) throw new SQLException("Unversioned history database is not empty");
                }
                try (var input = new ClassPathResource("db/migration/V1__observed_history.sql").getInputStream()) {
                    // V1 contains only simple DDL statements, no triggers or embedded semicolons.
                    for (String sql : new String(input.readAllBytes(), StandardCharsets.UTF_8).split(";")) {
                        if (!sql.isBlank()) statement.execute(sql);
                    }
                }
                statement.execute("PRAGMA user_version = 1");
            }
            // Future versions append sequential migrations inside this same transaction.
            // Preparing UPSERT also verifies the required columns and UNIQUE conflict target.
            try (var ignored = connection.prepareStatement(RUN_UPSERT);
                 var ignoredJob = connection.prepareStatement(JOB_UPSERT)) { /* fail explicitly on schema damage */ }
        }
    }

    private static final String JOB_UPSERT = """
            INSERT INTO job (id, task_path, task_name, enabled, first_seen_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                task_path = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.task_path ELSE job.task_path END,
                task_name = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.task_name ELSE job.task_name END,
                enabled = CASE WHEN excluded.last_seen_at >= job.last_seen_at THEN excluded.enabled ELSE job.enabled END,
                first_seen_at = min(job.first_seen_at, excluded.first_seen_at),
                last_seen_at = max(job.last_seen_at, excluded.last_seen_at)
            """;
    private static final String RUN_UPSERT = """
            INSERT INTO job_run (job_id, observed_run_at, outcome, scheduler_result, duration_ms,
                                 message, raw_result, first_observed_at, last_observed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id, observed_run_at) DO UPDATE SET
                outcome = CASE WHEN excluded.last_observed_at >= job_run.last_observed_at THEN excluded.outcome ELSE job_run.outcome END,
                scheduler_result = CASE WHEN excluded.last_observed_at >= job_run.last_observed_at THEN excluded.scheduler_result ELSE job_run.scheduler_result END,
                duration_ms = CASE WHEN excluded.last_observed_at >= job_run.last_observed_at THEN excluded.duration_ms ELSE job_run.duration_ms END,
                message = CASE WHEN excluded.last_observed_at >= job_run.last_observed_at THEN excluded.message ELSE job_run.message END,
                raw_result = CASE WHEN excluded.last_observed_at >= job_run.last_observed_at THEN excluded.raw_result ELSE job_run.raw_result END,
                first_observed_at = min(job_run.first_observed_at, excluded.first_observed_at),
                last_observed_at = max(job_run.last_observed_at, excluded.last_observed_at)
            """;

    private void persist(Connection connection, List<Job> jobs, String observedAt) throws SQLException {
        try (PreparedStatement jobStatement = connection.prepareStatement(JOB_UPSERT);
             PreparedStatement runStatement = connection.prepareStatement(RUN_UPSERT)) {
            for (Job job : jobs) {
                jobStatement.setString(1, job.id());
                jobStatement.setString(2, job.taskPath());
                jobStatement.setString(3, job.name());
                jobStatement.setObject(4, job.enabled() == null ? null : job.enabled() ? 1 : 0);
                jobStatement.setString(5, observedAt);
                jobStatement.setString(6, observedAt);
                jobStatement.executeUpdate();
                // Honor normalization; current status/disabled/result=0 alone is never evidence.
                if (job.lastRunAt() == null || (job.lastRunStatus() != Status.SUCCESS
                        && job.lastRunStatus() != Status.FAILED)) continue;
                runStatement.setString(1, job.id());
                runStatement.setString(2, UTC.format(job.lastRunAt()));
                runStatement.setString(3, job.lastRunStatus().name());
                runStatement.setObject(4, job.lastTaskResult());
                runStatement.setObject(5, job.durationMs());
                runStatement.setString(6, job.resultText());
                runStatement.setString(7, job.raw().toString());
                runStatement.setString(8, observedAt);
                runStatement.setString(9, observedAt);
                runStatement.executeUpdate();
            }
        }
    }

    /** Internal bounded read only; no public history HTTP contract in Stage 3A. */
    public List<ObservedRun> recentRuns(String jobId, int limit) {
        if (limit < 1 || limit > 1000) throw new IllegalArgumentException("limit must be 1..1000");
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("""
                SELECT * FROM job_run WHERE job_id = ? ORDER BY observed_run_at DESC LIMIT ?
                """)) {
            statement.setString(1, jobId);
            statement.setInt(2, limit);
            try (ResultSet rows = statement.executeQuery()) {
                List<ObservedRun> runs = new ArrayList<>();
                while (rows.next()) runs.add(new ObservedRun(rows.getLong("id"), rows.getString("job_id"),
                        Instant.parse(rows.getString("observed_run_at")), Status.valueOf(rows.getString("outcome")),
                        nullableLong(rows, "scheduler_result"), nullableLong(rows, "duration_ms"),
                        rows.getString("message"), rows.getString("raw_result"),
                        Instant.parse(rows.getString("first_observed_at")), Instant.parse(rows.getString("last_observed_at"))));
                return List.copyOf(runs);
            }
        } catch (Exception failure) { throw new HistoryPersistenceException(failure); }
    }

    private static Long nullableLong(ResultSet rows, String column) throws SQLException {
        long value = rows.getLong(column);
        return rows.wasNull() ? null : value;
    }

    public record ObservedRun(long id, String jobId, Instant observedRunAt, Status outcome,
                              Long schedulerResult, Long durationMs, String message, String rawResult,
                              Instant firstObservedAt, Instant lastObservedAt) {}
}
