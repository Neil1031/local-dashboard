package io.github.neil1031.dashboard;

import java.nio.file.Path;
import java.sql.*;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.List;
import org.sqlite.SQLiteConfig;

/** Explicit opt-in read-only source for shadow correlation; no HTTP or refresh side effects. */
public final class OccurrenceEvidenceRepository {
    private static final DateTimeFormatter UTC = new DateTimeFormatterBuilder().appendInstant(9).toFormatter();
    private final HistoryProperties properties;

    public OccurrenceEvidenceRepository(HistoryProperties properties) { this.properties = properties; }

    private Connection open() throws SQLException {
        Path file = Path.of(properties.databasePath()).toAbsolutePath().normalize();
        SQLiteConfig config = new SQLiteConfig();
        config.setReadOnly(true);
        config.setBusyTimeout(properties.busyTimeoutMs());
        return config.createConnection("jdbc:sqlite:" + file.toUri() + "?mode=ro");
    }

    public List<OccurrenceCorrelation.Version> versions(String jobId) {
        try (Connection db = open(); PreparedStatement sql = db.prepareStatement("""
                SELECT id, job_id, definition_json, first_observed_at, last_observed_at, previous_last_observed_at
                FROM schedule_version WHERE job_id = ? ORDER BY first_observed_at, id LIMIT 1001
                """)) {
            sql.setString(1, jobId);
            List<OccurrenceCorrelation.Version> found = new ArrayList<>();
            try (ResultSet rows = sql.executeQuery()) {
                while (rows.next()) found.add(new OccurrenceCorrelation.Version(rows.getLong(1), rows.getString(2),
                        rows.getString(3), Instant.parse(rows.getString(4)), Instant.parse(rows.getString(5)),
                        rows.getString(6) == null ? null : Instant.parse(rows.getString(6))));
            }
            if (found.size() > 1000) throw new IllegalStateException("Schedule version diagnostic limit exceeded");
            return List.copyOf(found);
        } catch (Exception failure) { throw new HistoryPersistenceException(failure); }
    }

    public List<OccurrenceCorrelation.ExecutionEvidence> schedulerRuns(String jobId, Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to)) throw new IllegalArgumentException("Invalid range");
        try (Connection db = open(); PreparedStatement sql = db.prepareStatement("""
                SELECT id, job_id, observed_run_at, outcome FROM job_run
                WHERE job_id = ? AND observed_run_at >= ? AND observed_run_at < ?
                ORDER BY observed_run_at, id LIMIT 1001
                """)) {
            sql.setString(1, jobId);
            sql.setString(2, UTC.format(from));
            sql.setString(3, UTC.format(to));
            List<OccurrenceCorrelation.ExecutionEvidence> found = new ArrayList<>();
            try (ResultSet rows = sql.executeQuery()) {
                while (rows.next()) found.add(new OccurrenceCorrelation.ExecutionEvidence("job_run:" + rows.getLong(1),
                        rows.getString(2), Instant.parse(rows.getString(3)),
                        "FAILED".equals(rows.getString(4)) ? OccurrenceCorrelation.ExecutionOutcome.EXECUTED_FAILED
                                : OccurrenceCorrelation.ExecutionOutcome.EXECUTED_SUCCESS,
                        OccurrenceCorrelation.Source.SCHEDULER, rows.getString(2), null));
            }
            if (found.size() > 1000) throw new IllegalStateException("Execution diagnostic limit exceeded");
            return List.copyOf(found);
        } catch (Exception failure) { throw new HistoryPersistenceException(failure); }
    }
}
