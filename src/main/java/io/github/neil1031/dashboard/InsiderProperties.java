package io.github.neil1031.dashboard;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("dashboard.sources.insider")
public record InsiderProperties(@DefaultValue("false") boolean enabled,
        @DefaultValue("") String cliPath, @DefaultValue("") String databasePath,
        @DefaultValue("10") int timeoutSeconds) {}
