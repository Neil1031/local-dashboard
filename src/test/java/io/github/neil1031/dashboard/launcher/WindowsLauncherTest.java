package io.github.neil1031.dashboard.launcher;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;

class WindowsLauncherTest {
    @TempDir Path temp;

    @Test void readinessRequiresExactApplicationIdentityAndSuccessfulStatus() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var code = new AtomicInteger(200);
        String[] body = {"an unrelated service"};
        server.createContext("/api/launcher/status", exchange -> {
            byte[] bytes = body[0].getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Location", "/api/launcher/status");
            exchange.sendResponseHeaders(code.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            assertThat(WindowsLauncher.ready(uri)).isFalse();
            body[0] = "local-dashboard:ready:v1";
            code.set(503);
            assertThat(WindowsLauncher.ready(uri)).isFalse();
            code.set(302);
            assertThat(WindowsLauncher.ready(uri)).isFalse();
            code.set(200);
            assertThat(WindowsLauncher.ready(uri)).isTrue();
        } finally { server.stop(0); }
    }

    @Test void readinessPollsUntilReadyAndFailsOnChildExitOrDeadline() throws Exception {
        var calls = new AtomicInteger();
        assertThat(WindowsLauncher.awaitReady(() -> calls.incrementAndGet() == 3, () -> true, Duration.ofSeconds(2))).isEqualTo(3);
        assertThat(calls.get()).isEqualTo(3);
        assertThatThrownBy(() -> WindowsLauncher.awaitReady(() -> false, () -> false, Duration.ofSeconds(2)))
                .isInstanceOf(IOException.class).hasMessageContaining("exited");
        assertThatThrownBy(() -> WindowsLauncher.awaitReady(() -> false, () -> true, Duration.ofMillis(1)))
                .isInstanceOf(IOException.class).hasMessageContaining("did not become ready");
    }

    @Test void homeIsStableAndCommandPreservesExternalConfigurationWithSpacesAndUnicode() throws Exception {
        Path home = temp.resolve("使用者 data");
        assertThat(WindowsLauncher.applicationHome(null, temp.toString())).isEqualTo(temp.resolve("LocalDashboard"));
        assertThat(WindowsLauncher.applicationHome(home.toString(), null)).isEqualTo(home);
        assertThatThrownBy(() -> WindowsLauncher.applicationHome("relative", temp.toString())).isInstanceOf(IOException.class);
        var command = WindowsLauncher.serverCommand(temp.resolve("runtime/bin/javaw.exe"), temp.resolve("app/dashboard.jar"), home);
        assertThat(WindowsLauncher.URL).isEqualTo(URI.create("http://127.0.0.1:43871"));
        assertThat(command).contains("--server.address=127.0.0.1", "--server.port=43871",
                "--spring.config.location=classpath:/application.yml,optional:" + home.resolve("config/application.yml").toUri());
        assertThat(command.get(2)).isEqualTo(temp.resolve("app/dashboard.jar").toString());
    }
}
