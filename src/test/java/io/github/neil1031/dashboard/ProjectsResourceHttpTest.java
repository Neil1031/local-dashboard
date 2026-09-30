package io.github.neil1031.dashboard;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;

// Real loopback HTTP, ephemeral port/temp DB, collector replaced before startup.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"server.address=127.0.0.1", "dashboard.runner.config-path="})
class ProjectsResourceHttpTest {
    @TempDir static Path temp;
    @DynamicPropertySource static void isolated(DynamicPropertyRegistry registry) {
        registry.add("dashboard.history.database-path", () -> temp.resolve("projects.db").toString());
    }
    @Autowired TestRestTemplate http;
    @LocalServerPort int port;
    @MockitoBean SchedulerCollector collector;
    @MockitoBean JobMetadataStore metadata;
    @Test void servesExactCanonicalBytesAndBothProductionModules() throws Exception {
        for (String[] asset : new String[][] {
            {"/project-design/PROJECT-DESIGN.md", "docs/PROJECT-DESIGN.md"},
            {"/ui/projects.mjs", "ui/projects.mjs"}, {"/ui/project-design.mjs", "ui/project-design.mjs"},
            {"/dashboard.mjs", "dashboard.mjs"}, {"/index.html", "index.html"}}) {
            var response = http.getForEntity(asset[0], byte[].class);
            assertEquals(200, response.getStatusCode().value(), asset[0]);
            assertArrayEquals(Files.readAllBytes(Path.of(asset[1])), response.getBody(), asset[0]);
            if (asset[0].endsWith(".mjs")) assertTrue(response.getHeaders().getContentType().toString().contains("javascript"));
        }
        verifyNoInteractions(collector, metadata);
    }
    @Test void exposesOnlyTheNamedDesignResource() {
        for (String url : new String[]{"/project-design/", "/project-design/README.md", "/project-design/DASHBOARD-DATA-CONTRACTS.md", "/docs/PROJECT-DESIGN.md"})
            assertEquals(404, http.getForEntity(url, String.class).getStatusCode().value(), url);
        assertEquals(405, http.postForEntity("/project-design/PROJECT-DESIGN.md", "changed", String.class).getStatusCode().value());
        verifyNoInteractions(collector, metadata);
    }
    @Test void productionBrowserConsumesTheRealSpringResourceChain() throws Exception {
        String node = System.getenv("PROJECTS_NODE");
        org.junit.jupiter.api.Assumptions.assumeTrue(node != null, "Set PROJECTS_NODE and NODE_PATH for real browser smoke");
        Path output = temp.resolve("browser-smoke.log");
        Process process = new ProcessBuilder(node, "tests/projects-http-smoke.mjs", "http://127.0.0.1:" + port)
            .redirectErrorStream(true).redirectOutput(output.toFile()).start();
        if (!process.waitFor(45, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("Browser smoke timed out"); }
        assertEquals(0, process.exitValue(), Files.readString(output));
        System.out.println(Files.readString(output));
        verifyNoInteractions(collector, metadata);
    }
}
