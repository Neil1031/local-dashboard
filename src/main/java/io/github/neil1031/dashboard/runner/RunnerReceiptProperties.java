package io.github.neil1031.dashboard.runner;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

@ConfigurationProperties("dashboard.runner")
public record RunnerReceiptProperties(String configPath, List<Mapping> mappings) {
    public record Mapping(String schedulerTask, String profileId) {}
    public RunnerReceiptProperties {
        mappings = mappings == null ? List.of() : List.copyOf(mappings);
    }
}
