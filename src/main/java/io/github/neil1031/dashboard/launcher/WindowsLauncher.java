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
import java.nio.channels.FileLock;
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
    static final int PORT = 43871;
    static final URI URL = URI.create("http://127.0.0.1:" + PORT);
    private static final Duration START_TIMEOUT = Duration.ofSeconds(90);

    public static void main(String[] args) {
        if (args.length > 0) {
            if (args[0].equals("--stop") && (args.length == 1 || (args.length == 2 && args[1].equals("--quiet")))) {
                System.exit(WindowsStopLauncher.run(args.length == 2));
            }
            throw new IllegalArgumentException("Supported arguments: --stop [--quiet]");
        }
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
            if (ConfigBootstrap.ensure(home)) append(log, "CONFIG_CREATED config/application.yml");
            // The lock covers concurrent cold starts, including instances using different data homes.
            Path lockDirectory = applicationHome(null, System.getenv("LOCALAPPDATA"));
            Files.createDirectories(lockDirectory);
            try (var channel = FileChannel.open(lockDirectory.resolve("launcher.lock"), CREATE, WRITE)) {
                try (var lock = acquireLock(channel, log)) {
                    Path java = Path.of(System.getProperty("java.home"), "bin", "javaw.exe");
                    Path jar = app.resolve("dashboard.jar");
                    if (!Files.isRegularFile(java) || !Files.isRegularFile(jar)) {
                        throw new IOException("Incomplete application image. Keep LocalDashboard.exe, app and runtime together.");
                    }
                    // A prior launcher may have exited while its server was still starting.
                    ProcessHandle previous = recordedServer(lockDirectory.resolve("server.pid"));
                    if (previous != null && previous.isAlive()) {
                        append(log, "WAIT_EXISTING_INSTANCE pid=" + previous.pid());
                        awaitReadyLogged(log, previous::isAlive);
                        confirmReadyInstance(lockDirectory.resolve("server.pid"), java, jar, home);
                        append(log, "EXISTING_INSTANCE_READY " + URL);
                        browse(log);
                        return;
                    }
                    if (portOccupied()) throw new IOException("Port " + PORT + " is in use by a service that is not a ready Local Dashboard. Close it and retry.");
                    Process server = new ProcessBuilder(serverCommand(java, jar, home))
                            .directory(home.toFile()).redirectErrorStream(true)
                            .redirectOutput(ProcessBuilder.Redirect.appendTo(home.resolve("logs/server.log").toFile())).start();
                    server.getOutputStream().close();
                    try {
                        Files.writeString(lockDirectory.resolve("server.pid"), server.pid() + "\n"
                                + server.info().startInstant().orElseThrow() + "\n");
                        append(log, "Server started pid=" + server.pid() + " home=" + home);
                        awaitReadyLogged(log, server::isAlive);
                        confirmReadyInstance(lockDirectory.resolve("server.pid"), java, jar, home);
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
                "--server.address=127.0.0.1", "--server.port=" + PORT,
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

    static boolean portOccupied() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", PORT), 500);
            return true;
        } catch (IOException unavailable) { return false; }
    }

    static ProcessHandle recordedServer(Path file) throws IOException {
        if (!Files.exists(file)) return null;
        try {
            var lines = Files.readAllLines(file);
            if (lines.size() != 2) throw new IllegalArgumentException("Invalid record");
            var handle = ProcessHandle.of(Long.parseLong(lines.get(0))).orElse(null);
            if (handle == null || !handle.isAlive()) return null;
            if (handle.info().startInstant().filter(Instant.parse(lines.get(1))::equals).isEmpty())
                throw new IOException("Recorded server start time does not match; refusing reuse.");
            return handle;
        } catch (RuntimeException invalid) { throw new IOException("Invalid server.pid; refusing reuse.", invalid); }
    }

    static void confirmReadyInstance(Path file, Path java, Path jar, Path home) throws Exception {
        String record = Files.readString(file);
        ProcessHandle handle = recordedServer(file);
        if (handle == null || !WindowsProcessIdentity.matches(handle, java, jar, home) || !ready(URL)
                || !record.equals(Files.readString(file)) || !handle.isAlive()
                || handle.info().startInstant().filter(Instant.parse(record.lines().toList().get(1))::equals).isEmpty()
                || !WindowsProcessIdentity.matches(handle, java, jar, home))
            throw new IOException("Ready listener is not the recorded instance from this image and data home; refusing reuse.");
    }

    private static void browse(Path log) throws IOException {
        append(log, "BROWSER_OPEN_REQUESTED Desktop.browse " + URL);
        Desktop.getDesktop().browse(URL);
        append(log, "BROWSER_DISPATCHED " + URL);
    }

    static FileLock acquireLock(FileChannel channel, Path log) throws IOException, InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(120).toNanos();
        var lock = channel.tryLock();
        if (lock != null) return lock;
        append(log, "WAIT_EXISTING_INSTANCE lock=held");
        do {
            Thread.sleep(150);
            lock = channel.tryLock();
            if (lock != null) return lock;
        } while (System.nanoTime() < deadline);
        throw new IOException("Another Dashboard start/stop operation is still busy. Please retry.");
    }

    static void append(Path file, String message) throws IOException {
        Files.writeString(file, Instant.now() + " launcherPid=" + ProcessHandle.current().pid() + " "
                + "launcherParentPid=" + ProcessHandle.current().parent().map(ProcessHandle::pid).orElse(-1L) + " "
                + message + System.lineSeparator(), CREATE, APPEND);
    }
}
