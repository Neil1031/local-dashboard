package io.github.neil1031.dashboard.launcher;

import javax.swing.JOptionPane;
import java.awt.Desktop;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.net.URI;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import static java.nio.file.StandardOpenOption.*;

/** JDK-only bootstrap. The server runs with a stable, writable working directory. */
public final class WindowsLauncher {
    static final URI URL = URI.create("http://127.0.0.1:8080");
    private static final Duration START_TIMEOUT = Duration.ofSeconds(90);

    public static void main(String[] args) {
        Path home = null;
        try {
            home = applicationHome(System.getenv("LOCAL_DASHBOARD_HOME"), System.getenv("LOCALAPPDATA"));
            Path app = Path.of(WindowsLauncher.class.getProtectionDomain().getCodeSource().getLocation().toURI()).getParent();
            if (home.startsWith(app.getParent())) {
                throw new IOException("LOCAL_DASHBOARD_HOME must be outside the application image.");
            }
            Files.createDirectories(home.resolve("logs"));
            Files.createDirectories(home.resolve("config"));
            Path log = home.resolve("logs/launcher.log");
            // The lock covers concurrent cold starts, including instances using different data homes.
            Path lockDirectory = applicationHome(null, System.getenv("LOCALAPPDATA"));
            Files.createDirectories(lockDirectory);
            try (var channel = FileChannel.open(lockDirectory.resolve("launcher.lock"), CREATE, WRITE)) {
                var lock = channel.tryLock();
                if (lock == null) {
                    append(log, "WAIT_EXISTING_INSTANCE lock=held");
                    awaitReadyLogged(log, () -> true);
                    browse(log);
                    return;
                }
                try (lock) {
                    if (ready(URL)) {
                        append(log, "EXISTING_INSTANCE_READY " + URL);
                        browse(log);
                        return;
                    }
                    // A prior launcher may have exited while its server was still starting.
                    ProcessHandle previous = recordedServer(lockDirectory.resolve("server.pid"));
                    if (previous != null && previous.isAlive()) {
                        append(log, "WAIT_EXISTING_INSTANCE pid=" + previous.pid());
                        awaitReadyLogged(log, previous::isAlive);
                        browse(log);
                        return;
                    }
                    if (portOccupied()) throw new IOException("Port 8080 is in use by a service that is not a ready Local Dashboard. Close it and retry.");
                    Path java = Path.of(System.getProperty("java.home"), "bin", "javaw.exe");
                    Path jar = app.resolve("dashboard.jar");
                    if (!Files.isRegularFile(java) || !Files.isRegularFile(jar)) {
                        throw new IOException("Incomplete application image. Keep LocalDashboard.exe, app and runtime together.");
                    }
                    Process server = new ProcessBuilder(serverCommand(java, jar, home))
                            .directory(home.toFile()).redirectErrorStream(true)
                            .redirectOutput(ProcessBuilder.Redirect.appendTo(home.resolve("logs/server.log").toFile())).start();
                    server.getOutputStream().close();
                    try {
                        Files.writeString(lockDirectory.resolve("server.pid"), server.pid() + "\n"
                                + server.info().startInstant().orElseThrow() + "\n");
                        append(log, "Server started pid=" + server.pid() + " home=" + home);
                        awaitReadyLogged(log, server::isAlive);
                    } catch (Exception failure) {
                        // Only terminate the child created by this invocation; never an unknown listener.
                        server.destroy();
                        if (!server.waitFor(5, TimeUnit.SECONDS)) server.destroyForcibly();
                        throw failure;
                    }
                    browse(log);
                }
            }
        } catch (Exception failure) {
            String message = failure.getMessage() + "\n\nLogs/config: " + home
                    + "\nSee logs/server.log and logs/launcher.log. Browser URL: " + URL;
            if (home != null) {
                try { append(home.resolve("logs/launcher.log"), "ERROR " + failure); }
                catch (IOException ignored) { /* The dialog still reports an unwritable home. */ }
            }
            System.err.println(message);
            JOptionPane.showMessageDialog(null, message, "Local Dashboard", JOptionPane.ERROR_MESSAGE);
            System.exit(1);
        }
    }

    static Path applicationHome(String override, String localAppData) throws IOException {
        if (override != null && !override.isBlank()) {
            Path path = Path.of(override);
            if (!path.isAbsolute()) throw new IOException("LOCAL_DASHBOARD_HOME must be an absolute path.");
            return path.normalize();
        }
        if (localAppData == null || localAppData.isBlank()) throw new IOException("LOCALAPPDATA is unavailable; set LOCAL_DASHBOARD_HOME to a writable absolute directory.");
        return Path.of(localAppData, "LocalDashboard").toAbsolutePath().normalize();
    }

    static List<String> serverCommand(Path java, Path jar, Path home) {
        return List.of(java.toString(), "-jar", jar.toString(),
                "--server.address=127.0.0.1", "--server.port=8080",
                "--spring.config.location=classpath:/application.yml,optional:" + home.resolve("config/application.yml").toUri());
    }

    static boolean ready(URI base) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) base.resolve("/api/launcher/status").toURL().openConnection(Proxy.NO_PROXY);
            connection.setConnectTimeout(500);
            connection.setReadTimeout(500);
            connection.setInstanceFollowRedirects(false);
            return connection.getResponseCode() == 200 && new String(connection.getInputStream().readNBytes(128),
                    java.nio.charset.StandardCharsets.UTF_8).equals("local-dashboard:ready:v1");
        } catch (IOException unavailable) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static int awaitReady(BooleanSupplier ready, BooleanSupplier alive, Duration timeout) throws IOException, InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        int polls = 0;
        do {
            if (!alive.getAsBoolean()) throw new IOException("Dashboard exited before it became ready.");
            polls++;
            if (ready.getAsBoolean()) return polls;
            Thread.sleep(150); // Poll interval, never a substitute for readiness.
        } while (System.nanoTime() < deadline);
        throw new IOException("Dashboard did not become ready within " + timeout.toSeconds() + " seconds.");
    }

    private static void awaitReadyLogged(Path log, BooleanSupplier alive) throws IOException, InterruptedException {
        append(log, "READINESS_POLLING " + URL);
        int polls = awaitReady(() -> ready(URL), alive, START_TIMEOUT);
        append(log, "READY_CONFIRMED polls=" + polls);
    }

    private static boolean portOccupied() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 8080), 500);
            return true;
        } catch (IOException unavailable) { return false; }
    }

    private static ProcessHandle recordedServer(Path file) {
        try {
            var lines = Files.readAllLines(file);
            var handle = ProcessHandle.of(Long.parseLong(lines.get(0))).orElse(null);
            return handle != null && handle.info().startInstant().filter(Instant.parse(lines.get(1))::equals).isPresent()
                    ? handle : null;
        } catch (Exception absentOrStale) { return null; }
    }

    private static void browse(Path log) throws IOException {
        append(log, "BROWSER_OPEN_REQUESTED Desktop.browse " + URL);
        Desktop.getDesktop().browse(URL);
        append(log, "BROWSER_DISPATCHED " + URL);
    }

    private static void append(Path file, String message) throws IOException {
        Files.writeString(file, Instant.now() + " launcherPid=" + ProcessHandle.current().pid() + " "
                + "launcherParentPid=" + ProcessHandle.current().parent().map(ProcessHandle::pid).orElse(-1L) + " "
                + message + System.lineSeparator(), CREATE, APPEND);
    }
}
