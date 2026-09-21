package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.time.Instant;
import static io.github.neil1031.dashboard.Models.Status.*;
import static org.assertj.core.api.Assertions.*;

class JobNormalizerTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final JobNormalizer normalizer = new JobNormalizer();
    private ObjectNode row() throws Exception {
        return (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json")).path("tasks").get(0).deepCopy();
    }

    @Test void successfulPriorRunDoesNotMakeFutureJobSuccessful() throws Exception {
        var job = normalizer.normalize(row());
        assertThat(job.status()).isEqualTo(READY);
        assertThat(job.lastRunStatus()).isEqualTo(SUCCESS);
        assertThat(job.lastRunAt()).isEqualTo(Instant.parse("2026-09-20T12:46:08Z"));
        assertThat(job.nextRunAt()).isEqualTo(Instant.parse("2026-09-21T12:45:00Z"));
        assertThat(job.scheduledAt()).isNull();
        assertThat(job.durationMs()).isNull();
        assertThat(job.raw().path("LastRunTime").asText()).isEqualTo("2026-09-20T20:46:08+08:00");
        assertThat(job.triggers().get(0).path("DaysInterval").asInt()).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({"Ready,true,1,FAILED,FAILED", "Running,true,0,RUNNING,UNKNOWN",
            "Disabled,false,1,DISABLED,FAILED", "Queued,true,0,UNKNOWN,SUCCESS",
            "Alien,true,0,UNKNOWN,SUCCESS", "3,true,0,READY,SUCCESS", "4,true,0,RUNNING,UNKNOWN",
            "Ready,true,267009,READY,UNKNOWN", "Ready,true,267011,READY,UNKNOWN",
            "Ready,true,267014,FAILED,FAILED", "Ready,true,267045,READY,UNKNOWN",
            "Ready,true,-2147024891,FAILED,FAILED"})
    void classifiesWithoutConfusingSchedulerInformationWithExitCodes(String state, boolean enabled, long result,
                                                                                String status, String lastStatus) throws Exception {
        var raw = row().put("State", state).put("Enabled", enabled).put("LastTaskResult", result);
        var job = normalizer.normalize(raw);
        assertThat(job.status().name()).isEqualTo(status);
        assertThat(job.lastRunStatus().name()).isEqualTo(lastStatus);
        assertThat(job.lastTaskResult()).isEqualTo(result & 0xFFFFFFFFL);
    }

    @Test void handlesNeverRunAndNoNextRunWithoutFabricatedSuccess() throws Exception {
        var raw = row().put("LastRunTime", "1899-12-30T00:00:00+08:00").put("NextRunTime", "1601-01-01T00:00:00Z");
        var job = normalizer.normalize(raw);
        assertThat(job.lastRunAt()).isNull();
        assertThat(job.nextRunAt()).isNull();
        assertThat(job.lastRunStatus()).isEqualTo(UNKNOWN);
    }

    @Test void malformedDataAndPermissionFailureRemainUnknown() throws Exception {
        for (String bad : new String[]{"yesterday", "2026-09-21T12:00:00"}) {
            var job = normalizer.normalize(row().put("LastRunTime", bad));
            assertThat(job.status()).isEqualTo(UNKNOWN);
            assertThat(job.lastRunStatus()).isEqualTo(UNKNOWN);
            assertThat(job.warnings()).isNotEmpty();
        }
        var raw = row();
        raw.set("CollectionError", mapper.createObjectNode().put("code", "PERMISSION_DENIED"));
        assertThat(normalizer.normalize(raw).status()).isEqualTo(UNKNOWN);
        assertThat(normalizer.normalize(row().putNull("Enabled")).status()).isEqualTo(UNKNOWN);
        assertThat(normalizer.normalize(row().put("LastTaskResult", 4294967296L)).status()).isEqualTo(UNKNOWN);
        assertThat(normalizer.normalize(row().put("LastTaskResult", "zero")).status()).isEqualTo(UNKNOWN);
    }

    @Test void identityIncludesFolderAndHandlesUnicodeAndSpaces() throws Exception {
        var original = normalizer.normalize(row());
        assertThat(original.name()).isEqualTo("Daily Report 中文");
        assertThat(original.id()).matches("[A-Za-z0-9_-]+");
        assertThat(normalizer.normalize(row().put("TaskPath", "\\Other\\")).id()).isNotEqualTo(original.id());
        assertThat(normalizer.normalize(row().put("TaskPath", "\\RESEARCH\\")).id()).isEqualTo(original.id());
        assertThatThrownBy(() -> normalizer.normalize(row().put("TaskName", ""))).isInstanceOf(CollectionException.class);
    }

    @Test void absentNextRunAndOldLastRunDoNotInventMissedStatus() throws Exception {
        var job = normalizer.normalize(row().putNull("NextRunTime").put("LastRunTime", "2020-01-01T00:00:00Z"));
        assertThat(job.status()).isEqualTo(READY);
        assertThat(job.nextRunAt()).isNull();
    }
}
