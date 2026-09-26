package io.github.neil1031.dashboard.runner;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.AccessDeniedException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static io.github.neil1031.dashboard.runner.ExecutionReceipt.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mockStatic;

class RunnerReceiptServiceTest {
    @TempDir Path temp;
    private static final String TASK = "\\AIStockHunter-Accumulation-Weekly-Check";
    private static final String PROFILE = "aistockhunter-accumulation-weekly";
    private static final String START = "2026-09-22T02:45:00Z";

    private Path config() throws Exception {
        Path file = temp.resolve("runner.json");
        RunnerConfig config = new RunnerConfig(1, "receipts", "fallback", Map.of(PROFILE,
                new RunnerConfig.Profile(PROFILE, temp.resolve("child.exe").toString(), List.of(), temp.toString())));
        Files.writeString(file, RunnerConfig.JSON.writeValueAsString(config));
        return file;
    }
    private RunnerReceiptService service(Path config) {
        return new RunnerReceiptService(new RunnerReceiptProperties(config.toString(),
                List.of(new RunnerReceiptProperties.Mapping(TASK, PROFILE))));
    }
    private String id(long millis) { return PROFILE + "_" + millis + "_" + UUID.randomUUID(); }
    private ExecutionReceipt receipt(String id, Phase phase, Outcome outcome, int code) {
        return new ExecutionReceipt(1, id, PROFILE, PROFILE, phase, outcome, START,
                phase == Phase.STARTED || outcome == Outcome.START_FAILED ? null : "2026-09-22T02:45:01Z",
                phase == Phase.TERMINAL ? "2026-09-22T02:45:03Z" : null,
                phase == Phase.TERMINAL ? 3000L : null,
                phase == Phase.TERMINAL && outcome != Outcome.START_FAILED ? code : null,
                phase == Phase.TERMINAL ? outcome == Outcome.START_FAILED ? 127 : code : null,
                outcome == Outcome.START_FAILED ? "PROCESS_START_FAILED" : null, null, null, null, START);
    }
    private void write(Path root, String id, ExecutionReceipt... receipts) throws Exception {
        ReceiptFiles store = ReceiptFiles.claim(root, id);
        for (ExecutionReceipt receipt : receipts) store.write(receipt);
    }
    private RunnerReceiptService.JobExecutions job(RunnerReceiptService service) {
        return service.recent().jobs().getFirst();
    }

    @Test void completeAndNonzeroChildExitRemainRunnerEvidence() throws Exception {
        Path config = config(); String id = id(1);
        write(temp.resolve("receipts"), id, receipt(id, Phase.STARTED, Outcome.UNKNOWN, 0),
                receipt(id, Phase.PROCESS_STARTED, Outcome.UNKNOWN, 0), receipt(id, Phase.TERMINAL, Outcome.FAILED, 1));
        var execution = job(service(config)).executions().getFirst();
        assertThat(execution.receiptCompleteness()).isEqualTo("COMPLETE");
        assertThat(execution.childExitCode()).isEqualTo(1);
        assertThat(execution.childStarted()).isTrue();
        assertThat(execution.runnerExitCode()).isEqualTo(1);
        assertThat(execution.durationMs()).isEqualTo(3000);
        assertThat(execution.phases()).containsExactly("STARTED", "PROCESS_STARTED", "TERMINAL");
    }

    @Test void incompleteAndStartFailureAreDistinct() throws Exception {
        Path config = config(); String incomplete = id(1), failed = id(2);
        write(temp.resolve("receipts"), incomplete, receipt(incomplete, Phase.STARTED, Outcome.UNKNOWN, 0));
        write(temp.resolve("receipts"), failed, receipt(failed, Phase.STARTED, Outcome.UNKNOWN, 0),
                receipt(failed, Phase.TERMINAL, Outcome.START_FAILED, 127));
        var executions = job(service(config)).executions();
        assertThat(executions).extracting(RunnerReceiptService.Execution::receiptCompleteness)
                .containsExactlyInAnyOrder("INCOMPLETE", "NEVER_STARTED_CHILD");
        assertThat(executions.stream().filter(e -> e.executionId().equals(incomplete)).findFirst().orElseThrow().childExitCode()).isNull();
        assertThat(executions.stream().filter(e -> e.executionId().equals(incomplete)).findFirst().orElseThrow().childStarted()).isNull();
        assertThat(executions.stream().filter(e -> e.executionId().equals(failed)).findFirst().orElseThrow().childExitCode()).isNull();
        assertThat(executions.stream().filter(e -> e.executionId().equals(failed)).findFirst().orElseThrow().childStarted()).isFalse();
    }

