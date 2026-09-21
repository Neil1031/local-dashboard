package io.github.neil1031.dashboard.runner;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static io.github.neil1031.dashboard.runner.ExecutionReceipt.*;

@Timeout(45)
class RunnerTest {
    @TempDir Path temp;
    final ByteArrayOutputStream diagnostics = new ByteArrayOutputStream();
    final String java = Path.of(System.getProperty("java.home"), "bin",
            System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();

    RunnerConfig.Profile fixture(String... args) {
        var command = new ArrayList<>(List.of("-cp", Path.of("target/test-classes").toAbsolutePath().toString(),
                RunnerFixture.class.getName()));
        command.addAll(List.of(args));
        return new RunnerConfig.Profile("fixture-job", java, command, temp.toString());
    }
    Path config(RunnerConfig.Profile profile) throws Exception { return config(profile, "receipts", "fallback"); }
    Path config(RunnerConfig.Profile profile, String primary, String fallback) throws Exception {
        Path file = temp.resolve("runner.json");
        Files.write(file, RunnerConfig.JSON.writeValueAsBytes(new RunnerConfig(1, primary, fallback, Map.of("fixture", profile))));
        return file;
    }
    int run(Path config) { return RunnerMain.run(new String[]{"run", config.toString(), "fixture"}, new PrintStream(diagnostics)); }
    List<Path> executions(String root) throws Exception {
        try (var files = Files.list(temp.resolve(root))) { return files.filter(Files::isDirectory).toList(); }
    }
    ExecutionReceipt saved(String root) throws Exception {
        var dirs = executions(root);
        assertThat(dirs).hasSize(1);
        return ReceiptFiles.read(temp.resolve(root), dirs.getFirst().getFileName().toString()).orElseThrow();
    }
    Process cli(Path config, String id) throws Exception {
        return new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"), RunnerMain.class.getName(),
                "run", config.toString(), id).redirectError(temp.resolve("cli-" + UUID.randomUUID() + ".log").toFile())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
    }

