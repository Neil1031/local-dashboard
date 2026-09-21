package io.github.neil1031.dashboard.launcher;

import javax.swing.JOptionPane;
import javax.swing.JFrame;
import javax.swing.SwingUtilities;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.CountDownLatch;
import static java.nio.file.StandardOpenOption.*;

/** Packaged --stop entry point; no configuration bootstrap or server/browser startup. */
final class WindowsStopLauncher {
    static int run(boolean quiet) {
        Path log = null;
        String message;
        int code = 0;
        try {
            Path coordination = WindowsLauncher.applicationHome(null, System.getenv("LOCALAPPDATA"));
            Files.createDirectories(coordination.resolve("logs"));
            log = coordination.resolve("logs/stop.log");
            Path app = Path.of(WindowsLauncher.class.getProtectionDomain().getCodeSource().getLocation().toURI()).getParent();
            Path java = Path.of(System.getProperty("java.home"), "bin/javaw.exe");
            try (var channel = FileChannel.open(coordination.resolve("launcher.lock"), CREATE, WRITE);
                 var lock = WindowsLauncher.acquireLock(channel, log)) {
                var access = new SafeStop.SystemAccess() {
                    public SafeStop.Target find(long pid) {
                        return ProcessHandle.of(pid).map(HandleTarget::new).orElse(null);
                    }
                    public boolean identity(SafeStop.Target target) throws Exception {
                        return WindowsProcessIdentity.matches(((HandleTarget) target).handle, java, app.resolve("dashboard.jar"));
                    }
                    public boolean ready() { return WindowsLauncher.ready(WindowsLauncher.URL); }
                    public boolean portOccupied() { return WindowsLauncher.portOccupied(); }
                };
                message = SafeStop.stop(coordination.resolve("server.pid"), log, access).message;
            }
        } catch (Exception failure) {
            code = 1;
            message = "Local Dashboard could not be safely stopped.\n" + failure.getMessage() + "\nLog: " + log;
            if (log != null) {
                try { WindowsLauncher.append(log, "STOP_ERROR type=" + failure.getClass().getSimpleName()); }
                catch (Exception ignored) { /* Still show the error to the user. */ }
            }
        }
        if (quiet) System.out.println(message);
        else showResult(message, code);
        return code;
    }

    private static void showResult(String message, int code) {
        // Give the result its own taskbar window; an ownerless modal dialog can be
        // difficult to find after the start launcher has handed focus to a browser.
        var closed = new CountDownLatch(1);
        try {
            SwingUtilities.invokeAndWait(() -> {
                var frame = new JFrame("Stop Local Dashboard");
                var pane = new JOptionPane(message, code == 0 ? JOptionPane.INFORMATION_MESSAGE
                        : JOptionPane.ERROR_MESSAGE, JOptionPane.DEFAULT_OPTION);
                frame.setContentPane(pane);
                frame.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
                frame.addWindowListener(new WindowAdapter() {
                    @Override public void windowClosed(WindowEvent event) { closed.countDown(); }
                });
                pane.addPropertyChangeListener(JOptionPane.VALUE_PROPERTY, event -> frame.dispose());
                frame.pack();
                frame.setResizable(false);
                frame.setLocationRelativeTo(null);
                frame.setVisible(true);
                frame.toFront();
            });
            closed.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception unavailable) {
            System.err.println(message);
        }
    }

    private record HandleTarget(ProcessHandle handle) implements SafeStop.Target {
        public long pid() { return handle.pid(); }
        public Instant started() { return handle.info().startInstant().orElse(null); }
        public boolean alive() { return handle.isAlive(); }
        public boolean supportsNormalTermination() { return handle.supportsNormalTermination(); }
        public void terminate(boolean force) {
            // Retain the original ProcessHandle. OpenJDK Windows checks creation time on
            // the native handle before TerminateProcess, closing the PID-reuse race.
            if (force) handle.destroyForcibly(); else handle.destroy();
        }
        public boolean awaitExit(Duration timeout) throws Exception {
            try { handle.onExit().get(timeout.toMillis(), TimeUnit.MILLISECONDS); return true; }
            catch (TimeoutException busy) { return !handle.isAlive(); }
        }
    }
}