    @Test void fallbackCompletesPartialPrimaryAndDeduplicatesCopies() throws Exception {
        Path config = config(); String id = id(1);
        var start = receipt(id, Phase.STARTED, Outcome.UNKNOWN, 0);
        write(temp.resolve("receipts"), id, start);
        write(temp.resolve("fallback"), id, start, receipt(id, Phase.PROCESS_STARTED, Outcome.UNKNOWN, 0),
                receipt(id, Phase.TERMINAL, Outcome.SUCCESS, 0));
        var executions = job(service(config)).executions();
        assertThat(executions).hasSize(1);
        assertThat(executions.getFirst().source()).isEqualTo("primary+fallback");
        assertThat(executions.getFirst().receiptCompleteness()).isEqualTo("COMPLETE");
        assertThat(executions.getFirst().childExitCode()).isZero();
    }

    @Test void malformedReceiptsDoNotBreakOtherExecutions() throws Exception {
        Path config = config(); String good = id(1), bad = id(2);
        write(temp.resolve("fallback"), good, receipt(good, Phase.STARTED, Outcome.UNKNOWN, 0));
        write(temp.resolve("receipts"), bad, receipt(bad, Phase.STARTED, Outcome.UNKNOWN, 0));
        Path corrupt = temp.resolve("receipts").resolve(bad).resolve("00-started.json");
        Files.writeString(corrupt, "{broken");
        var result = job(service(config));
        assertThat(result.executions()).hasSize(1);
        assertThat(result.warnings()).anyMatch(warning -> warning.contains("ignored"));
        assertThat(Files.readString(corrupt)).isEqualTo("{broken");
    }

    @Test void recentHistoryIsLimitedAndMappingMustBeExact() throws Exception {
        Path config = config();
        for (int index = 0; index < 7; index++) {
            String id = id(index + 1);
            String startedAt = Instant.ofEpochMilli(1_800_000_000_000L + index * 1000L).toString();
            write(temp.resolve("receipts"), id, new ExecutionReceipt(1, id, PROFILE, PROFILE, Phase.STARTED,
                    Outcome.UNKNOWN, startedAt, null, null, null, null, null, null, null, null, null, startedAt));
        }
        assertThat(job(service(config)).executions()).hasSize(5);
        var unmapped = new RunnerReceiptService(new RunnerReceiptProperties(config.toString(),
                List.of(new RunnerReceiptProperties.Mapping("\\Different", "unknown"))));
        assertThat(unmapped.recent().jobs().getFirst().executions()).isEmpty();
    }

    @Test void primaryOnlyFallbackOnlyAndNoReceiptAreDistinct() throws Exception {
        Path config = config();
        assertThat(job(service(config)).executions()).isEmpty();
        String primary = id(1), fallback = id(2);
        write(temp.resolve("receipts"), primary, receipt(primary, Phase.STARTED, Outcome.UNKNOWN, 0));
        write(temp.resolve("fallback"), fallback, receipt(fallback, Phase.STARTED, Outcome.UNKNOWN, 0));
        assertThat(job(service(config)).executions()).extracting(RunnerReceiptService.Execution::source)
                .containsExactlyInAnyOrder("primary", "fallback");
    }

    @Test void invalidSchemaValuesAndUnknownPhaseAreSkippedWithoutMutation() throws Exception {
        Path config = config();
        for (int index = 0; index < 6; index++) {
            String id = id(1);
            var original = (com.fasterxml.jackson.databind.node.ObjectNode) RunnerConfig.JSON.valueToTree(
                    receipt(id, Phase.STARTED, Outcome.UNKNOWN, 0));
            String contents = switch (index) {
                case 0 -> "{broken";
                case 1 -> { var missing = original.deepCopy(); missing.remove("executionId"); yield missing.toString(); }
                case 2 -> original.deepCopy().put("phase", "UNKNOWN_PHASE").toString();
                case 3 -> original.deepCopy().put("startedAt", "not-a-time").toString();
                case 4 -> original.deepCopy().put("processStartedAt", "2026-09-21T02:45:01Z").toString();
                default -> original.toString().replace("\"phase\":\"STARTED\"",
                        "\"phase\":\"STARTED\",\"phase\":\"STARTED\"");
            };
            Path directory = temp.resolve("receipts").resolve(id);
            Files.createDirectories(directory);
            Files.writeString(directory.resolve("00-started.json"), contents);
        }
        String invalidExitId = id(2);
        Path exitDirectory = temp.resolve("receipts").resolve(invalidExitId);
        Files.createDirectories(exitDirectory);
        var terminal = (com.fasterxml.jackson.databind.node.ObjectNode) RunnerConfig.JSON.valueToTree(
                receipt(invalidExitId, Phase.TERMINAL, Outcome.FAILED, 1));
        Files.writeString(exitDirectory.resolve("02-terminal.json"), terminal.put("exitCode", "invalid").toString());
        String unknownFileId = id(3);
        Path unknownDirectory = temp.resolve("receipts").resolve(unknownFileId);
        Files.createDirectories(unknownDirectory);
        Files.writeString(unknownDirectory.resolve("03-future.json"), "{}");
        var result = job(service(config));
        assertThat(result.executions()).isEmpty();
        assertThat(result.warnings()).hasSize(8);
        assertThat(Files.readString(unknownDirectory.resolve("03-future.json"))).isEqualTo("{}");
    }

