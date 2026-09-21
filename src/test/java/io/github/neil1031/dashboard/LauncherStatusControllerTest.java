package io.github.neil1031.dashboard;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LauncherStatusControllerTest {
    @Test void reportsReadyOnlyBetweenApplicationReadyAndContextClose() {
        var controller = new LauncherStatusController();
        assertThat(controller.status().getStatusCode().value()).isEqualTo(503);
        controller.ready();
        assertThat(controller.status().getStatusCode().value()).isEqualTo(200);
        assertThat(controller.status().getBody()).isEqualTo("local-dashboard:ready:v1");
        assertThat(controller.status().getHeaders().getCacheControl()).isEqualTo("no-store");
        controller.closing();
        assertThat(controller.status().getStatusCode().value()).isEqualTo(503);
    }
}
