package io.github.neil1031.dashboard.launcher;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.yaml.snakeyaml.Yaml;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;

class ConfigBootstrapTest {
    @TempDir Path home;

    @Test void firstRunPublishesExactSharedTemplateAndValidSettings() throws Exception {
        assertThat(ConfigBootstrap.ensure(home)).isTrue();
        Path config = home.resolve("config/application.yml");
        assertThat(Files.readAllBytes(config)).isEqualTo(Files.readAllBytes(Path.of("config/application.example.yml")));
        Map<?, ?> yaml = new Yaml().load(Files.readString(config));
        Map<?, ?> dashboard = (Map<?, ?>) yaml.get("dashboard");
        Map<?, ?> scheduler = (Map<?, ?>) dashboard.get("scheduler");
        assertThat(scheduler.get("include")).isEqualTo(List.of("\\InsiderTracker-Market", "\\InsiderTracker-SEC",
                "\\InsiderTracker-SyncImport", "\\AIStockHunter-UnexplainedVolume-Daily", "\\AIStockHunter-Accumulation-Weekly-Check", "\\AIStockHunter-Accumulation-Check-*"));
        assertThat(scheduler.get("exclude")).isEqualTo(List.of());
        assertThat(scheduler.get("missed-grace-minutes")).isEqualTo(15);
        assertThat(scheduler.get("timeout-seconds")).isEqualTo(30);
        assertThat(dashboard.get("history")).isEqualTo(Map.of("database-path", "data/local-dashboard.db", "busy-timeout-ms", 2000));
        var modified = Files.getLastModifiedTime(config);
        assertThat(ConfigBootstrap.ensure(home)).isFalse();
        assertThat(Files.getLastModifiedTime(config)).isEqualTo(modified);
    }

    @Test void existingCustomEmptyOrInvalidFilesAreNeverRewritten() throws Exception {
        Path config = home.resolve("config/application.yml");
        Files.createDirectories(config.getParent());
        for (String content : List.of("# my config\r\ndashboard:\r\n  scheduler:\r\n    include: []\r\n", "", "invalid: [")) {
            Files.writeString(config, content);
            Files.setLastModifiedTime(config, FileTime.fromMillis(1_600_000_000_000L));
            byte[] original = Files.readAllBytes(config);
            var modified = Files.getLastModifiedTime(config);
            assertThat(ConfigBootstrap.ensure(home)).isFalse();
            assertThat(Files.readAllBytes(config)).isEqualTo(original);
            assertThat(Files.getLastModifiedTime(config)).isEqualTo(modified);
        }
    }

    @Test void concurrentPublishHasExactlyOneWinnerAndNoPartialConfigOrTemporaryFiles() throws Exception {
        var start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(12)) {
            for (int i = 0; i < 12; i++) results.add(executor.submit(() -> {
                start.await();
                return ConfigBootstrap.ensure(home);
            }));
            start.countDown();
            int created = 0;
            for (var result : results) if (result.get(10, TimeUnit.SECONDS)) created++;
            assertThat(created).isEqualTo(1);
        }
        assertThat(Files.readAllBytes(home.resolve("config/application.yml")))
                .isEqualTo(Files.readAllBytes(Path.of("config/application.example.yml")));
        try (var files = Files.list(home.resolve("config"))) {
            assertThat(files.map(path -> path.getFileName().toString()).toList()).containsExactly("application.yml");
        }
    }

    @Test void blockedParentFailsWithoutChangingUsersFile() throws Exception {
        Files.writeString(home.resolve("config"), "user-owned file");
        assertThatThrownBy(() -> ConfigBootstrap.ensure(home)).isInstanceOf(IOException.class);
        assertThat(Files.readString(home.resolve("config"))).isEqualTo("user-owned file");
    }
}
