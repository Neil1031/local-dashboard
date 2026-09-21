package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;

public interface SchedulerCollector {
    JsonNode collect();
}
