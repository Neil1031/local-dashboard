package io.github.neil1031.dashboard;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;
import java.util.List;

@Validated
@ConfigurationProperties("dashboard.scheduler")
public record SchedulerProperties(
        List<@NotBlank String> include, List<@NotBlank String> exclude,
        @DefaultValue("15") @Min(0) @Max(1440) int missedGraceMinutes,
        @DefaultValue("30") @Min(1) @Max(120) int timeoutSeconds) {
    public SchedulerProperties {
        include = include == null ? List.of() : List.copyOf(include);
        exclude = exclude == null ? List.of() : List.copyOf(exclude);
    }
}
