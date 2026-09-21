package io.github.neil1031.dashboard.runner;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import static io.github.neil1031.dashboard.runner.ExecutionReceipt.*;
import static org.assertj.core.api.Assertions.*;

class ReceiptFilesTest {
    @TempDir Path temp;
    String id = "test_1_" + UUID.randomUUID();
    ExecutionReceipt start() {
        return new ExecutionReceipt(1, id, "test", "fixture", Phase.STARTED, Outcome.UNKNOWN,
                Instant.now().toString(), null, null, null, null, null, null, null, null, null, Instant.now().toString());
    }

    ExecutionReceipt terminal(ExecutionReceipt start) {
        return new ExecutionReceipt(1, id, start.jobId(), start.commandProfileId(), Phase.TERMINAL,
                Outcome.SUCCESS, start.startedAt(), start.startedAt(), Instant.now().toString(), 10L, 0, 0,
                null, null, null, null, Instant.now().toString());
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void claimedDirectoryWithoutPublishedPhasesHasNoEvidence(boolean pendingOnly) throws Exception {
        ReceiptFiles.claim(temp, id);
        Path pending = temp.resolve(id).resolve(".pending-interrupted.tmp");
        if (pendingOnly) Files.writeString(pending, "{unfinished");
        assertThat(ReceiptFiles.read(temp, id)).isEmpty();
        assertThat(ReceiptFiles.read(java.util.List.of(temp), id)).isEmpty();
        assertThat(temp.resolve(id)).isDirectory();
        if (pendingOnly) assertThat(Files.readString(pending)).isEqualTo("{unfinished");
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void emptyOrPendingOnlyPrimaryDoesNotBlockValidFallback(boolean pendingOnly) throws Exception {
        Path primary = temp.resolve("primary"), fallback = temp.resolve("fallback");
        ReceiptFiles.claim(primary, id);
        if (pendingOnly) Files.writeString(primary.resolve(id).resolve(".pending-interrupted.tmp"), "{unfinished");
        var receipt = terminal(start());
        ReceiptFiles.claim(fallback, id).write(receipt);
        assertThat(ReceiptFiles.read(java.util.List.of(primary, fallback), id)).contains(receipt);
        assertThat(ReceiptFiles.read(java.util.List.of(fallback, primary), id)).contains(receipt);
    }

    @Test void publishedStartedOnlyPrimaryRemainsIncompleteUnknown() throws Exception {
        Path primary = temp.resolve("primary"), fallback = temp.resolve("absent-fallback");
        var receipt = start();
        ReceiptFiles.claim(primary, id).write(receipt);
        assertThat(ReceiptFiles.read(primary, id)).contains(receipt);
        var recovered = ReceiptFiles.read(java.util.List.of(primary, fallback), id).orElseThrow();
        assertThat(recovered.completionState()).isEqualTo("INCOMPLETE");
        assertThat(recovered.outcome()).isEqualTo(Outcome.UNKNOWN);
        assertThat(recovered.finishedAt()).isNull();
        assertThat(recovered.exitCode()).isNull();
    }

    @ParameterizedTest @ValueSource(strings = {"00-started.json", "01-process-started.json", "02-terminal.json"})
    void anyCorruptPublishedPrimaryPhaseFailsClosedEvenWithValidFallback(String filename) throws Exception {
        Path primary = temp.resolve("primary"), fallback = temp.resolve("fallback");
        ReceiptFiles.claim(primary, id);
        var started = start();
        var terminal = terminal(started);
        ReceiptFiles.claim(fallback, id).write(terminal);
        ExecutionReceipt valid = switch (filename) {
            case "00-started.json" -> started;
            case "01-process-started.json" -> new ExecutionReceipt(1, id, started.jobId(), started.commandProfileId(),
                    Phase.PROCESS_STARTED, Outcome.UNKNOWN, started.startedAt(), started.startedAt(), null,
                    null, null, null, null, null, null, null, Instant.now().toString());
            default -> terminal;
        };
        var json = (com.fasterxml.jackson.databind.node.ObjectNode) RunnerConfig.JSON.valueToTree(valid);
        Path published = primary.resolve(id).resolve(filename);
        for (String corrupt : new String[]{"{broken", json.deepCopy().put("schemaVersion", 999).toString(),
                json.deepCopy().put("executionId", "test_1_" + UUID.randomUUID()).toString(),
                json.deepCopy().put("finishedAt", Instant.now().toString()).put("durationMs", -1).toString()}) {
            Files.writeString(published, corrupt);
            assertThatThrownBy(() -> ReceiptFiles.read(primary, id)).isInstanceOf(IOException.class);
            assertThatThrownBy(() -> ReceiptFiles.read(java.util.List.of(primary, fallback), id)).isInstanceOf(IOException.class);
            assertThatThrownBy(() -> ReceiptFiles.read(java.util.List.of(fallback, primary), id)).isInstanceOf(IOException.class);
            assertThat(Files.readString(published)).isEqualTo(corrupt);
            assertThat(ReceiptFiles.read(fallback, id)).contains(terminal);
        }
    }

    @Test void duplicateIdentityAndPhaseAreProtectedAndRestartReadsIncomplete() throws Exception {
        var store = ReceiptFiles.claim(temp, id);
        var receipt = start();
        store.write(receipt);
        assertThatThrownBy(() -> ReceiptFiles.claim(temp, id)).isInstanceOf(java.nio.file.FileAlreadyExistsException.class);
        assertThatThrownBy(() -> store.write(receipt)).isInstanceOf(java.io.IOException.class);
        var reread = ReceiptFiles.read(temp, id).orElseThrow();
        assertThat(reread).isEqualTo(receipt);
        assertThat(reread.completionState()).isEqualTo("INCOMPLETE");
        assertThat(reread.outcome()).isEqualTo(Outcome.UNKNOWN);
    }

    @Test void racingClaimsAllowOnlyOneOwner() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            var call = (java.util.concurrent.Callable<Boolean>) () -> {
                try { ReceiptFiles.claim(temp, id); return true; }
                catch (java.nio.file.FileAlreadyExistsException expected) { return false; }
            };
            var results = executor.invokeAll(java.util.List.of(call, call));
            assertThat(results.get(0).get() ^ results.get(1).get()).isTrue();
        }
    }

