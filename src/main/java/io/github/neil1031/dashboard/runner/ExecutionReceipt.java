package io.github.neil1031.dashboard.runner;

/** Version 1 file contract; times are UTC ISO-8601 strings, never local wall-clock strings. */
public record ExecutionReceipt(int schemaVersion, String executionId, String jobId, String commandProfileId,
                               Phase phase, Outcome outcome, String startedAt, String processStartedAt,
                               String finishedAt, Long durationMs, Integer exitCode, Integer runnerExitCode,
                               String processStartFailure, String terminationReason,
                               Output stdout, Output stderr, String createdAt) {
    public enum Phase { STARTED, PROCESS_STARTED, TERMINAL }
    public enum Outcome { SUCCESS, FAILED, START_FAILED, TIMEOUT, UNKNOWN }
    public record Output(long observedBytes, int sampleLimitBytes, int sampledBytes,
                         boolean truncated, boolean complete, boolean readFailed, boolean contentStored) {}

    public String completionState() { return phase == Phase.TERMINAL ? "TERMINAL" : "INCOMPLETE"; }
}
