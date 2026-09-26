package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.github.neil1031.dashboard.runner.RunnerReceiptService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static io.github.neil1031.dashboard.OccurrenceCorrelation.*;
import static org.assertj.core.api.Assertions.*;

class OccurrenceCorrelationTest {
    private final ObjectMapper json = new ObjectMapper();
    private final JobNormalizer normalizer = new JobNormalizer();
    private static final Instant START = Instant.parse("2026-09-27T16:00:00Z");
    private static final Instant END = Instant.parse("2026-09-28T16:00:00Z");

    private ObjectNode task(String name) throws Exception {
        var inventory = json.readTree(getClass().getResourceAsStream("/fixtures/schedule-inventory.json"));
        for (var row : inventory.path("tasks")) if (row.path("TaskName").asText().equals(name)) return (ObjectNode) row.deepCopy();
        throw new IllegalArgumentException(name);
    }

    private Version version(long id, ObjectNode row, Instant first, Instant last, Instant previous) {
        var definition = ScheduleDefinition.from(normalizer.normalize(row), "Taipei Standard Time");
        return new Version(id, "job", definition.json(), first, last, previous);
    }

    private Version market() throws Exception {
        return version(1, task("InsiderTracker-Market"), START.minusSeconds(3600), END.plusSeconds(3600), null);
    }

    private ExecutionEvidence run(String id, String localTime, ExecutionOutcome outcome, Source source) {
        Instant at = java.time.OffsetDateTime.parse(localTime + "+08:00").toInstant();
        return new ExecutionEvidence(id, "job", at, outcome, source, "\\Market", "market-profile");
    }

    private CorrelationResult one(List<Version> versions, ExecutionEvidence run) {
        return correlate(versions, List.of(run)).getFirst();
    }

    @Test void liveFixturesGenerateDailyWeeklyAndIndependentWeekdayTriggers() throws Exception {
        for (String name : List.of("InsiderTracker-Market", "InsiderTracker-SyncImport", "InsiderTracker-SEC")) {
            var generated = generate(version(1, task(name), START, END, null), START, END);
            assertThat(generated.diagnostics()).isEmpty();
            assertThat(generated.occurrences()).hasSize(1);
        }
        var doubleRun = generate(version(2, task("AIStockHunter-UnexplainedVolume-Daily"), START, END, null), START, END);
        assertThat(doubleRun.occurrences()).hasSize(2);
        assertThat(doubleRun.occurrences()).extracting(NominalOccurrence::scheduledFor)
                .containsExactly(Instant.parse("2026-09-28T06:30:00Z"), Instant.parse("2026-09-28T09:00:00Z"));
        assertThat(doubleRun.occurrences()).extracting(NominalOccurrence::occurrenceId).doesNotHaveDuplicates();
        assertThat(generate(version(3, task("AIStockHunter-Accumulation-Weekly-Check"), START, END, null), START, END)
                .occurrences()).isEmpty(); // Monday is not Friday.
        var friday = generate(version(3, task("AIStockHunter-Accumulation-Weekly-Check"), START, END, null),
                Instant.parse("2026-10-02T00:00:00Z"), Instant.parse("2026-10-03T00:00:00Z"));
        assertThat(friday.occurrences()).hasSize(1);
        assertThat(friday.occurrences().getFirst().scheduledFor()).isEqualTo(Instant.parse("2026-10-02T14:00:00Z"));
        assertThat(doubleRun.occurrences().toString()).doesNotContain("13:35");
    }

    @Test void occurrenceIdAndTimezoneAreStableAndGraceIsSeparate() throws Exception {
        var version = market();
        var a = generate(version, START, END).occurrences().getFirst();
        var b = generate(version, START, END).occurrences().getFirst();
        assertThat(a.occurrenceId()).isEqualTo(b.occurrenceId()).hasSize(64);
        assertThat(a.scheduledFor()).isEqualTo(Instant.parse("2026-09-27T22:30:00Z"));
        assertThat(a.timezoneResolution()).isEqualTo("EXPLICIT_OFFSET");
        assertThat(a.windowEnd()).isEqualTo(a.scheduledFor().plusSeconds(300));
        assertThat(a.graceUntil()).isEqualTo(a.scheduledFor().plusSeconds(900));
    }

