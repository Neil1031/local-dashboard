package io.github.neil1031.dashboard.launcher;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipFile;

/** Opt-in Windows package smoke: isolated data, no browser or selected tasks.
 * Compile/run against the packaged launcher.jar, not target/classes.
 */
public final class PortChangeSmoke {
    public static void main(String[] args) throws Exception {
        Path image = Path.of(args[0]).toAbsolutePath();
        Path home = Path.of(args[1]).toAbsolutePath();
        Path coordination = WindowsLauncher.applicationHome(null, System.getenv("LOCALAPPDATA"));
        if (!coordination.startsWith(home)) throw new IllegalArgumentException("Use an isolated LOCALAPPDATA under the test home");
        if (WindowsLauncher.PORT != 43871 || WindowsLauncher.URL.getPort() != 43871)
            throw new AssertionError("Wrong packaged launcher port");
        if (WindowsLauncher.portOccupied()) throw new IllegalStateException("Test port occupied; no process will be stopped");
        Files.createDirectories(home.resolve("config"));
        Files.createDirectories(coordination);
        Files.writeString(home.resolve("config/application.yml"), "dashboard:\n  scheduler:\n    include: []\n");
        try (var jar = new ZipFile(image.resolve("app/dashboard.jar").toFile())) {
            String config = new String(jar.getInputStream(jar.getEntry("BOOT-INF/classes/application.yml")).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            if (!config.contains("port: 43871")) throw new AssertionError("Wrong Spring default port");
        }
        Process server = new ProcessBuilder(WindowsLauncher.serverCommand(
                image.resolve("runtime/bin/javaw.exe"), image.resolve("app/dashboard.jar"), home))
                .directory(home.toFile()).redirectErrorStream(true).redirectOutput(home.resolve("server.log").toFile()).start();
        server.getOutputStream().close();
        try {
            // Only the retained child created above is recorded, using Java's exact start time.
            Files.writeString(coordination.resolve("server.pid"), server.pid() + "\n" + server.info().startInstant().orElseThrow() + "\n");
            WindowsLauncher.awaitReady(() -> WindowsLauncher.ready(WindowsLauncher.URL), server::isAlive, Duration.ofSeconds(90));
            if (!Files.isRegularFile(home.resolve("data/local-dashboard.db"))) throw new AssertionError("Isolated DB missing");
            Process stop = new ProcessBuilder(image.resolve("LocalDashboard.exe").toString(), "--stop", "--quiet")
                    .redirectErrorStream(true).redirectOutput(home.resolve("stop-output.log").toFile()).start();
            if (!stop.waitFor(40, TimeUnit.SECONDS)) throw new AssertionError("Packaged Stop timed out");
            if (stop.exitValue() != 0 || !server.waitFor(15, TimeUnit.SECONDS)) throw new AssertionError("Packaged Stop failed");
            if (WindowsLauncher.portOccupied() || Files.exists(coordination.resolve("server.pid"))) throw new AssertionError("Stop cleanup incomplete");
            String log = Files.readString(coordination.resolve("logs/stop.log"));
            if (!log.contains("IDENTITY_CONFIRMED") || !log.contains("EXITED")) throw new AssertionError("Missing safe-stop verification");
            System.out.println("{\"port\":43871,\"packagedLauncherPort\":true,\"springDefaultPort\":true,\"readiness\":true,\"isolatedDatabase\":true,\"packagedStopExit\":0,\"identityConfirmed\":true,\"pidCleaned\":true,\"portReleased\":true}");
        } finally {
            // Failure cleanup can only affect our retained child, never a searched PID.
            if (server.isAlive()) {
                server.destroy();
                if (!server.waitFor(10, TimeUnit.SECONDS)) { server.destroyForcibly(); server.waitFor(5, TimeUnit.SECONDS); }
            }
        }
    }
}
