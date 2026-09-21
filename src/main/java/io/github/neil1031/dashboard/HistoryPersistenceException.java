package io.github.neil1031.dashboard;

/** Details stay in server logs; never serialize the underlying database exception. */
public class HistoryPersistenceException extends RuntimeException {
    public HistoryPersistenceException(Exception cause) {
        super("Observed execution history is unavailable.", cause);
    }
}
