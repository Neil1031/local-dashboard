package io.github.neil1031.dashboard.launcher;

import java.nio.file.Path;

/** Opt-in acceptance adapter against the actual packaged launcher.jar. No termination. */
public final class Port43871Probe {
    public static void main(String[] args) throws Exception {
        if (args[0].equals("record")) {
            ProcessHandle handle = ProcessHandle.of(Long.parseLong(args[1])).orElseThrow();
            System.out.print(handle.pid() + "\n" + handle.info().startInstant().orElseThrow() + "\n");
            return;
        }
        Path image = Path.of(args[1]).toAbsolutePath();
        Path home = Path.of(args[2]).toAbsolutePath();
        Path coordination = WindowsLauncher.applicationHome(null, System.getenv("LOCALAPPDATA"));
        Path local = Path.of(System.getenv("LOCALAPPDATA")).toAbsolutePath();
        if (!local.startsWith(home.getParent()) || !coordination.startsWith(local)
                || !home.equals(WindowsLauncher.applicationHome(System.getenv("LOCAL_DASHBOARD_HOME"), null)))
            throw new IllegalArgumentException("Acceptance state escaped isolated root");
        WindowsLauncher.confirmReadyInstance(coordination.resolve("server.pid"),
                image.resolve("runtime/bin/javaw.exe"), args.length > 3 ? Path.of(args[3]) : image.resolve("app/dashboard.jar"), home);
        System.out.println("CONFIRMED_RECORDED_READY_INSTANCE");
    }
}