    @Test void intervalAndDuplicateTriggerIdentityArePreserved() throws Exception {
        ObjectNode everyOtherDay = task("InsiderTracker-Market");
        ((ObjectNode) everyOtherDay.path("Triggers").get(0)).put("DaysInterval", 2);
        assertThat(generate(version(1, everyOtherDay, START, END, null), START, END).occurrences()).isEmpty();
        ObjectNode twoWeeks = task("AIStockHunter-Accumulation-Weekly-Check");
        ((ObjectNode) twoWeeks.path("Triggers").get(0)).put("WeeksInterval", 2);
        assertThat(generate(version(2, twoWeeks, START, END, null),
                Instant.parse("2026-10-02T00:00:00Z"), Instant.parse("2026-10-03T00:00:00Z")).occurrences()).hasSize(1);
        assertThat(generate(version(2, twoWeeks, START, END, null),
                Instant.parse("2026-10-09T00:00:00Z"), Instant.parse("2026-10-10T00:00:00Z")).occurrences()).isEmpty();
        ObjectNode duplicate = task("InsiderTracker-Market");
        duplicate.withArray("Triggers").add(duplicate.path("Triggers").get(0).deepCopy());
        var generated = generate(version(3, duplicate, START, END, null), START, END);
        assertThat(generated.occurrences()).hasSize(2);
        assertThat(generated.occurrences()).extracting(NominalOccurrence::occurrenceId).doesNotHaveDuplicates();
        var duplicateResult = one(List.of(version(3, duplicate, START, END, null)),
                run("duplicate", "2026-09-28T06:31:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(duplicateResult.state()).isEqualTo(State.AMBIGUOUS);
    }

    @Test void normalFailedManualAndRunnerOnlyCases() throws Exception {
        var schedule = market();
        assertThat(one(List.of(schedule), run("A", "2026-09-28T06:31:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)).state())
                .isEqualTo(State.CORRELATED);
        var failed = one(List.of(schedule), run("B", "2026-09-28T06:30:00", ExecutionOutcome.EXECUTED_FAILED, Source.RUNNER));
        assertThat(failed.state()).isEqualTo(State.CORRELATED);
        assertThat(failed.executionOutcome()).isEqualTo(ExecutionOutcome.EXECUTED_FAILED);
        assertThat(one(List.of(schedule), run("C", "2026-09-28T09:00:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.MANUAL)).state())
                .isEqualTo(State.UNMATCHED);
        assertThat(one(List.of(schedule), run("outside", "2026-09-28T12:00:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)).state())
                .isEqualTo(State.UNMATCHED);
    }

    @Test void multiTriggerWindowCompetitionNeverAssignsTwoOccurrences() throws Exception {
        var schedule = version(2, task("AIStockHunter-UnexplainedVolume-Daily"), START, END, null);
        var early = one(List.of(schedule), run("D", "2026-09-28T14:32:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(early.state()).isEqualTo(State.CORRELATED);
        var overlap = one(List.of(schedule), run("E", "2026-09-28T16:58:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(overlap.state()).isEqualTo(State.AMBIGUOUS);
        assertThat(overlap.reason()).isEqualTo(Reason.MULTIPLE_CANDIDATES);
        assertThat(overlap.candidateOccurrenceIds()).hasSize(2);
        assertThat(overlap.occurrenceId()).isNull();
        var later = one(List.of(schedule), run("F", "2026-09-28T17:02:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.RUNNER));
        assertThat(later.state()).isEqualTo(State.CORRELATED);
        assertThat(later.occurrenceId()).isNotEqualTo(early.occurrenceId());
        var catchUp = one(List.of(schedule), run("late", "2026-09-28T17:20:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(catchUp.state()).isEqualTo(State.INSUFFICIENT_EVIDENCE);
        assertThat(catchUp.reason()).isEqualTo(Reason.LATE_CATCH_UP_UNPROVEN);
        assertThat(one(List.of(schedule), run("manualEarly", "2026-09-28T14:10:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.MANUAL)).state())
                .isEqualTo(State.UNMATCHED);
    }

    @Test void scheduleChangeGapIsAmbiguousAndObservedSameVersionWorks() throws Exception {
        ObjectNode oldRow = task("InsiderTracker-Market");
        ObjectNode newRow = task("InsiderTracker-Market");
        ((ObjectNode) newRow.path("Triggers").get(0)).put("StartBoundary", "2026-09-19T07:30:00+08:00");
        Instant six = Instant.parse("2026-09-27T22:00:00Z");
        Instant seven = Instant.parse("2026-09-27T23:00:00Z");
        Version old = version(1, oldRow, START.minusSeconds(3600), six, null);
        Version newer = version(2, newRow, seven, END, six);
        var gap = one(List.of(old, newer), run("G", "2026-09-28T06:31:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(gap.state()).isEqualTo(State.AMBIGUOUS);
        assertThat(gap.reason()).isEqualTo(Reason.AMBIGUOUS_SCHEDULE_VERSION);
        assertThat(gap.occurrenceId()).isNull();
        assertThat(one(List.of(newer), run("same", "2026-09-28T07:31:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)).state())
                .isEqualTo(State.CORRELATED);
        assertThat(one(List.of(), run("H", "2026-09-28T06:31:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)).state())
                .isEqualTo(State.INSUFFICIENT_EVIDENCE);
    }

    @Test void retriesKeepFirstValidPrimaryAndCombinedEvidenceRequiresUniqueMapping() throws Exception {
        var first = run("scheduler", "2026-09-28T06:30:05", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER);
        var runner = run("runner", "2026-09-28T06:30:07", ExecutionOutcome.EXECUTED_SUCCESS, Source.RUNNER);
        var joined = combine(List.of(first), List.of(runner), Map.of("\\Market", "market-profile"));
        assertThat(joined).hasSize(1);
        assertThat(joined.getFirst().source()).isEqualTo(Source.COMBINED);
        assertThat(joined.getFirst().outcome()).isEqualTo(ExecutionOutcome.EXECUTED_SUCCESS);
        assertThat(combine(List.of(first), List.of(runner), Map.of())).hasSize(2);
        assertThat(combine(List.of(first), List.of(run("conflict", "2026-09-28T06:30:07",
                ExecutionOutcome.EXECUTED_FAILED, Source.RUNNER)), Map.of("\\Market", "market-profile"))).hasSize(2);
        assertThat(combine(List.of(first, run("competing", "2026-09-28T06:30:08", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)),
                List.of(runner), Map.of("\\Market", "market-profile"))).hasSize(3);
        var results = correlate(List.of(market()), List.of(first, runner));
        assertThat(results).extracting(CorrelationResult::relation).containsExactly("PRIMARY_EXECUTION", "ADDITIONAL_EXECUTION");
    }

    @Test void unsupportedAndIncompleteEvidenceStayNonCorrelated() throws Exception {
        ObjectNode oneTime = task("InsiderTracker-Market");
        ((ObjectNode) oneTime.path("Triggers").get(0)).put("type", "MSFT_TaskTimeTrigger");
        assertThat(one(List.of(version(1, oneTime, START, END, null)),
                run("one", "2026-09-28T06:30:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER)).state())
                .isEqualTo(State.UNSUPPORTED);
        ObjectNode offsetless = task("InsiderTracker-Market");
        ((ObjectNode) offsetless.path("Triggers").get(0)).put("StartBoundary", "2026-09-19T06:30:00");
        var unresolved = one(List.of(version(1, offsetless, START, END, null)),
                run("zone", "2026-09-28T06:30:00", ExecutionOutcome.EXECUTED_SUCCESS, Source.SCHEDULER));
        assertThat(unresolved.state()).isEqualTo(State.UNSUPPORTED);
        assertThat(unresolved.reason()).isEqualTo(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION);
        assertThat(one(List.of(market()), run("incomplete", "2026-09-28T06:30:00", ExecutionOutcome.INCOMPLETE, Source.RUNNER)).state())
                .isEqualTo(State.INSUFFICIENT_EVIDENCE);
        assertThat(java.util.Arrays.toString(State.values())).doesNotContain("MISSED");
    }

    @Test void runnerAdapterRequiresExactMappingAndChildStart() throws Exception {
        var mapping = new RunnerReceiptService.JobExecutions("\\Market", "market-profile", "job", "AVAILABLE",
                "COMPLETE", null, List.of(), List.of());
        var started = new RunnerReceiptService.Execution("execution-1", "job", "market-profile", "TERMINAL",
                "2026-09-27T22:30:00Z", "2026-09-27T22:30:02Z", "2026-09-27T22:30:10Z",
                8000L, true, 1, 1, "FAILED", "COMPLETE", "primary", null, List.of(), List.of());
        var execution = fromRunner(mapping, started);
        assertThat(execution.startedAt()).isEqualTo(Instant.parse("2026-09-27T22:30:02Z"));
        assertThat(one(List.of(market()), execution).executionOutcome()).isEqualTo(ExecutionOutcome.EXECUTED_FAILED);
        var noChild = new RunnerReceiptService.Execution("execution-2", "job", "market-profile", "TERMINAL",
                "2026-09-27T22:30:00Z", null, "2026-09-27T22:30:10Z", 10000L,
                false, null, 127, "START_FAILED", "NEVER_STARTED_CHILD", "primary", null, List.of(), List.of());
        assertThat(one(List.of(market()), fromRunner(mapping, noChild)).state()).isEqualTo(State.INSUFFICIENT_EVIDENCE);
        assertThatThrownBy(() -> fromRunner(new RunnerReceiptService.JobExecutions("\\Other", "other", "job",
                "AVAILABLE", "COMPLETE", null, List.of(), List.of()), started)).isInstanceOf(IllegalArgumentException.class);
    }
}
