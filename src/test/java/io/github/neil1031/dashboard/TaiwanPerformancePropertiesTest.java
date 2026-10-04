package io.github.neil1031.dashboard;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class TaiwanPerformancePropertiesTest {
    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(TaiwanProperties.class)
    static class BindingConfig {}

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(BindingConfig.class);

    @Test
    void defaultsKeepTaiwanDisabledAndPerformancePathEmpty() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            var properties = context.getBean(TaiwanProperties.class);
            assertThat(properties.enabled()).isFalse();
            assertThat(properties.performanceCliPath()).isEmpty();
            assertThat(properties.historyCliPath()).isEmpty();
            assertThat(properties.reportsCliPath()).isEmpty();
            assertThat(properties.timeoutSeconds()).isEqualTo(10);
        });
    }

    @Test
    void bindsPerformancePathAlongsideExistingTaiwanPaths() {
        contextRunner.withPropertyValues(
                "dashboard.sources.taiwan.performance-cli-path=performance",
                "dashboard.sources.taiwan.history-cli-path=history",
                "dashboard.sources.taiwan.reports-cli-path=reports")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var properties = context.getBean(TaiwanProperties.class);
                    assertThat(properties.performanceCliPath()).isEqualTo("performance");
                    assertThat(properties.historyCliPath()).isEqualTo("history");
                    assertThat(properties.reportsCliPath()).isEqualTo("reports");
                    assertThat(properties.enabled()).isFalse();
                    assertThat(properties.timeoutSeconds()).isEqualTo(10);
                });
    }

    @Test
    void legacyConstructorsLeaveNewPerformancePathEmpty() {
        var sevenArgument = new TaiwanProperties(false, "python", "stocks", "database", "output", 10, "reports");
        var eightArgument = new TaiwanProperties(false, "python", "stocks", "database", "output", 10, "reports", "history");

        assertThat(sevenArgument.historyCliPath()).isEmpty();
        assertThat(sevenArgument.performanceCliPath()).isEmpty();
        assertThat(eightArgument.historyCliPath()).isEqualTo("history");
        assertThat(eightArgument.performanceCliPath()).isEmpty();
    }
}
