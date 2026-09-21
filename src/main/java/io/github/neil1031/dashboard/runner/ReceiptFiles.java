package io.github.neil1031.dashboard.runner;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.FileAlreadyExistsException;
import java.util.Optional;
import java.util.List;
import static io.github.neil1031.dashboard.runner.ExecutionReceipt.*;

/** Single owner per atomically claimed execution directory. No dashboard/SQLite dependency. */
public final class ReceiptFiles {
    static final int MAX_RECEIPT_BYTES = 16 * 1024;
    private final Path directory;
    private ReceiptFiles(Path directory) { this.directory = directory; }

    public static final class IdentityCollision extends FileAlreadyExistsException {
        private IdentityCollision() { super("Execution identity already claimed"); }
    }

    public static ReceiptFiles claim(Path root, String executionId) throws IOException {
        validateId(executionId);
        Files.createDirectories(root);
        Path directory = root.resolve(executionId);
        try { Files.createDirectory(directory); } // CREATE_NEW: never adopt a previous invocation.
        catch (FileAlreadyExistsException collision) { throw new IdentityCollision(); }
        return new ReceiptFiles(directory);
    }

    public synchronized void write(ExecutionReceipt receipt) throws IOException {
        if (!directory.getFileName().toString().equals(receipt.executionId())) throw new IOException("Identity mismatch");
        Path destination = directory.resolve(filename(receipt.phase()));
        if (Files.exists(destination)) throw new IOException("Receipt phase already published");
        byte[] bytes = RunnerConfig.JSON.writeValueAsBytes(receipt);
        if (bytes.length > MAX_RECEIPT_BYTES) throw new IOException("Receipt exceeds size limit");
        Path pending = Files.createTempFile(directory, ".pending-", ".tmp");
        try {
            try (var channel = FileChannel.open(pending, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            // No non-atomic fallback: an unsupported filesystem is an observability failure.
            Files.move(pending, destination, StandardCopyOption.ATOMIC_MOVE);
        } finally { Files.deleteIfExists(pending); }
    }

    /** Read one logical execution after restart. A missing terminal never means RUNNING/SUCCESS. */
    public static Optional<ExecutionReceipt> read(Path root, String executionId) throws IOException {
        validateId(executionId);
        Path directory = root.resolve(executionId);
        if (!Files.exists(directory)) return Optional.empty();
        ExecutionReceipt latest = null;
        for (Phase phase : Phase.values()) {
            Path file = directory.resolve(filename(phase));
            if (!Files.exists(file)) continue;
            ExecutionReceipt receipt;
            try (var input = Files.newInputStream(file)) {
                byte[] bytes = input.readNBytes(MAX_RECEIPT_BYTES + 1);
                if (bytes.length > MAX_RECEIPT_BYTES) throw new IOException("Receipt exceeds size limit");
                receipt = RunnerConfig.JSON.readValue(bytes, ExecutionReceipt.class);
            }
            validate(receipt, executionId, phase);
            if (latest != null && (!latest.startedAt().equals(receipt.startedAt())
                    || !latest.jobId().equals(receipt.jobId())
                    || !latest.commandProfileId().equals(receipt.commandProfileId())))
                throw new IOException("Conflicting execution identity");
            latest = receipt;
        }
        if (latest == null) throw new IOException("Incomplete execution without readable receipt");
        return Optional.of(latest);
    }

    /** Coalesce primary/fallback copies by execution ID. Never count lifecycle snapshots as new runs. */
    public static Optional<ExecutionReceipt> read(List<Path> roots, String executionId) throws IOException {
        ExecutionReceipt latest = null;
        for (Path root : roots) {
            var candidate = read(root, executionId);
            if (candidate.isEmpty()) continue;
            ExecutionReceipt receipt = candidate.get();
            if (latest != null) {
                if (!latest.startedAt().equals(receipt.startedAt()) || !latest.jobId().equals(receipt.jobId())
                        || !latest.commandProfileId().equals(receipt.commandProfileId())
                        || (latest.phase() == receipt.phase() && !latest.equals(receipt)))
                    throw new IOException("Conflicting execution snapshots");
            }
            if (latest == null || receipt.phase().ordinal() > latest.phase().ordinal()) latest = receipt;
        }
        return Optional.ofNullable(latest);
    }

    private static void validate(ExecutionReceipt receipt, String id, Phase phase) throws IOException {
        if (receipt == null || receipt.schemaVersion() != 1 || !id.equals(receipt.executionId())
                || receipt.phase() != phase || receipt.outcome() == null || receipt.startedAt() == null
                || receipt.createdAt() == null || !RunnerConfig.safeId(receipt.jobId())
                || !RunnerConfig.safeId(receipt.commandProfileId())) throw new IOException("Unsupported or invalid receipt");
        try {
            java.time.Instant.parse(receipt.startedAt());
            java.time.Instant.parse(receipt.createdAt());
            if (receipt.processStartedAt() != null) java.time.Instant.parse(receipt.processStartedAt());
            if (receipt.finishedAt() != null) java.time.Instant.parse(receipt.finishedAt());
        } catch (java.time.format.DateTimeParseException invalid) { throw new IOException("Invalid receipt timestamp"); }
        if (phase != Phase.TERMINAL && (receipt.outcome() != Outcome.UNKNOWN || receipt.finishedAt() != null
                || receipt.exitCode() != null || receipt.runnerExitCode() != null || receipt.durationMs() != null))
            throw new IOException("Invalid incomplete receipt");
        if ((phase == Phase.STARTED && receipt.processStartedAt() != null)
                || (phase == Phase.PROCESS_STARTED && receipt.processStartedAt() == null)) throw new IOException("Invalid start phase");
        if (phase == Phase.TERMINAL && (receipt.finishedAt() == null || receipt.durationMs() == null
                || receipt.durationMs() < 0)) throw new IOException("Invalid terminal receipt");
        if ((receipt.outcome() == Outcome.SUCCESS || receipt.outcome() == Outcome.FAILED)
                && (receipt.processStartedAt() == null || receipt.exitCode() == null
                || (receipt.outcome() == Outcome.SUCCESS) != (receipt.exitCode() == 0)
                || !receipt.exitCode().equals(receipt.runnerExitCode()))) throw new IOException("Invalid process outcome");
        if (receipt.outcome() == Outcome.START_FAILED && (receipt.processStartedAt() != null
                || receipt.exitCode() != null || receipt.processStartFailure() == null
                || receipt.runnerExitCode() == null || receipt.runnerExitCode() == 0)) throw new IOException("Invalid start failure");
    }

    static String filename(Phase phase) {
        return switch (phase) {
            case STARTED -> "00-started.json";
            case PROCESS_STARTED -> "01-process-started.json";
            case TERMINAL -> "02-terminal.json";
        };
    }

    private static void validateId(String id) {
        if (id == null || !id.matches("[a-z][a-z0-9-]{0,63}_[0-9]{1,19}_[a-f0-9-]{36}"))
            throw new IllegalArgumentException("Invalid execution ID");
    }
}
