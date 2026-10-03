package io.github.neil1031.dashboard;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.util.*;

@Service
public class PerformanceAdapter {
    private final InsiderProperties config;
    private final InsiderSignalsAdapter insider;
    private final ObjectMapper json;
    public PerformanceAdapter(InsiderProperties config, InsiderSignalsAdapter insider, ObjectMapper json) {
        this.config = config; this.insider = insider;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    List<String> command(PerformanceProjection.Query q) {
        var args = new ArrayList<>(List.of(config.cliPath(), "--db", config.databasePath()));
        switch (q.operation()) {
            case SUMMARY -> { args.addAll(List.of("read-performance-summary", "--horizon", q.horizon()));
                if (q.minInvestment() != null) args.addAll(List.of("--min-investment", q.minInvestment().toString()));
                if (q.minSignal() != null) args.addAll(List.of("--min-signal", q.minSignal().toString())); }
            case LIST -> { args.addAll(List.of("list-performance", "--horizon", q.horizon(), "--limit", String.valueOf(q.limit()), "--offset", String.valueOf(q.offset())));
                if (q.ticker() != null) args.addAll(List.of("--ticker", q.ticker())); }
            case DETAIL -> args.addAll(List.of("get-performance", "--signal-id", q.signalId()));
        }
        return args;
    }
    ObjectNode read(PerformanceProjection.Query q) {
        if (!config.enabled()) return failure(q, "UNAVAILABLE", "SOURCE_DISABLED");
        if (!insider.configured()) return failure(q, "UNAVAILABLE", "SOURCE_NOT_CONFIGURED");
        if (!insider.acquireSlot()) return failure(q, "UNAVAILABLE", "SOURCE_BUSY");
        try {
            var out = BoundedSourceProcess.run(command(q), config.timeoutSeconds(), InsiderSignalsAdapter.MAX_STDOUT, InsiderSignalsAdapter.MAX_STDERR, this::start);
            if (out.exit() != 0) return failure(q, "UNAVAILABLE", "SOURCE_READ_FAILED");
            return PerformanceProjection.normalize(json.readTree(out.utf8()), q, json);
        } catch (BoundedSourceProcess.Failure e) { return failure(q, e.code.equals("SOURCE_TIMEOUT") ? "UNAVAILABLE" : "ERROR", e.code);
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return failure(q, "UNAVAILABLE", "SOURCE_INTERRUPTED");
        } catch (PerformanceProjection.Unsupported e) { return failure(q, "UNAVAILABLE", "SOURCE_CONTRACT_UNSUPPORTED");
        } catch (com.fasterxml.jackson.core.JsonProcessingException | java.nio.charset.CharacterCodingException e) { return failure(q, "ERROR", "SOURCE_INVALID_OUTPUT");
        } catch (IOException e) { return failure(q, "UNAVAILABLE", "SOURCE_READ_FAILED");
        } catch (RuntimeException e) { return failure(q, "ERROR", "SOURCE_INVALID_OUTPUT");
        } finally { insider.releaseSlot(); }
    }
    Process start(List<String> args) throws IOException { return BoundedSourceProcess.start(args); }
    private ObjectNode failure(PerformanceProjection.Query q, String state, String code) {
        var out = PerformanceProjection.envelope(q, state, json); out.withArray("warnings").add(code); return out;
    }
}
