package io.github.neil1031.dashboard;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Transport only: callers own argv, slots, exit policy and contract semantics. */
final class BoundedSourceProcess {
    @FunctionalInterface interface Starter { Process start(List<String> argv) throws IOException; }
    record Output(int exit, byte[] stdout) {
        String utf8() throws CharacterCodingException {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(stdout)).toString();
        }
    }
    static final class Failure extends Exception {
        final String code;
        Failure(String code) { this.code = code; }
    }
    static Process start(List<String> argv) throws IOException {
        var builder = new ProcessBuilder(argv);
        builder.environment().put("PYTHONDONTWRITEBYTECODE", "1");
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        builder.environment().put("PYTHONUTF8", "1");
        return builder.start();
    }
    static Output run(List<String> argv, int seconds, int outLimit, int errLimit, Starter starter)
            throws IOException, InterruptedException, Failure {
        Process process = null; Thread stdout = null, stderr = null;
        try {
            process = starter.start(argv); process.getOutputStream().close();
            var out = new Capture(process.getInputStream(), outLimit);
            var err = new Capture(process.getErrorStream(), errLimit);
            stdout = Thread.startVirtualThread(out); stderr = Thread.startVirtualThread(err);
            if (!process.waitFor(seconds, TimeUnit.SECONDS)) throw new Failure("SOURCE_TIMEOUT");
            stdout.join(1000); stderr.join(1000);
            if (stdout.isAlive() || stderr.isAlive() || out.failed || err.failed) throw new Failure("SOURCE_OUTPUT_ERROR");
            if (out.overflow || err.overflow) throw new Failure("SOURCE_OUTPUT_LIMIT");
            return new Output(process.exitValue(), out.bytes.toByteArray());
        } finally {
            if (process != null) {
                // Capture descendants before terminating the parent; wait boundedly for OS termination.
                var children = process.descendants().toList(); children.forEach(ProcessHandle::destroyForcibly);
                if (process.isAlive()) process.destroyForcibly();
                boolean interrupted = Thread.interrupted();
                try {
                    process.waitFor(300, TimeUnit.MILLISECONDS);
                    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(300);
                    while (children.stream().anyMatch(ProcessHandle::isAlive) && System.nanoTime() < deadline) Thread.sleep(10);
                } catch (InterruptedException ignored) { interrupted = true; }
                finally { if (interrupted) Thread.currentThread().interrupt(); }
                close(process.getInputStream()); close(process.getErrorStream());
            }
            if (stdout != null) stdout.interrupt(); if (stderr != null) stderr.interrupt();
        }
    }
    private static void close(InputStream stream) { try { stream.close(); } catch (IOException ignored) {} }
    private static final class Capture implements Runnable {
        final InputStream stream; final int max; final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        volatile boolean overflow, failed;
        Capture(InputStream stream, int max) { this.stream = stream; this.max = max; }
        public void run() {
            try (stream) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    int keep = Math.min(count, max - bytes.size());
                    if (keep > 0) bytes.write(buffer, 0, keep);
                    if (keep < count) overflow = true;
                }
            } catch (IOException e) { failed = true; }
        }
    }
}