    @Test void unsupportedCorruptAndOversizedReceiptsNeverTurnIntoSuccess() throws Exception {
        var store = ReceiptFiles.claim(temp, id);
        store.write(start());
        Path file = temp.resolve(id).resolve("00-started.json");
        String valid = Files.readString(file);
        for (String invalid : new String[]{valid.replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
                valid.replace("\"UNKNOWN\"", "\"SUCCESS\""), "not json", " ".repeat(16385)}) {
            Files.writeString(file, invalid);
            assertThatThrownBy(() -> ReceiptFiles.read(temp, id)).isInstanceOf(java.io.IOException.class);
        }
        Files.writeString(file, valid);
        Files.writeString(temp.resolve(id).resolve(".pending-interrupted.tmp"), "{partial");
        assertThat(ReceiptFiles.read(temp, id).orElseThrow().outcome()).isEqualTo(Outcome.UNKNOWN);
        assertThatThrownBy(() -> ReceiptFiles.read(temp, "../escape")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void primaryAndFallbackCoalesceToOneExecutionAndConflictingCopiesFailClosed() throws Exception {
        Path primary = temp.resolve("primary"), fallback = temp.resolve("fallback");
        var start = start();
        ReceiptFiles.claim(primary, id).write(start);
        var terminal = new ExecutionReceipt(1, id, start.jobId(), start.commandProfileId(), Phase.TERMINAL,
                Outcome.SUCCESS, start.startedAt(), start.startedAt(), Instant.now().toString(), 10L, 0, 0,
                null, null, null, null, Instant.now().toString());
        ReceiptFiles.claim(fallback, id).write(terminal);
        assertThat(ReceiptFiles.read(java.util.List.of(primary, fallback), id)).contains(terminal);
        assertThat(ReceiptFiles.read(java.util.List.of(fallback, primary), id)).contains(terminal);
        String json = Files.readString(fallback.resolve(id).resolve("02-terminal.json"));
        Files.writeString(fallback.resolve(id).resolve("02-terminal.json"), json.replace("\"fixture\"", "\"different\""));
        assertThatThrownBy(() -> ReceiptFiles.read(java.util.List.of(primary, fallback), id)).isInstanceOf(java.io.IOException.class);
    }
}
