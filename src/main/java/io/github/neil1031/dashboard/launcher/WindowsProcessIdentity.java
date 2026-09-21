package io.github.neil1031.dashboard.launcher;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Windows ProcessHandle does not expose arguments. CIM is a read-only identity probe;
 * all termination decisions/operations remain in the Java launcher. */
final class WindowsProcessIdentity {
    static boolean matches(ProcessHandle handle, Path java, Path jar) throws Exception {
        String executable = handle.info().command().orElse("");
        if (executable.isEmpty() || !sameFile(executable, java)) return false;
        long pid = handle.pid();
        String script = " $ErrorActionPreference='Stop'; "
                + "$p=Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "'; "
                + "if (!$p -or !$p.ExecutablePath -or !$p.CommandLine) { exit 2 }; "
                + "$listeners=@(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction Stop); "
                + "if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' "
                + "-or $listeners[0].OwningProcess -ne " + pid + ") { exit 3 }; "
                + "[Console]::WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p.ExecutablePath))); "
                + "[Console]::WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p.CommandLine)));";
        Path powershell = Path.of(System.getenv("SystemRoot"), "System32/WindowsPowerShell/v1.0/powershell.exe");
        var probe = new ProcessBuilder(powershell.toString(), "-NoLogo", "-NoProfile", "-NonInteractive",
                "-WindowStyle", "Hidden", "-EncodedCommand",
                Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE)))
                .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        probe.getOutputStream().close();
        try (var reader = Executors.newVirtualThreadPerTaskExecutor()) {
            var output = reader.submit(() -> {
                try (var stream = probe.getInputStream()) { return stream.readNBytes(65537); }
            });
            try {
                if (!probe.waitFor(15, TimeUnit.SECONDS)) throw new IOException("Identity probe timed out; refusing stop.");
                if (probe.exitValue() != 0) return false;
                byte[] bytes = output.get(2, TimeUnit.SECONDS);
                if (bytes.length > 65536) return false;
                var lines = new String(bytes, StandardCharsets.US_ASCII).lines().toList();
                if (lines.size() != 2) return false;
                String actualJava = decode(lines.get(0));
                return sameFile(actualJava, java) && commandMatches(decode(lines.get(1)), java, jar);
            } finally {
                // Only this read-only helper's retained child handle, never a process search.
                if (probe.isAlive()) probe.destroyForcibly();
                probe.waitFor(5, TimeUnit.SECONDS);
            }
        }
    }

    private static String decode(String value) {
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }

    static boolean commandMatches(String command, Path java, Path jar) {
        try {
            List<String> args = arguments(command);
            if (args.size() != 6 || !sameFile(args.get(0), java) || !args.get(1).equals("-jar")
                    || !sameFile(args.get(2), jar) || !args.get(3).equals("--server.address=127.0.0.1")
                    || !args.get(4).equals("--server.port=8080")) return false;
            String prefix = "--spring.config.location=classpath:/application.yml,optional:";
            if (!args.get(5).startsWith(prefix)) return false;
            Path config = Path.of(URI.create(args.get(5).substring(prefix.length())));
            return config.isAbsolute() && config.endsWith(Path.of("config", "application.yml"));
        } catch (Exception invalid) { return false; }
    }

    private static boolean sameFile(String actual, Path expected) throws IOException {
        return Files.isSameFile(Path.of(actual), expected);
    }

    /** Accept only the simple, whole-token quoting emitted by our ProcessBuilder.
     * Embedded quotes/escaped quote tricks are not part of the launcher command contract. */
    static List<String> arguments(String command) {
        var matcher = Pattern.compile("(?:\"([^\"]*)\"|([^\\s\"]+))(?:\\s+|$)").matcher(command);
        var result = new ArrayList<String>();
        int end = 0;
        while (matcher.find()) {
            if (matcher.start() != end) throw new IllegalArgumentException("Unsupported command quoting");
            result.add(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
            end = matcher.end();
        }
        if (end != command.length()) throw new IllegalArgumentException("Incomplete command line");
        return result;
    }
}