    @Test void diagnosticsDistinguishConfigurationRootsAndCoverage() throws Exception {
        var absent = new RunnerReceiptService(new RunnerReceiptProperties(null, List.of())).recent();
        assertThat(absent.configStatus()).isEqualTo("NOT_CONFIGURED");
        assertThat(absent.roots().primary()).isEqualTo("NOT_CONFIGURED");
        var invalid = service(temp.resolve("missing.json")).recent();
        assertThat(invalid.configStatus()).isEqualTo("UNAVAILABLE");
        assertThat(invalid.toString()).doesNotContain(temp.toString());

        Path config = config();
        var empty = job(service(config));
        assertThat(empty.coverageState()).isEqualTo("MAPPED_NO_RECEIPT");
        assertThat(service(config).recent().roots().primary()).isEqualTo("NOT_CREATED_YET");
        assertThat(empty.latestEvidenceAt()).isNull();
        String id = id(1);
        write(temp.resolve("fallback"), id, receipt(id, Phase.STARTED, Outcome.UNKNOWN, 0));
        var result = service(config).recent();
        assertThat(result.roots().fallback()).isEqualTo("AVAILABLE");
        assertThat(result.jobs().getFirst().coverageState()).isEqualTo("RUNNER_EVIDENCE_AVAILABLE");
        assertThat(result.jobs().getFirst().latestEvidenceAt()).isEqualTo(START);
        assertThat(result.toString()).doesNotContain(temp.toString(), "child.exe");
        String json = RunnerConfig.JSON.writeValueAsString(result);
        assertThat(json).doesNotContain(temp.toString(), "child.exe", "executable", "args", "workingDirectory");
    }

    @Test void missingProfileDuplicateMappingAndUnsafeRootAreExplicit() throws Exception {
        Path config = config();
        var mappings = List.of(new RunnerReceiptProperties.Mapping(TASK, "absent"),
                new RunnerReceiptProperties.Mapping(TASK, PROFILE));
        var result = new RunnerReceiptService(new RunnerReceiptProperties(config.toString(), mappings)).recent();
        assertThat(result.jobs()).hasSize(1);
        assertThat(result.jobs().getFirst().coverageState()).isEqualTo("MAPPED_PROFILE_MISSING");
        assertThat(result.warnings()).contains("Duplicate Scheduler mapping ignored");
        Path link = temp.resolve("receipts");
        try { Files.createSymbolicLink(link, temp.resolve("elsewhere")); }
        catch (UnsupportedOperationException | java.nio.file.FileSystemException unsupported) { return; }
        assertThat(service(config).recent().roots().primary()).isEqualTo("UNSAFE");
        assertThat(service(config).recent().jobs().getFirst().coverageState()).isEqualTo("RUNNER_UNAVAILABLE");
    }

    @Test void sharedProfileMapsTwoTasksToTheSameEvidence() throws Exception {
        Path config = config(); String id = id(1);
        write(temp.resolve("receipts"), id, receipt(id, Phase.STARTED, Outcome.UNKNOWN, 0));
        var result = new RunnerReceiptService(new RunnerReceiptProperties(config.toString(), List.of(
                new RunnerReceiptProperties.Mapping(TASK, PROFILE),
                new RunnerReceiptProperties.Mapping("\\Second-Task", PROFILE)))).recent();
        assertThat(result.jobs()).hasSize(2);
        assertThat(result.jobs().get(0).executions()).isSameAs(result.jobs().get(1).executions());
        assertThat(result.jobs()).extracting(RunnerReceiptService.JobExecutions::coverageState)
                .containsExactly("RUNNER_EVIDENCE_AVAILABLE", "RUNNER_EVIDENCE_AVAILABLE");
    }

    @Test void unreadableFallbackIsUnavailableRatherThanNoReceipt() throws Exception {
        Path config = config();
        Path fallback = temp.resolve("fallback");
        Files.createDirectory(fallback);
        try (var files = mockStatic(Files.class, CALLS_REAL_METHODS)) {
            files.when(() -> Files.newDirectoryStream(fallback))
                    .thenThrow(new AccessDeniedException("redacted"));
            var result = service(config).recent();
            assertThat(result.roots().fallback()).isEqualTo("UNREADABLE");
            assertThat(result.jobs().getFirst().coverageState()).isEqualTo("RUNNER_UNAVAILABLE");
        }
    }
}
