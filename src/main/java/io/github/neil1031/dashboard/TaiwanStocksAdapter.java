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
        try {
            var output = BoundedSourceProcess.run(command(date), config.timeoutSeconds(), MAX_STDOUT, MAX_STDERR, this::start);
            int exit = output.exit();
            if (exit != 0 && exit != 2) return failure(date, "UNAVAILABLE", "SOURCE_READ_FAILED");
            String text = output.utf8();
            JsonNode source = json.readTree(text);
            if (exit == 2 && source != null && source.isObject() && source.size() == 1
                    && "TARGET_DATE_INVALID".equals(source.path("error").asText()))
                return failure(date, "ERROR", "SOURCE_TARGET_DATE_INVALID");
            return TwStocksProjection.normalize(source, date, exit, json);
        } catch (BoundedSourceProcess.Failure e) {
            return failure(date, e.code.equals("SOURCE_TIMEOUT") ? "UNAVAILABLE" : "ERROR", e.code);
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
            slots.release();
        }
    }
    Process start(List<String> command) throws IOException {
        return BoundedSourceProcess.start(command);
    }
    private ObjectNode failure(String date, String state, String reason) {
        var r = TwStocksProjection.envelope(date, state, json);
        r.withArray("warnings").add(reason);
        return r;
    }
}
