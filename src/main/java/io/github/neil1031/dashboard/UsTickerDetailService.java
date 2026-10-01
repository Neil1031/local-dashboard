package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.Set;
import java.util.function.Supplier;

/** Two existing normalized reads, kept separate. Ticker is a filter, never a linking identity. */
@Service
public class UsTickerDetailService {
    private static final Set<String> STATES = Set.of("READY", "EMPTY", "UNAVAILABLE", "ERROR");
    private final InsiderSignalsAdapter adapter;
    private final ObjectMapper json;
    public UsTickerDetailService(InsiderSignalsAdapter adapter, ObjectMapper json) { this.adapter = adapter; this.json = json; }

    public ObjectNode read(String inputTicker, int signalsLimit, int signalsOffset, int secLimit, int secOffset) {
        String ticker = InsiderSignalsAdapter.ticker(inputTicker);
        if (ticker == null) throw new IllegalArgumentException();
        bounds(signalsLimit, signalsOffset); bounds(secLimit, secOffset);
        // Sequential calls retain the adapter's existing process, semaphore and timeout bounds.
        var signals = section(() -> adapter.read(ticker, signalsLimit, signalsOffset), "reports", ticker, signalsLimit, signalsOffset);
        var sec = section(() -> adapter.readSec(ticker, secLimit, secOffset), "sec", ticker, secLimit, secOffset);
        var response = json.createObjectNode().put("contractVersion", 1).put("ticker", ticker)
                .put("observedAt", Instant.now().toString()).put("dataState", aggregate(signals.path("dataState").textValue(), sec.path("dataState").textValue()));
        response.putObject("sections").set("signals", signals);
        response.withObject("sections").set("secTransactions", sec);
        response.putArray("warnings").add("SAME_TICKER_IS_NOT_EVENT_LINKAGE").add("PAGES_ARE_NOT_COMPLETE_POPULATION").add("NOT_PIT_SNAPSHOT");
        return response;
    }
    private static void bounds(int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0 || offset > InsiderSignalsAdapter.MAX_OFFSET) throw new IllegalArgumentException();
    }
    static String aggregate(String signals, String sec) {
        boolean a = usable(signals), b = usable(sec);
        if (a && b) return signals.equals("EMPTY") && sec.equals("EMPTY") ? "EMPTY" : "READY";
        if (a || b) return "PARTIAL";
        return signals.equals("ERROR") || sec.equals("ERROR") ? "ERROR" : "UNAVAILABLE";
    }
    private static boolean usable(String state) { return state.equals("READY") || state.equals("EMPTY"); }
    private ObjectNode section(Supplier<ObjectNode> read, String source, String ticker, int limit, int offset) {
        try {
            ObjectNode result = read.get();
            if (!valid(result, source, ticker, limit, offset)) return error(source, limit, offset);
            return result.deepCopy();
        } catch (RuntimeException ignored) { return error(source, limit, offset); }
    }
    private static boolean valid(ObjectNode n, String source, String ticker, int limit, int offset) {
        if (n == null || !n.path("contractVersion").isIntegralNumber() || n.path("contractVersion").asInt() != 1
                || !n.path("dataState").isTextual() || !STATES.contains(n.path("dataState").textValue())
                || !n.path("items").isArray() || !n.path("sources").isArray() || !n.path("warnings").isArray()
                || !n.path("observedAt").isTextual() || !n.path("page").isObject()) return false;
        try { Instant.parse(n.path("observedAt").textValue()); } catch (RuntimeException ignored) { return false; }
        String state = n.path("dataState").textValue(); JsonNode page = n.path("page");
        if (!integer(page.path("limit"), limit) || !integer(page.path("offset"), offset)
                || !page.path("hasMore").isBoolean() || n.path("items").size() > limit
                || state.equals("READY") != !n.path("items").isEmpty()) return false;
        boolean more = page.path("hasMore").booleanValue();
        if (more ? !state.equals("READY") || n.path("items").size() != limit || offset + limit > InsiderSignalsAdapter.MAX_OFFSET
                || !integer(page.path("nextOffset"), offset + limit) : !page.path("nextOffset").isNull()) return false;
        boolean sourceFound = false;
        for (JsonNode s : n.path("sources")) if (s.path("sourceId").asText().equals("insider-" + source) && integer(s.path("sourceVersion"), 1)) sourceFound = true;
        if (!sourceFound) return false;
        for (JsonNode warning : n.path("warnings")) if (!warning.isTextual()) return false;
        for (JsonNode item : n.path("items")) {
            if (!item.isObject() || !item.path("signalId").isTextual()
                    || !item.path("signalId").textValue().startsWith(source.equals("reports") ? "report:" : "sec:")
                    || !item.path("ticker").isTextual() || !item.path("ticker").textValue().equalsIgnoreCase(ticker)) return false;
        }
        return true;
    }
    private static boolean integer(JsonNode n, int value) { return n.isIntegralNumber() && n.canConvertToInt() && n.intValue() == value; }
    private ObjectNode error(String source, int limit, int offset) {
        var result = json.createObjectNode().put("contractVersion", 1).put("dataState", "ERROR").put("observedAt", Instant.now().toString());
        result.putArray("items");
        result.putObject("page").put("limit", limit).put("offset", offset).put("hasMore", false).putNull("nextOffset");
        result.putArray("sources").addObject().put("sourceId", "insider-" + source).put("sourceVersion", 1)
                .put("sourceType", source.equals("reports") ? "Imported AI report" : "SEC Transactions · partial").putNull("lastObservedAt");
        result.putArray("warnings").add("SOURCE_SECTION_INVALID");
        if (source.equals("sec")) result.withArray("warnings").add("SEC_PARTIAL_NOT_RECONCILED_OR_CERTIFIED");
        return result;
    }
}
