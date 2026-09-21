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
        assertThat(TaskSelection.matches("Daily*", "\\", "Daily Report")).isFalse();
        assertThat(TaskSelection.matches("[test]", "\\", "[test]")).isTrue();
    }
    @Test void emptyIncludeSelectsNothingAndExcludeWins() {
        assertThat(TaskSelection.selected(List.of(), List.of(), "\\", "Daily")).isFalse();
        assertThat(TaskSelection.selected(List.of("\\"), List.of("Daily"), "\\A\\", "Daily")).isFalse();
        assertThat(TaskSelection.selected(List.of("Daily", "\\A\\"), List.of(), "\\A\\", "Daily")).isTrue();
    }
}
