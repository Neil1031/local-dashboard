package io.github.neil1031.dashboard;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Dedicated source-owned read-only CLI; browser input is only a canonical date. */
@Service
public class TaiwanStocksAdapter {
    static final int MAX_STDOUT = 16 * 1024 * 1024, MAX_STDERR = 64 * 1024;
    private final TaiwanProperties config;
    private final ObjectMapper json;
    private final Semaphore slots = new Semaphore(2);
    public TaiwanStocksAdapter(TaiwanProperties config, ObjectMapper json) {
        this.config = config;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    List<String> command(String date) {
        TwStocksProjection.date(date);
        var args = new ArrayList<String>();
        args.add(config.pythonPath());
        if (Path.of(config.pythonPath()).getFileName().toString().equalsIgnoreCase("py.exe")) args.add("-3.11");
        args.addAll(List.of("-B", config.cliPath(), "--db", config.databasePath(), "--output-dir", config.outputDir()));
        if (date != null) args.addAll(List.of("--target-date", date));
        return args;
    }
    private boolean configured() {
        try {
            Path python = Path.of(config.pythonPath()), cli = Path.of(config.cliPath()),
                    db = Path.of(config.databasePath()), output = Path.of(config.outputDir());
            String name = python.getFileName().toString().toLowerCase(Locale.ROOT);
            return Set.of("python.exe", "python3.exe", "py.exe", "python", "python3", "python3.11").contains(name)
                    && python.isAbsolute() && Files.isRegularFile(python) && Files.isExecutable(python)
                    && cli.isAbsolute() && Files.isRegularFile(cli) && cli.getFileName().toString().equals("export_tw_readonly.py")
                    && db.isAbsolute() && output.isAbsolute() && config.timeoutSeconds() >= 1 && config.timeoutSeconds() <= 30;
            // Missing DB/output remain source-declared UNAVAILABLE; this adapter never creates them.
        } catch (RuntimeException e) { return false; }
    }
    public ObjectNode read(String date) {
        TwStocksProjection.date(date);
        if (!config.enabled()) return failure(date, "UNAVAILABLE", "SOURCE_DISABLED");
        if (!configured()) return failure(date, "UNAVAILABLE", "SOURCE_NOT_CONFIGURED");
        if (!slots.tryAcquire()) return failure(date, "UNAVAILABLE", "SOURCE_BUSY");
        Process process = null;
        Thread stdout = null, stderr = null;
        try {
            process = start(command(date));
            process.getOutputStream().close();
            var out = new InsiderSignalsAdapter.Capture(process.getInputStream(), MAX_STDOUT);
            var err = new InsiderSignalsAdapter.Capture(process.getErrorStream(), MAX_STDERR);
            stdout = Thread.startVirtualThread(out); stderr = Thread.startVirtualThread(err);
            if (!process.waitFor(config.timeoutSeconds(), TimeUnit.SECONDS)) {
                stop(process); return failure(date, "UNAVAILABLE", "SOURCE_TIMEOUT");
            }
            stdout.join(1000); stderr.join(1000);
            if (stdout.isAlive() || stderr.isAlive() || out.failed || err.failed)
                return failure(date, "ERROR", "SOURCE_OUTPUT_ERROR");
            if (out.overflow || err.overflow) return failure(date, "ERROR", "SOURCE_OUTPUT_LIMIT");
            int exit = process.exitValue();
            if (exit != 0 && exit != 2) return failure(date, "UNAVAILABLE", "SOURCE_READ_FAILED");
            String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(out.bytes.toByteArray())).toString();
            JsonNode source = json.readTree(text);
            if (exit == 2 && source != null && source.isObject() && source.size() == 1
                    && "TARGET_DATE_INVALID".equals(source.path("error").asText()))
                return failure(date, "ERROR", "SOURCE_TARGET_DATE_INVALID");
            return TwStocksProjection.normalize(source, date, exit, json);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); return failure(date, "UNAVAILABLE", "SOURCE_INTERRUPTED");
        } catch (TwStocksProjection.Unsupported e) {
            return failure(date, "ERROR", "SOURCE_CONTRACT_UNSUPPORTED");
        } catch (com.fasterxml.jackson.core.JsonProcessingException | CharacterCodingException e) {
            return failure(date, "ERROR", "SOURCE_INVALID_OUTPUT");
        } catch (IOException e) {
            return failure(date, "UNAVAILABLE", "SOURCE_READ_FAILED");
        } catch (RuntimeException e) {
            return failure(date, "ERROR", "SOURCE_INVALID_OUTPUT");
        } finally {
            if (process != null) { stop(process); close(process.getInputStream()); close(process.getErrorStream()); }
            if (stdout != null) stdout.interrupt();
            if (stderr != null) stderr.interrupt();
            slots.release();
        }
    }
    Process start(List<String> command) throws IOException {
        var builder = new ProcessBuilder(command);
        builder.environment().put("PYTHONDONTWRITEBYTECODE", "1");
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        builder.environment().put("PYTHONUTF8", "1");
        return builder.start();
    }
    private static void stop(Process p) {
        p.descendants().forEach(ProcessHandle::destroyForcibly);
        if (p.isAlive()) p.destroyForcibly();
    }
    private static void close(InputStream s) { try { s.close(); } catch (IOException ignored) {} }
    private ObjectNode failure(String date, String state, String reason) {
        var r = TwStocksProjection.envelope(date, state, json);
        r.withArray("warnings").add(reason);
        return r;
    }
}
