package io.github.neil1031.dashboard.runner;

import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** Trusted local configuration only. Never bind this type to a web request. */
public record RunnerConfig(int schemaVersion, String receiptDirectory, String fallbackDirectory,
                           Map<String, Profile> profiles) {
    static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .withCoercionConfig(LogicalType.Textual, coercion -> coercion
                    .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
            .disable(com.fasterxml.jackson.databind.MapperFeature.ALLOW_COERCION_OF_SCALARS).build();
    private static final int MAX_CONFIG_BYTES = 1024 * 1024;

    public record Profile(String jobId, String executable, List<String> args, String workingDirectory) {
        public Profile {
            if (!safeId(jobId) || executable == null || executable.isBlank() || executable.indexOf('\0') >= 0
                    || args == null || args.size() > 256 || workingDirectory == null || workingDirectory.isBlank())
                throw new IllegalArgumentException("Invalid runner profile");
            if (!Path.of(executable).isAbsolute() || !Path.of(workingDirectory).isAbsolute())
                throw new IllegalArgumentException("Executable and working directory must be absolute");
            for (String arg : args) if (arg == null || arg.length() > 32768 || arg.indexOf('\0') >= 0)
                throw new IllegalArgumentException("Invalid runner argument");
            // The Windows JDK treats surrounding quotes as syntax, not literal argv characters.
            if (System.getProperty("os.name").startsWith("Windows")) {
                if (!executable.toLowerCase(java.util.Locale.ROOT).endsWith(".exe"))
                    throw new IllegalArgumentException("Use an explicit executable for scripts");
                for (String arg : args) if (arg.length() >= 2 && arg.startsWith("\"") && arg.endsWith("\""))
                    throw new IllegalArgumentException("Do not wrap Windows arguments in quotes");
            }
            args = List.copyOf(args);
        }
        // The default record toString would disclose arguments in diagnostics/debug logging.
        @Override public String toString() { return "RunnerProfile[redacted]"; }
    }

    public RunnerConfig {
        if (schemaVersion != 1 || receiptDirectory == null || receiptDirectory.isBlank()
                || profiles == null || profiles.isEmpty() || profiles.size() > 256)
            throw new IllegalArgumentException("Invalid runner configuration");
        for (var entry : profiles.entrySet()) if (!safeId(entry.getKey()) || entry.getValue() == null)
            throw new IllegalArgumentException("Invalid runner profile ID");
        profiles = Map.copyOf(profiles);
    }

    static boolean safeId(String id) { return id != null && id.matches("[a-z][a-z0-9-]{0,63}"); }

    public static RunnerConfig load(Path file) throws IOException {
        try (var input = Files.newInputStream(file)) {
            byte[] bytes = input.readNBytes(MAX_CONFIG_BYTES + 1);
            if (bytes.length > MAX_CONFIG_BYTES) throw new IOException("Runner config exceeds size limit");
            return JSON.readValue(bytes, RunnerConfig.class);
        }
    }

    public Profile profile(String id) {
        if (!safeId(id) || !profiles.containsKey(id)) throw new IllegalArgumentException("Unknown profile");
        return profiles.get(id);
    }

    @Override public String toString() { return "RunnerConfig[redacted]"; }
}
