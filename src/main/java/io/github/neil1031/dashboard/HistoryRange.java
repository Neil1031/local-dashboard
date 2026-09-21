package io.github.neil1031.dashboard;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;

/** UTC instants only; fixed-width v1 storage supports years 0000..9999. */
public record HistoryRange(Instant from, Instant to) {
    public HistoryRange {
        if (from == null || to == null || !to.isAfter(from)
                || Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0
                || from.isBefore(Instant.parse("0000-01-01T00:00:00Z"))
                || to.isAfter(Instant.parse("9999-12-31T23:59:59.999999999Z"))) {
            throw new IllegalArgumentException("Invalid history range");
        }
    }

    public static HistoryRange parse(String from, String to) {
        return new HistoryRange(parseUtc(from), parseUtc(to));
    }

    private static Instant parseUtc(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z"))
            throw new IllegalArgumentException("Expected UTC timestamp");
        // OffsetDateTime rejects invalid calendar dates, leap seconds and 24:00.
        return OffsetDateTime.parse(value).toInstant();
    }
}