    @ParameterizedTest @ValueSource(ints = {0, 1, 7, 127, 255, 3010, -1})
    void actualChildExitPropagatesAndReceiptSurvivesNewReader(int code) throws Exception {
        assertThat(run(config(fixture("exit", Integer.toString(code))))).isEqualTo(code);
        var receipt = saved("receipts");
        assertThat(receipt.outcome()).isEqualTo(code == 0 ? Outcome.SUCCESS : Outcome.FAILED);
        assertThat(receipt.exitCode()).isEqualTo(code);
        assertThat(receipt.runnerExitCode()).isEqualTo(code);
        assertThat(receipt.completionState()).isEqualTo("TERMINAL");
        assertThat(receipt.durationMs()).isNotNegative();
        assertThat(Instant.parse(receipt.finishedAt())).isAfterOrEqualTo(Instant.parse(receipt.processStartedAt()));
        assertThat(Instant.parse(receipt.processStartedAt())).isAfterOrEqualTo(Instant.parse(receipt.startedAt()));
        assertThat(receipt.processStartFailure()).isNull();
        try (var files = Files.list(executions("receipts").getFirst())) {
            assertThat(files.map(p -> p.getFileName().toString()).toList())
                    .containsExactlyInAnyOrder("00-started.json", "01-process-started.json", "02-terminal.json");
        }
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).isEmpty();
    }

    @ParameterizedTest @ValueSource(strings = {"executable", "directory", "not-executable"})
    void startFailuresNeverPretendChildRan(String mode) throws Exception {
        var valid = fixture("exit", "0");
        Path text = Files.writeString(temp.resolve("not-executable.exe"), "not a program");
        var profile = new RunnerConfig.Profile(valid.jobId(), mode.equals("executable") ? temp.resolve("absent.exe").toString()
                : mode.equals("not-executable") ? text.toString() : valid.executable(), valid.args(),
                mode.equals("directory") ? temp.resolve("absent-directory").toString() : valid.workingDirectory());
        assertThat(run(config(profile))).isEqualTo(127);
        var receipt = saved("receipts");
        assertThat(receipt.outcome()).isEqualTo(Outcome.START_FAILED);
        assertThat(receipt.processStartedAt()).isNull();
        assertThat(receipt.exitCode()).isNull();
        assertThat(receipt.processStartFailure()).isEqualTo("PROCESS_START_FAILED");
        assertThat(receipt.durationMs()).isNotNegative();
        assertThat(receipt.finishedAt()).isNotNull();
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).doesNotContain(temp.toString());
    }

    @Test void unicodePathsAndLiteralArgumentsWorkWithoutPersistingOutputOrSecrets() throws Exception {
        Path working = Files.createDirectory(temp.resolve("中文 路徑 & literal"));
        var source = fixture("unicode", "參數 空白 & ; $(test) \"literal\"", "secret-token-do-not-record");
        var profile = new RunnerConfig.Profile(source.jobId(), source.executable(), source.args(), working.toString());
        assertThat(run(config(profile))).isZero();
        var receipt = saved("receipts");
        assertThat(Files.readString(working.resolve("輸出 文件.txt"))).isEqualTo("中文 😀");
        assertThat(receipt.stdout().observedBytes()).isEqualTo("中文 😀".getBytes(StandardCharsets.UTF_8).length);
        assertThat(receipt.stderr().observedBytes()).isEqualTo("錯誤 測試".getBytes(StandardCharsets.UTF_8).length);
        try (var files = Files.walk(temp.resolve("receipts"))) {
            for (Path file : files.filter(Files::isRegularFile).toList())
                assertThat(Files.readString(file)).doesNotContain("secret-token-do-not-record", working.toString(), "中文", "args", "executable");
        }
        assertThat(source.toString()).doesNotContain("secret-token");
    }

    @ParameterizedTest @ValueSource(ints = {65536, 65537, 8388608})
    void bothStreamsDrainBeyondHardSampleLimitWithoutDeadlock(int bytes) throws Exception {
        assertThat(run(config(fixture("flood", Integer.toString(bytes))))).isZero();
        var receipt = saved("receipts");
        for (Output output : List.of(receipt.stdout(), receipt.stderr())) {
            assertThat(output.observedBytes()).isEqualTo(bytes);
            assertThat(output.sampledBytes()).isEqualTo(Math.min(bytes, 65536));
            assertThat(output.truncated()).isEqualTo(bytes > 65536);
            assertThat(output.complete()).isTrue();
            assertThat(output.contentStored()).isFalse();
        }
        try (var files = Files.walk(temp.resolve("receipts"))) {
            for (Path file : files.filter(Files::isRegularFile).toList()) assertThat(Files.size(file)).isLessThan(16384);
        }
    }

    @ParameterizedTest @ValueSource(ints = {0, 7})
    void unavailablePrimaryUsesFallbackAndPreservesActualSideEffectAndExit(int code) throws Exception {
        Files.writeString(temp.resolve("blocked"), "file prevents directory creation");
        Path marker = temp.resolve("marker");
        assertThat(run(config(fixture("marker", marker.toString(), Integer.toString(code)), "blocked/receipts", "fallback"))).isEqualTo(code);
        assertThat(Files.readString(marker)).isEqualTo("child-executed");
        assertThat(saved("fallback").exitCode()).isEqualTo(code);
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).contains("RUNNER_PRIMARY_UNAVAILABLE", "RUNNER_FALLBACK_ACTIVE");
    }

    @ParameterizedTest @ValueSource(ints = {0, 7})
    void firstPublicationFailureAfterRealClaimStillExecutesAndFallbackCanBeRead(int code) throws Exception {
        Path primary = temp.resolve("receipts"), fallback = temp.resolve("fallback"), marker = temp.resolve("marker");
        Path file = config(fixture("marker", marker.toString(), Integer.toString(code)));
        var failures = new java.util.concurrent.atomic.AtomicInteger();
        // Inject only publication failure; directory claims, fallback writes and child execution are real.
        // No production fault-injection switch or runner/storage refactor is needed.
        try (var fault = mockStatic(ReceiptFiles.class, invocation -> {
            Object result = invocation.callRealMethod();
            if (invocation.getMethod().getName().equals("claim") && primary.equals(invocation.getArgument(0))) {
                ReceiptFiles claimed = spy((ReceiptFiles) result);
                doAnswer(write -> {
                    ExecutionReceipt receipt = write.getArgument(0);
                    assertThat(receipt.phase()).isEqualTo(Phase.STARTED);
                    assertThat(primary.resolve(receipt.executionId())).isDirectory();
                    failures.incrementAndGet();
                    throw new java.io.IOException("Injected first publication failure");
                }).when(claimed).write(any(ExecutionReceipt.class));
                return claimed;
            }
            return result;
        })) {
            assertThat(run(file)).isEqualTo(code);
        }
        assertThat(failures.get()).isEqualTo(1);
        assertThat(Files.readString(marker)).isEqualTo("child-executed");
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).contains("RUNNER_PRIMARY_UNAVAILABLE", "RUNNER_FALLBACK_ACTIVE");
        Path emptyClaim = executions("receipts").getFirst();
        try (var files = Files.list(emptyClaim)) { assertThat(files.toList()).isEmpty(); }
        var terminal = saved("fallback");
        String id = emptyClaim.getFileName().toString();
        assertThat(terminal.executionId()).isEqualTo(id);
        assertThat(terminal.exitCode()).isEqualTo(code);
        assertThat(terminal.phase()).isEqualTo(Phase.TERMINAL);
        assertThat(ReceiptFiles.read(List.of(primary, fallback), id)).contains(terminal);
    }

    @Test void bothStoresUnavailableStillExecutesAndLeavesSafeDiagnostic() throws Exception {
        Files.writeString(temp.resolve("blocked"), "file");
        Path marker = temp.resolve("marker");
        assertThat(run(config(fixture("marker", marker.toString(), "0"), "blocked/one", "blocked/two"))).isZero();
        assertThat(marker).exists();
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).contains("RUNNER_RECEIPT_UNAVAILABLE")
                .doesNotContain(temp.toString(), "marker");
    }

    @Test void independentCliProcessesAndRepeatedProfileHaveUniqueReceiptsWithoutSpring() throws Exception {
        Path file = config(fixture("exit", "7"));
        Process first = cli(file, "fixture"), second = cli(file, "fixture");
        for (Process process : List.of(first, second)) {
            assertThat(process.waitFor(15, TimeUnit.SECONDS)).isTrue();
            assertThat(process.exitValue()).isEqualTo(7);
        }
        assertThat(run(file)).isEqualTo(7);
        assertThat(executions("receipts")).hasSize(3);
        for (Path dir : executions("receipts")) assertThat(ReceiptFiles.read(dir.getParent(), dir.getFileName().toString()).orElseThrow().exitCode()).isEqualTo(7);
        assertThat(temp.resolve("local-dashboard.db")).doesNotExist();
    }

    @Test void stdinIsClosedInsteadOfWaitingForConsoleInput() throws Exception {
        assertThat(run(config(fixture("stdin")))).isZero();
    }

    @ParameterizedTest @ValueSource(strings = {"fixture & whoami", "../fixture", "fixture;exit 0", "missing", "$(whoami)", "FIXTURE"})
    void profileSelectorCannotBecomeACommand(String input) throws Exception {
        Path marker = temp.resolve("must-not-exist");
        Path file = config(fixture("marker", marker.toString(), "0"));
        assertThat(RunnerMain.run(new String[]{"run", file.toString(), input}, new PrintStream(diagnostics))).isEqualTo(64);
        assertThat(marker).doesNotExist();
        assertThat(temp.resolve("receipts")).doesNotExist();
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).doesNotContain(input);
    }

    @ParameterizedTest @ValueSource(strings = {"version", "unknown-field", "duplicate", "trailing", "relative-exe", "relative-cwd", "null-args", "coercion", "large"})
    void invalidConfigRejectedWithoutLeakingSourceOrStartingChild(String kind) throws Exception {
        Path marker = temp.resolve("must-not-exist");
        Path file = config(fixture("marker", marker.toString(), "0"));
        var node = RunnerConfig.JSON.readTree(file.toFile());
        var root = (com.fasterxml.jackson.databind.node.ObjectNode) node;
        var profile = (com.fasterxml.jackson.databind.node.ObjectNode) root.path("profiles").path("fixture");
        switch (kind) {
            case "version" -> root.put("schemaVersion", 2);
            case "unknown-field" -> root.put("secret-token", "do-not-log");
            case "relative-exe" -> profile.put("executable", "java");
            case "relative-cwd" -> profile.put("workingDirectory", ".");
            case "null-args" -> profile.putNull("args");
            case "coercion" -> profile.putArray("args").add(123);
        }
        String json = root.toString();
        if (kind.equals("duplicate")) json = json.replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1");
        if (kind.equals("trailing")) json += " {}";
        if (kind.equals("large")) json += " ".repeat(1024 * 1024);
        Files.writeString(file, json);
        assertThat(run(file)).isEqualTo(64);
        assertThat(marker).doesNotExist();
        assertThat(diagnostics.toString(StandardCharsets.UTF_8)).doesNotContain("secret-token", "do-not-log", temp.toString());
    }
}
