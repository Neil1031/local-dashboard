package io.github.neil1031.dashboard.launcher;

import java.nio.file.Files;
import java.nio.file.Path;

/** Finite unrelated Java child for Windows acceptance; never a system process. */
public final class StopProcessFixture {
    public static void main(String[] args) throws Exception {
        var current = ProcessHandle.current();
        Files.writeString(Path.of(args[0]), current.pid() + "\n" + current.info().startInstant().orElseThrow() + "\n");
        Thread.sleep(300_000);
    }
}
