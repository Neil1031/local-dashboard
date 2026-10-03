package io.github.neil1031.dashboard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.nio.file.Path;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Actual loopback HTTP with temp Dashboard DB and mock source, no formal reads. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"server.address=127.0.0.1","dashboard.runner.config-path="})
class PerformanceHttpTest {
    @TempDir static Path temp;
    @DynamicPropertySource static void isolated(DynamicPropertyRegistry r){r.add("dashboard.history.database-path",()->temp.resolve("http.db").toString());}
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @MockitoBean PerformanceAdapter adapter;
    @MockitoBean SchedulerCollector collector;
    @MockitoBean JobMetadataStore metadata;
    @Test void realHttpNoStoreProjectionAndValidationBeforeSource() {
        when(adapter.read(any())).thenAnswer(i->PerformanceProjection.envelope(i.getArgument(0),"UNAVAILABLE",json));
        for(String path:new String[]{"/api/performance/summary","/api/performance/signals?limit=1&offset=0","/api/performance/detail?signalId=report:2026-09-30:COO"}) {
            var response=http.getForEntity(path,String.class);assertThat(response.getStatusCode().value()).isEqualTo(200);assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");assertThat(response.getBody()).contains("UNAVAILABLE","insider-performance");
        }
        clearInvocations(adapter);
        for(String path:new String[]{"/api/performance/summary?horizon=2m","/api/performance/signals?limit=101","/api/performance/detail?signalId=bad","/api/performance/detail?signalId=report:2026-09-30:COO&db=secret"}) {
            var response=http.getForEntity(path,String.class);assertThat(response.getStatusCode().value()).isEqualTo(400);assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");assertThat(response.getBody()).contains("INVALID_PERFORMANCE_QUERY");
        }
        verifyNoInteractions(adapter,collector,metadata);
    }
}
