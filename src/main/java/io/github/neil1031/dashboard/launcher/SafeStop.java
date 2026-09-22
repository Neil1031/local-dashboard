package io.github.neil1031.dashboard.launcher;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

/** Stop policy. Caller must hold the same OS lock as the start launcher. */
final class SafeStop {
    interface Target {
        long pid();
        Instant started();
        boolean alive();
        boolean supportsNormalTermination();
        void terminate(boolean force);
        boolean awaitExit(Duration timeout) throws Exception;
    }

    interface SystemAccess {
        Target find(long pid);
        // Exact bundled executable/JAR, command shape AND ownership of the loopback listener.
        boolean identity(Target target) throws Exception;
        boolean ready();
        boolean portOccupied();
    }

    enum Result {
        STOPPED("Local Dashboard has stopped."),
        NOT_RUNNING("Local Dashboard is not running.");
        final String message;
        Result(String message) { this.message = message; }
    }

    static Result stop(Path file, Path log, SystemAccess system) throws Exception {
        WindowsLauncher.append(log, "STOP_REQUESTED");
        if (!Files.exists(file)) {
            if (system.portOccupied()) throw refused(log, -1, "No recorded server; port " + WindowsLauncher.PORT + " is occupied.");
            return Result.NOT_RUNNING;
        }
        String record = Files.readString(file);
        long pid;
        Instant started;
        try {
            var lines = record.lines().toList();
            if (lines.size() != 2) throw new IllegalArgumentException();
            pid = Long.parseLong(lines.get(0));
            started = Instant.parse(lines.get(1));
            if (pid <= 0 || pid == ProcessHandle.current().pid()) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) {
            throw refused(log, -1, "Invalid server.pid. No process was stopped.");
        }
        Target target = system.find(pid);
        if (target == null || !target.alive()) {
            cleanup(file, record, log, pid, "process_absent");
            if (system.portOccupied()) throw refused(log, pid, "Recorded server is absent; port " + WindowsLauncher.PORT + " belongs to an unverified service.");
            return Result.NOT_RUNNING;
        }
        if (target.started() != null && !started.equals(target.started())) {
            cleanup(file, record, log, pid, "start_time_mismatch");
            throw refused(log, pid, "Recorded PID was reused. No process was stopped.");
        }
        confirm(file, record, log, started, target, system);
        boolean normal = target.supportsNormalTermination();
        WindowsLauncher.append(log, "GRACEFUL_STOP_REQUESTED pid=" + pid + " supported=" + normal
                + " method=ProcessHandle.destroy");
        if (!normal) {
            // On Windows destroy() itself is forcible. Recheck before that operation too.
            confirm(file, record, log, started, target, system);
            WindowsLauncher.append(log, "FORCED_TERMINATION pid=" + pid + " reason=normal_termination_unsupported");
        }
        target.terminate(false);
        if (!target.awaitExit(Duration.ofSeconds(10))) {
            confirm(file, record, log, started, target, system);
            WindowsLauncher.append(log, "FORCED_TERMINATION pid=" + pid + " reason=normal_termination_timeout");
            target.terminate(true);
            if (!target.awaitExit(Duration.ofSeconds(5))) throw new IOException("Dashboard did not exit. See stop.log.");
        }
        WindowsLauncher.append(log, "EXITED pid=" + pid);
        cleanup(file, record, log, pid, "exited");
        if (system.portOccupied()) throw new IOException("Dashboard exited, but port " + WindowsLauncher.PORT + " is still occupied. No other process was stopped.");
        return Result.STOPPED;
    }

    private static void confirm(Path file, String record, Path log, Instant started,
                                Target target, SystemAccess system) throws Exception {
        boolean confirmed;
        try {
            confirmed = record.equals(Files.readString(file)) && target.alive() && started.equals(target.started())
                    && system.identity(target) && system.ready()
                    && target.alive() && started.equals(target.started());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw refused(log, target.pid(), "Identity verification was interrupted. No further termination was requested.");
        } catch (Exception unavailable) {
            // Probe errors can contain command-line details. Do not log their contents.
            throw refused(log, target.pid(), "Identity information is unavailable. No further termination was requested.");
        }
        if (!confirmed) {
            throw refused(log, target.pid(), "Server identity could not be confirmed. No further termination was requested.");
        }
        WindowsLauncher.append(log, "IDENTITY_CONFIRMED pid=" + target.pid());
    }

    private static IOException refused(Path log, long pid, String reason) throws IOException {
        WindowsLauncher.append(log, "REFUSED_IDENTITY_MISMATCH pid=" + pid + " " + reason);
        return new IOException(reason);
    }

    private static void cleanup(Path file, String record, Path log, long pid, String reason) throws IOException {
        if (Files.exists(file) && record.equals(Files.readString(file))) {
            Files.delete(file);
            WindowsLauncher.append(log, "PID_CLEANUP pid=" + pid + " reason=" + reason
                    + (reason.equals("exited") ? "" : " STALE_PID_CLEANUP"));
        }
    }
}
