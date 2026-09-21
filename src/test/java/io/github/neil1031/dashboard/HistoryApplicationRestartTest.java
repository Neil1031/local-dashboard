package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import java.nio.file.Path;
import java.util.Map;
import java.util.LinkedHashMap;
import static org.assertj.core.api.Assertions.*;

class HistoryApplicationRestartTest {
    @TempDir Path temp;

    @Test void separateApplicationContextsKeepIdsAndCountsAcrossShutdownAndRestart() {
        Map<String, java.util.List<HistoryRepository.ObservedRun>> saved = new LinkedHashMap<>();
        for (int instance = 0; instance < 2; instance++) {
            try (var context = new SpringApplicationBuilder(DashboardApplication.class, Fixture.class)
                    .web(WebApplicationType.NONE).run("--dashboard.scheduler.include[0]=\\",
                            "--dashboard.history.database-path=" + temp.resolve("application.db"),
                            "--spring.config.location=classpath:/application.yml", "--spring.main.banner-mode=off")) {
                var service = context.getBean(JobService.class);
                var repository = context.getBean(HistoryRepository.class);
                var response = service.jobs();
                assertThat(response.collectionStatus()).isEqualTo("OK");
                assertThat(response.jobs()).hasSize(4);
                for (var job : response.jobs()) {
                    var runs = repository.recentRuns(job.id(), 10);
                    if (instance == 0) saved.put(job.id(), runs);
                    else assertThat(runs).isEqualTo(saved.get(job.id()));
                }
            }
        }
        assertThat(saved.values().stream().mapToInt(java.util.List::size).sum()).isEqualTo(3);
    }

    @TestConfiguration
    static class Fixture {
        @Bean @Primary SchedulerCollector fixtureCollector(ObjectMapper mapper) throws Exception {
            var snapshot = mapper.readTree(getClass().getResourceAsStream("/fixtures/scheduler.json"));
            return () -> snapshot;
        }
    }
}
