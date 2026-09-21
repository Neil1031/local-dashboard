package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class JobServiceTest {
    final ObjectMapper mapper = new ObjectMapper();
    ObjectNode fixture() throws Exception {
        return (ObjectNode) mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"));
    }
    @Test void unconfiguredDoesNotInvokeCollector() {
        var service = new JobService(() -> { throw new AssertionError("Must not collect"); },
                new SchedulerProperties(List.of(), List.of(), 15, 30), new JobNormalizer());
        assertThat(service.jobs().collectionStatus()).isEqualTo("NOT_CONFIGURED");
    }
    @Test void excludesCannotLeakThroughApi() throws Exception {
        var snapshot = fixture();
        var service = new JobService(() -> snapshot, new SchedulerProperties(List.of("Daily Report 中文"),
                List.of("\\Archive\\"), 15, 30), new JobNormalizer());
        assertThat(service.jobs().jobs()).singleElement().satisfies(j -> assertThat(j.taskPath()).isEqualTo("\\Research\\"));
    }
    @Test void duplicateIdentitiesAreRejected() throws Exception {
        var snapshot = fixture();
        snapshot.withArray("tasks").add(snapshot.path("tasks").get(0));
        var service = new JobService(() -> snapshot, new SchedulerProperties(List.of("\\"), List.of(), 15, 30), new JobNormalizer());
        assertThatThrownBy(service::jobs).isInstanceOf(CollectionException.class).hasMessageContaining("Duplicate");
    }
}
