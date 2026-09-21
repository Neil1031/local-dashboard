package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;

@EnabledOnOs(OS.WINDOWS)
class PowerShellCollectorTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private String resource(String path) throws Exception {
        try (var input = getClass().getResourceAsStream(path)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
    private String run(String script, String input, Duration timeout) {
        String encoded = Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE));
        return PowerShellCollector.run(List.of("powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded), input, timeout);
    }
    private JsonNode fixture(List<String> include, List<String> exclude) throws Exception {
        String output = run(resource("/fixtures/scheduledtasks-stubs.ps1") + "\n" + resource("/collect-scheduler.ps1"),
                mapper.writeValueAsString(Map.of("include", include, "exclude", exclude)), Duration.ofSeconds(10));
        return mapper.readTree(output);
    }
    @Test void realScriptPreservesUnicodeLiteralNamesAndReportsPermissionDenied() throws Exception {
        var snapshot = fixture(List.of("報告 [daily] '; Write-Error injected; '"), List.of());
        assertThat(snapshot.path("tasks")).hasSize(2);
        assertThat(snapshot.path("tasks").get(0).path("TaskName").asText()).isEqualTo("報告 [daily] '; Write-Error injected; '");
        assertThat(snapshot.path("tasks").get(0).path("Triggers").get(0).path("DaysInterval").asInt()).isEqualTo(1);
        assertThat(snapshot.path("errors").get(0).path("code").asText()).isEqualTo("PERMISSION_DENIED");
        assertThat(snapshot.path("tasks").get(1).path("LastTaskResult").isNull()).isTrue();
        assertThat(new JobNormalizer().normalize(snapshot.path("tasks").get(0)).status()).isEqualTo(Models.Status.FAILED);
        assertThat(new JobNormalizer().normalize(snapshot.path("tasks").get(1)).status()).isEqualTo(Models.Status.UNKNOWN);
    }
    @Test void realScriptFiltersFoldersAndKeepsSingletonAndEmptyArrays() throws Exception {
        var single = fixture(List.of("\\"), List.of("\\Archive\\"));
        assertThat(single.path("tasks")).hasSize(1);
        assertThat(single.path("errors")).isEmpty();
        var none = fixture(List.of("Not present"), List.of());
        assertThat(none.path("tasks").isArray()).isTrue();
        assertThat(none.path("tasks")).isEmpty();
        assertThat(none.path("unmatchedIncludes").get(0).asText()).isEqualTo("Not present");
        var excluded = fixture(List.of("\\Research\\"), List.of("\\Research\\"));
        assertThat(excluded.path("tasks")).isEmpty();
        assertThat(excluded.path("unmatchedIncludes")).isEmpty();
    }
    @Test void wholeEnumerationErrorDoesNotBecomeEmptyList() throws Exception {
        String script = "function Import-Module {}\nfunction Get-ScheduledTask { throw 'Fixture denied' }\n"
                + resource("/collect-scheduler.ps1");
        assertThatThrownBy(() -> run(script, "{\"include\":[\"x\"],\"exclude\":[]}", Duration.ofSeconds(10)))
                .isInstanceOf(CollectionException.class).hasMessageContaining("PowerShell collection failed");
    }
    @Test void processFailureAndTimeoutAreBounded() {
        assertThatThrownBy(() -> run("exit 2", "", Duration.ofSeconds(5))).isInstanceOf(CollectionException.class);
        long start = System.nanoTime();
        assertThatThrownBy(() -> run("Start-Sleep -Seconds 30", "", Duration.ofMillis(500)))
                .isInstanceOf(CollectionException.class).hasMessageContaining("timed out");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(8));
        assertThatThrownBy(() -> PowerShellCollector.run(List.of("nonexistent-dashboard-test-executable"), "", Duration.ofSeconds(1)))
                .isInstanceOf(CollectionException.class).hasMessageContaining("Cannot start");
    }
}
