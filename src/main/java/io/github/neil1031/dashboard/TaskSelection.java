package io.github.neil1031.dashboard;

import java.util.List;
import java.util.Locale;

/** Literal, case-insensitive selectors. A trailing backslash selects a folder subtree. */
public final class TaskSelection {
    private TaskSelection() {}

    public static boolean matches(String selector, String path, String name) {
        String key = selector.toLowerCase(Locale.ROOT);
        String full = (path + name).toLowerCase(Locale.ROOT);
        if (key.startsWith("\\")) {
            return key.endsWith("\\") ? full.startsWith(key) : full.equals(key);
        }
        return name.equalsIgnoreCase(selector);
    }

    public static boolean selected(List<String> include, List<String> exclude, String path, String name) {
        return include.stream().anyMatch(s -> matches(s, path, name))
                && exclude.stream().noneMatch(s -> matches(s, path, name));
    }
}
