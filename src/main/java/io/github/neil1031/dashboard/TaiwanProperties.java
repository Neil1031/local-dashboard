package io.github.neil1031.dashboard;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("dashboard.sources.taiwan")
public record TaiwanProperties(@DefaultValue("false") boolean enabled,
        @DefaultValue("") String pythonPath, @DefaultValue("") String cliPath,
        @DefaultValue("") String databasePath, @DefaultValue("") String outputDir,
        @DefaultValue("10") int timeoutSeconds,
        @DefaultValue("") String reportsCliPath, @DefaultValue("") String historyCliPath,
        @DefaultValue("") String performanceCliPath) {
    @ConstructorBinding
    public TaiwanProperties {}

    public TaiwanProperties(boolean enabled, String pythonPath, String cliPath, String databasePath,
            String outputDir, int timeoutSeconds, String reportsCliPath) {
        this(enabled, pythonPath, cliPath, databasePath, outputDir, timeoutSeconds, reportsCliPath, "", "");
    }

    public TaiwanProperties(boolean enabled, String pythonPath, String cliPath, String databasePath,
            String outputDir, int timeoutSeconds, String reportsCliPath, String historyCliPath) {
        this(enabled, pythonPath, cliPath, databasePath, outputDir, timeoutSeconds, reportsCliPath, historyCliPath, "");
    }
}
