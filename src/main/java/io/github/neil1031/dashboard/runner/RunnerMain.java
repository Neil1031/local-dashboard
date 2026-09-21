package io.github.neil1031.dashboard.runner;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;
import static io.github.neil1031.dashboard.runner.ExecutionReceipt.*;

/** Standalone one-invocation process. No Spring context, listener, scheduler access or HTTP. */
public final class RunnerMain {
    public static final int CONFIG_ERROR = 64;
    public static final int START_FAILED = 127;

    public static void main(String[] args) { System.exit(run(args, System.err)); }

    static int run(String[] args, PrintStream diagnostics) {
        // OpenJDK's legacy Windows mode silently loses embedded quotes; use its strict .exe argv encoding.
        // This entry point runs in a dedicated JVM, never in the dashboard service.
        System.setProperty("jdk.lang.Process.allowAmbiguousCommands", "false");
        RunnerConfig config;
        RunnerConfig.Profile profile;
        Path configFile;
        try {
            if (args.length != 3 || !args[0].equals("run")) throw new IllegalArgumentException();
            configFile = Path.of(args[1]).toAbsolutePath().normalize();
            config = RunnerConfig.load(configFile);
            profile = config.profile(args[2]);
        } catch (Exception failure) {
            diagnostics.println("RUNNER_CONFIG_INVALID: use run <trusted-config.json> <profile-id>; review local configuration.");
            return CONFIG_ERROR; // Command identity is not established; do not guess.
        }

        Instant started = Instant.now();
        long clock = System.nanoTime();
        String id = profile.jobId() + "_" + started.toEpochMilli() + "_" + UUID.randomUUID();
        var storage = new Storage(config, configFile.getParent(), id, diagnostics);
        storage.write(receipt(id, profile.jobId(), args[2], Phase.STARTED, Outcome.UNKNOWN,
                started, null, null, null, null, null, null, null, null));

        var command = new ArrayList<String>();
        command.add(profile.executable());
        command.addAll(profile.args());
        Process process;
        try {
            process = new ProcessBuilder(command).directory(Path.of(profile.workingDirectory()).toFile()).start();
        } catch (IOException | SecurityException | IllegalArgumentException failure) {
            storage.write(receipt(id, profile.jobId(), args[2], Phase.TERMINAL, Outcome.START_FAILED,
                    started, null, Instant.now(), elapsed(clock), null, START_FAILED,
                    failure instanceof SecurityException ? "START_PERMISSION_DENIED" : "PROCESS_START_FAILED",
                    null, null));
            diagnostics.println("RUNNER_START_FAILED execution=" + id);
            return START_FAILED;
        }

        Instant processStarted = Instant.now(); // Observation immediately after ProcessBuilder.start returns.
        OutputDrain stdout = new OutputDrain(process.getInputStream());
        OutputDrain stderr = new OutputDrain(process.getErrorStream());
        Thread out = Thread.ofPlatform().daemon().name("runner-stdout").start(stdout);
        Thread err = Thread.ofPlatform().daemon().name("runner-stderr").start(stderr);
        try { process.getOutputStream().close(); } catch (IOException ignored) { /* Noninteractive stdin = EOF. */ }
        storage.write(receipt(id, profile.jobId(), args[2], Phase.PROCESS_STARTED, Outcome.UNKNOWN,
                started, processStarted, null, null, null, null, null, null, null));

        boolean interrupted = false;
        int code;
        for (;;) {
            try { code = process.waitFor(); break; }
            catch (InterruptedException ignored) { interrupted = true; } // No implicit kill policy.
        }
        Instant finished = Instant.now();
        long duration = elapsed(clock);
        // This bounds output finalization only, NOT child execution. Descendants are never killed.
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        for (Thread reader : new Thread[]{out, err}) {
            while (reader.isAlive() && System.nanoTime() < deadline) {
                try { reader.join(Math.max(1, java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()))); }
                catch (InterruptedException ignored) { interrupted = true; }
            }
        }
        storage.write(receipt(id, profile.jobId(), args[2], Phase.TERMINAL,
                code == 0 ? Outcome.SUCCESS : Outcome.FAILED, started, processStarted, finished, duration,
                code, code, null, stdout.snapshot(), stderr.snapshot()));
        if (interrupted) Thread.currentThread().interrupt();
        return code;
    }

    private static long elapsed(long start) { return Math.max(0, (System.nanoTime() - start) / 1_000_000); }

    private static ExecutionReceipt receipt(String id, String job, String profile, Phase phase, Outcome outcome,
                                             Instant started, Instant processStarted, Instant finished, Long duration,
                                             Integer exit, Integer runnerExit, String failure, Output stdout, Output stderr) {
        return new ExecutionReceipt(1, id, job, profile, phase, outcome, started.toString(),
                processStarted == null ? null : processStarted.toString(), finished == null ? null : finished.toString(),
                duration, exit, runnerExit, failure, null, stdout, stderr, Instant.now().toString());
    }

    /** Primary failure switches to an independent spool; each fallback snapshot is self-contained. */
    private static final class Storage {
        private final RunnerConfig config;
        private final Path base;
        private final String id;
        private final PrintStream diagnostics;
        private ReceiptFiles files;
        private boolean fallback;
        private boolean unavailable;

        Storage(RunnerConfig config, Path base, String id, PrintStream diagnostics) {
            this.config = config; this.base = base; this.id = id; this.diagnostics = diagnostics;
        }

        void write(ExecutionReceipt receipt) {
            if (unavailable) return;
            try {
                if (files == null) files = ReceiptFiles.claim(base.resolve(config.receiptDirectory()), id);
                files.write(receipt);
                return;
            } catch (Exception failure) {
                if (failure instanceof ReceiptFiles.IdentityCollision) {
                    unavailable = true;
                    diagnostics.println("RUNNER_IDENTITY_COLLISION execution=" + id + "; no existing receipt will be adopted.");
                    return; // Do not reuse the colliding identity in another spool either.
                }
                if (!fallback) diagnostics.println("RUNNER_PRIMARY_UNAVAILABLE execution=" + id);
            }
            try {
                if (!fallback) {
                    fallback = true;
                    Path root = config.fallbackDirectory() == null
                            ? Path.of(System.getProperty("user.home"), ".local-dashboard", "runner-fallback")
                            : base.resolve(config.fallbackDirectory());
                    files = ReceiptFiles.claim(root, id);
                    diagnostics.println("RUNNER_FALLBACK_ACTIVE execution=" + id);
                }
                files.write(receipt);
            } catch (Exception failure) {
                unavailable = true;
                diagnostics.println("RUNNER_RECEIPT_UNAVAILABLE execution=" + id + "; child execution remains enabled.");
            }
        }
    }
}
