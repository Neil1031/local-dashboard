package io.github.neil1031.dashboard.launcher;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import static org.assertj.core.api.Assertions.*;

class SafeStopTest {
    @TempDir Path temp;
    final Fake target = new Fake();
    final Access access = new Access();
    Path record() throws Exception {
        Path file = temp.resolve("server.pid");
        Files.writeString(file, "12345\n2026-09-21T00:00:00Z\n");
        return file;
    }
    SafeStop.Result stop(Path file) throws Exception { return SafeStop.stop(file, temp.resolve("stop.log"), access); }
    String log() throws Exception { return Files.readString(temp.resolve("stop.log")); }

    @Test void normalStopWaitsAndCleansOnlyPidFile() throws Exception {
        Path config = temp.resolve("application.yml"); Files.writeString(config, "unchanged");
        Path file = record();
        assertThat(stop(file)).isEqualTo(SafeStop.Result.STOPPED);
        assertThat(target.requests).containsExactly(false);
        assertThat(file).doesNotExist();
        assertThat(Files.readString(config)).isEqualTo("unchanged");
        assertThat(log()).contains("STOP_REQUESTED", "IDENTITY_CONFIRMED pid=12345", "GRACEFUL_STOP_REQUESTED", "EXITED");
    }
    @Test void missingAndAbsentAreFriendlyNoOps() throws Exception {
        assertThat(stop(temp.resolve("missing"))).isEqualTo(SafeStop.Result.NOT_RUNNING);
        access.absent = true;
        Path file = record();
        assertThat(stop(file)).isEqualTo(SafeStop.Result.NOT_RUNNING);
        assertThat(target.requests).isEmpty();
        assertThat(file).doesNotExist();
        assertThat(log()).contains("STALE_PID_CLEANUP");
    }
    @Test void reusedPidRefusesAndCleansStaleRecord() throws Exception {
        target.started = target.started.plusSeconds(1);
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("reused");
        assertThat(target.requests).isEmpty();
        assertThat(file).doesNotExist();
    }
    @Test void unknownStartTimeFailsClosed() throws Exception {
        target.started = null;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("identity");
        assertThat(target.requests).isEmpty();
        assertThat(file).exists();
    }
    @Test void wrongExecutableCommandOrListenerRefusesDespiteReadyResponse() throws Exception {
        access.identity = false;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("identity");
        assertThat(target.requests).isEmpty();
        assertThat(file).exists();
    }
    @Test void wrongReadinessRefusesDespiteMatchingProcess() throws Exception {
        access.ready = false;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("identity");
        assertThat(target.requests).isEmpty();
    }
    @Test void inaccessibleIdentityProbeRefusesWithoutLeakingProbeDetails() throws Exception {
        access.probeFails = true;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("Identity information is unavailable");
        assertThat(target.requests).isEmpty();
        assertThat(log()).contains("REFUSED_IDENTITY_MISMATCH").doesNotContain("secret-value");
    }
    @Test void forcedFallbackRechecksIdentity() throws Exception {
        target.firstWaitExits = false;
        assertThat(stop(record())).isEqualTo(SafeStop.Result.STOPPED);
        assertThat(access.checks).isEqualTo(2);
        assertThat(target.requests).containsExactly(false, true);
        assertThat(log()).contains("reason=normal_termination_timeout");
    }
    @Test void changedIdentityAfterNormalRequestPreventsForce() throws Exception {
        target.firstWaitExits = false;
        access.changeOnSecondCheck = true;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("identity");
        assertThat(target.requests).containsExactly(false);
        assertThat(file).exists();
    }
    @Test void windowsDestroyIsLoggedAsForcibleAndRecheckedBeforeFirstRequest() throws Exception {
        target.normal = false;
        assertThat(stop(record())).isEqualTo(SafeStop.Result.STOPPED);
        assertThat(access.checks).isEqualTo(2);
        assertThat(log()).contains("supported=false", "FORCED_TERMINATION", "normal_termination_unsupported");
    }
    @Test void windowsRecheckMismatchPreventsAnyRequest() throws Exception {
        target.normal = false;
        access.changeOnSecondCheck = true;
        Path file = record();
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("identity");
        assertThat(target.requests).isEmpty();
    }
    @Test void malformedPidAndUnrecordedOccupiedPortRefuse() throws Exception {
        Path file = record(); Files.writeString(file, "garbage");
        assertThatThrownBy(() -> stop(file)).hasMessageContaining("Invalid server.pid");
        access.occupied = true;
        assertThatThrownBy(() -> stop(temp.resolve("missing"))).hasMessageContaining("No recorded server");
        assertThat(target.requests).isEmpty();
    }
    @Test void strictCommandAllowsSpacesUnicodeAndRejectsJarSubstringOrExtraOptions() throws Exception {
        Path java = Files.createFile(temp.resolve("javaw.exe"));
        Path jar = Files.createFile(temp.resolve("dashboard 中文.jar"));
        var args = WindowsLauncher.serverCommand(java, jar, temp.resolve("home 中文"));
        String command = args.stream().map(a -> "\"" + a + "\"").collect(Collectors.joining(" "));
        assertThat(WindowsProcessIdentity.commandMatches(command, java, jar)).isTrue();
        assertThat(WindowsProcessIdentity.commandMatches(command + " --other=true", java, jar)).isFalse();
        assertThat(WindowsProcessIdentity.commandMatches(command.replace("-jar", "-cp"), java, jar)).isFalse();
        assertThat(WindowsProcessIdentity.commandMatches(command.replace("8080", "8081"), java, jar)).isFalse();
        Path wrong = Files.createFile(temp.resolve("prefix-dashboard 中文.jar"));
        assertThat(WindowsProcessIdentity.commandMatches(command.replace(jar.toString(), wrong.toString()), java, jar)).isFalse();
        assertThatThrownBy(() -> WindowsProcessIdentity.arguments("\"unclosed")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WindowsProcessIdentity.arguments("\"a\"b")).isInstanceOf(IllegalArgumentException.class);
    }

    class Access implements SafeStop.SystemAccess {
        boolean absent, occupied, changeOnSecondCheck, probeFails;
        boolean identity = true, ready = true;
        int checks;
        public SafeStop.Target find(long pid) { return absent ? null : target; }
        public boolean identity(SafeStop.Target ignored) throws Exception {
            if (probeFails) throw new java.io.IOException("secret-value");
            return ++checks == 2 && changeOnSecondCheck ? false : identity;
        }
        public boolean ready() { return ready; }
        public boolean portOccupied() { return occupied; }
    }
    static class Fake implements SafeStop.Target {
        Instant started = Instant.parse("2026-09-21T00:00:00Z");
        boolean alive = true, normal = true, firstWaitExits = true;
        List<Boolean> requests = new ArrayList<>();
        public long pid() { return 12345; }
        public Instant started() { return started; }
        public boolean alive() { return alive; }
        public boolean supportsNormalTermination() { return normal; }
        public void terminate(boolean force) { requests.add(force); }
        public boolean awaitExit(Duration timeout) {
            if (requests.size() == 1 && !firstWaitExits) return false;
            alive = false; return true;
        }
    }
}
