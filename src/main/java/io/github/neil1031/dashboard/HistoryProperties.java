package io.github.neil1031.dashboard;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("dashboard.history")
public record HistoryProperties(
        @DefaultValue("data/local-dashboard.db") @NotBlank String databasePath,
        @DefaultValue("2000") @Min(1) @Max(10000) int busyTimeoutMs) {}
