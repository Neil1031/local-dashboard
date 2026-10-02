package io.github.neil1031.dashboard;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("dashboard.sources.taiwan")
public record TaiwanProperties(@DefaultValue("false") boolean enabled,
        @DefaultValue("") String pythonPath, @DefaultValue("") String cliPath,
        @DefaultValue("") String databasePath, @DefaultValue("") String outputDir,
        @DefaultValue("10") int timeoutSeconds) {}
