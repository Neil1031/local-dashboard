package io.github.neil1031.dashboard;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class TaskSelectionTest {
    @Test void literalSelectorsAreCaseInsensitiveAndFolderAware() {
        assertThat(TaskSelection.matches("daily 中文", "\\A\\", "Daily 中文")).isTrue();
        assertThat(TaskSelection.matches("\\A\\Daily 中文", "\\B\\", "Daily 中文")).isFalse();
        assertThat(TaskSelection.matches("\\a\\", "\\A\\Child\\", "Daily 中文")).isTrue();
        assertThat(TaskSelection.matches("\\A\\", "\\AB\\", "Daily 中文")).isFalse();
        assertThat(TaskSelection.matches("Daily*", "\\", "Daily Report")).isTrue();
        assertThat(TaskSelection.matches("[test]", "\\", "[test]")).isTrue();
    }
    @Test void selectorsMatchTheSharedContract() throws Exception {
        var cases = new com.fasterxml.jackson.databind.ObjectMapper().readTree(
                getClass().getResourceAsStream("/fixtures/selector-cases.json"));
        for (var entry : cases) {
            assertThat(TaskSelection.matches(entry.path("selector").asText(), entry.path("path").asText(),
                    entry.path("name").asText())).as(entry.toString()).isEqualTo(entry.path("matches").asBoolean());
        }
    }
    @Test void emptyIncludeSelectsNothingAndExcludeWins() {
        assertThat(TaskSelection.selected(List.of(), List.of(), "\\", "Daily")).isFalse();
        assertThat(TaskSelection.selected(List.of("\\"), List.of("Daily"), "\\A\\", "Daily")).isFalse();
        assertThat(TaskSelection.selected(List.of("Daily", "\\A\\"), List.of(), "\\A\\", "Daily")).isTrue();
        assertThat(TaskSelection.selected(List.of("Daily*"), List.of("\\A\\Dai*"), "\\A\\", "Daily")).isFalse();
    }
}
