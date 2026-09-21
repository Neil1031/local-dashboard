package io.github.neil1031.dashboard;

import java.util.List;
import java.util.Locale;

/** Case-insensitive literal selectors, folder subtrees, and a single trailing prefix '*'. */
public final class TaskSelection {
    private TaskSelection() {}

    public static boolean matches(String selector, String path, String name) {
        String key = selector.toLowerCase(Locale.ROOT);
        String full = (path + name).toLowerCase(Locale.ROOT);
        // Only a nonempty prefix followed by one '*' is special. Other '*' remain literal.
        if (key.length() > 1 && key.indexOf('*') == key.length() - 1) {
            String target = key.startsWith("\\") ? full : name.toLowerCase(Locale.ROOT);
            return target.startsWith(key.substring(0, key.length() - 1));
        }
        if (key.startsWith("\\")) {
            return key.endsWith("\\") ? full.startsWith(key) : full.equals(key);
        }
        return name.toLowerCase(Locale.ROOT).equals(key);
    }

    public static boolean selected(List<String> include, List<String> exclude, String path, String name) {
        return include.stream().anyMatch(s -> matches(s, path, name))
                && exclude.stream().noneMatch(s -> matches(s, path, name));
    }
}
