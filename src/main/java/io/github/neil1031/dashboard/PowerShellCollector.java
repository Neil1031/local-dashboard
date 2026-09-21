package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

@Component
public class PowerShellCollector implements SchedulerCollector {
    private static final int OUTPUT_LIMIT = 8 * 1024 * 1024;
    private final SchedulerProperties properties;
    private final ObjectMapper mapper;

    public PowerShellCollector(SchedulerProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    @Override
    public synchronized JsonNode collect() {
        if (!System.getProperty("os.name").startsWith("Windows")) {
            throw new CollectionException("UNSUPPORTED_PLATFORM", "Windows ScheduledTasks is required.");
        }
        try (var script = new ClassPathResource("collect-scheduler.ps1").getInputStream()) {
            String encoded = Base64.getEncoder().encodeToString(new String(script.readAllBytes(), StandardCharsets.UTF_8)
                    .getBytes(StandardCharsets.UTF_16LE));
            // Only the bundled script is executable. Configuration is JSON on stdin, never command text.
            String output = run(List.of("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive",
                            "-EncodedCommand", encoded), mapper.writeValueAsString(Map.of(
                            "include", properties.include(), "exclude", properties.exclude())),
                    Duration.ofSeconds(properties.timeoutSeconds()));
            return mapper.readTree(output);
        } catch (IOException e) {
            throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Cannot read scheduler JSON or bundled script.");
        }
    }

    static String run(List<String> command, String input, Duration timeout) {
        Process process = null;
        try (var readers = Executors.newVirtualThreadPerTaskExecutor()) {
            try {
                process = new ProcessBuilder(command).start();
                Process running = process;
                Future<String> stdout = readers.submit(() -> readBounded(running.getInputStream()));
                Future<String> stderr = readers.submit(() -> readBounded(running.getErrorStream()));
                try (var stdin = process.getOutputStream()) { stdin.write(input.getBytes(StandardCharsets.UTF_8)); }
                if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                    throw new CollectionException("COLLECTOR_TIMEOUT", "Scheduler collection timed out.");
                }
                String output = stdout.get(5, TimeUnit.SECONDS);
                String error = stderr.get(5, TimeUnit.SECONDS);
                if (process.exitValue() != 0 || !error.isBlank()) {
                    throw new CollectionException("COLLECTOR_FAILED", "PowerShell collection failed; check ScheduledTasks availability and read permissions.");
                }
                return output.strip().replaceFirst("^\uFEFF", "");
            } catch (IOException e) {
                throw new CollectionException("COLLECTOR_UNAVAILABLE", "Cannot start PowerShell collector.");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new CollectionException("COLLECTOR_INTERRUPTED", "Scheduler collection interrupted.");
            } catch (ExecutionException | TimeoutException e) {
                throw new CollectionException("INVALID_COLLECTOR_OUTPUT", "Collector output exceeded limits or could not be read.");
            } finally {
                if (process != null) {
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    if (process.isAlive()) process.destroyForcibly();
                    try { process.getInputStream().close(); process.getErrorStream().close(); }
                    catch (IOException ignored) { /* Process already terminated. */ }
                }
            }
        }
    }

    private static String readBounded(InputStream stream) throws IOException {
        byte[] bytes = stream.readNBytes(OUTPUT_LIMIT + 1);
        if (bytes.length > OUTPUT_LIMIT) throw new IOException("Collector output too large");
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
