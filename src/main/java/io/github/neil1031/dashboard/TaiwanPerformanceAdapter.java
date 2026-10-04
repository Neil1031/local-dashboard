package io.github.neil1031.dashboard;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.charset.CharacterCodingException;
import java.nio.file.*;
import java.util.*;

/** Fixed source-owned read operations only; shares Taiwan's two process slots. */
@Service
public class TaiwanPerformanceAdapter {
    static final int MAX_STDOUT = 1024 * 1024, MAX_STDERR = 64 * 1024;
    private final TaiwanProperties config;
    private final TaiwanStocksAdapter gate;
    private final ObjectMapper json;
    public TaiwanPerformanceAdapter(TaiwanProperties config, TaiwanStocksAdapter gate, ObjectMapper json) {
        this.config = config; this.gate = gate;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    List<String> command(TwPerformanceProjection.Query query) {
        var args = new ArrayList<String>(); args.add(config.pythonPath());
        if (Path.of(config.pythonPath()).getFileName().toString().equalsIgnoreCase("py.exe")) args.add("-3.11");
        args.addAll(List.of("-B", config.performanceCliPath(), "--db", config.databasePath(), "list",
                "--start-date", query.startDate(), "--end-date", query.endDate(),
                "--limit", "" + query.limit(), "--offset", "" + query.offset()));
        return args;
    }
    private boolean configured() {
        try {
            Path python = Path.of(config.pythonPath()), cli = Path.of(config.performanceCliPath());
            return Set.of("python.exe", "python3.exe", "py.exe", "python", "python3", "python3.11")
                    .contains(python.getFileName().toString().toLowerCase(Locale.ROOT))
                    && python.isAbsolute() && Files.isRegularFile(python) && Files.isExecutable(python)
                    && cli.isAbsolute() && Files.isRegularFile(cli) && cli.getFileName().toString().equals("export_tw_observed_performance.py")
                    && Path.of(config.databasePath()).isAbsolute()
                    && config.timeoutSeconds() >= 1 && config.timeoutSeconds() <= 30;
        } catch (RuntimeException e) { return false; }
    }
    public ObjectNode list(String startDate, String endDate, int limit, int offset) {
        return read(TwPerformanceProjection.Query.list(startDate, endDate, limit, offset));
    }
    private ObjectNode read(TwPerformanceProjection.Query query) {
        if (!config.enabled()) return failure(query, "UNAVAILABLE", "SOURCE_DISABLED");
        if (!configured()) return failure(query, "UNAVAILABLE", "SOURCE_NOT_CONFIGURED");
        if (!gate.acquireSlot()) return failure(query, "UNAVAILABLE", "SOURCE_BUSY");
        try {
            var output = BoundedSourceProcess.run(command(query), config.timeoutSeconds(), MAX_STDOUT, MAX_STDERR, this::start);
            if (output.exit() != 0 && output.exit() != 2) return failure(query, "UNAVAILABLE", "SOURCE_READ_FAILED");
            return TwPerformanceProjection.normalize(json.readTree(output.utf8()), query, output.exit(), json);
        } catch (BoundedSourceProcess.Failure e) {
            return failure(query, e.code.equals("SOURCE_TIMEOUT") ? "UNAVAILABLE" : "ERROR", e.code);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); return failure(query, "UNAVAILABLE", "SOURCE_INTERRUPTED");
        } catch (TwPerformanceProjection.Unsupported e) {
            return failure(query, "ERROR", "SOURCE_CONTRACT_UNSUPPORTED");
        } catch (com.fasterxml.jackson.core.JsonProcessingException | CharacterCodingException e) {
            return failure(query, "ERROR", "SOURCE_INVALID_OUTPUT");
        } catch (IOException e) { return failure(query, "UNAVAILABLE", "SOURCE_READ_FAILED");
        } catch (RuntimeException e) { return failure(query, "ERROR", "SOURCE_INVALID_OUTPUT");
        } finally { gate.releaseSlot(); }
    }
    Process start(List<String> argv) throws IOException { return BoundedSourceProcess.start(argv); }
    private ObjectNode failure(TwPerformanceProjection.Query query, String state, String reason) {
        var result = TwPerformanceProjection.envelope(query, state, json); result.withArray("warnings").add(reason); return result;
    }
}
