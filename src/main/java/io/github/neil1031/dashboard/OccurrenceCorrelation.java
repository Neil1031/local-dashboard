package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.neil1031.dashboard.runner.RunnerReceiptService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/** Recomputable, read-only shadow inference. It never evaluates missing executions. */
public final class OccurrenceCorrelation {
    private OccurrenceCorrelation() {}
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Duration EARLY = Duration.ofMinutes(2);
    private static final Duration NORMAL_LATE = Duration.ofMinutes(5);
    private static final Duration POSSIBLE_CATCH_UP = Duration.ofHours(3);
    private static final Duration MISSED_GRACE_CONTEXT = Duration.ofMinutes(15);

    public record Version(long id, String jobId, String definitionJson, Instant firstObservedAt,
                          Instant lastObservedAt, Instant previousLastObservedAt) {}
    public record NominalOccurrence(String occurrenceId, String jobId, long scheduleVersionId,
                                    String triggerIdentity, Instant scheduledFor, Instant windowStart,
                                    Instant windowEnd, Instant graceUntil, String timezoneResolution,
                                    boolean startWhenAvailable) {}
    public enum State { CORRELATED, AMBIGUOUS, UNMATCHED, UNSUPPORTED, INSUFFICIENT_EVIDENCE }
    public enum Reason { UNIQUE_WINDOW, EARLY_UNPROVEN, MULTIPLE_CANDIDATES, LATE_CATCH_UP_UNPROVEN,
        UNMATCHED_EXECUTION, UNSUPPORTED_TRIGGER, UNSUPPORTED_TIMEZONE_RESOLUTION,
        AMBIGUOUS_SCHEDULE_VERSION, NO_SCHEDULE_HISTORY, OUTSIDE_OBSERVED_HISTORY,
        INCOMPLETE_EXECUTION_EVIDENCE }
    public enum Source { SCHEDULER, RUNNER, COMBINED, MANUAL }
    public enum ExecutionOutcome { EXECUTED_SUCCESS, EXECUTED_FAILED, INCOMPLETE, UNKNOWN }
    public record ExecutionEvidence(String evidenceId, String schedulerJobId, String schedulerTask,
                                    String runnerJobId, String profileId, String runnerExecutionId,
                                    Instant startedAt, ExecutionOutcome outcome, Source source) {}
    public record CorrelationResult(String evidenceId, State state, Reason reason,
                                    String occurrenceId, List<String> candidateOccurrenceIds,
                                    ExecutionOutcome executionOutcome, String relation) {}
    public record Generation(List<NominalOccurrence> occurrences, List<Reason> diagnostics) {}

    /** The date range is bounded because this is an internal diagnostic, not an unbounded scheduler. */
    public static Generation generate(Version version, Instant from, Instant to) {
        Objects.requireNonNull(version);
        if (from == null || to == null || !from.isBefore(to)
                || Duration.between(from, to).compareTo(Duration.ofDays(32)) > 0)
            throw new IllegalArgumentException("Occurrence range must be positive and at most 32 days");
        List<NominalOccurrence> found = new ArrayList<>();
        List<Reason> diagnostics = new ArrayList<>();
        try {
            JsonNode root = JSON.readTree(version.definitionJson());
            if (!root.path("enabled").asBoolean(false)) return new Generation(List.of(), List.of());
            JsonNode triggers = root.path("triggers");
            if (!triggers.isArray()) return new Generation(List.of(), List.of(Reason.UNSUPPORTED_TRIGGER));
            for (JsonNode trigger : triggers) {
                if (!trigger.path("Enabled").asBoolean(true)) continue;
                String type = trigger.path("type").asText();
                if (!(type.equals("MSFT_TaskDailyTrigger") || type.equals("MSFT_TaskWeeklyTrigger"))
                        || trigger.has("Repetition") || trigger.has("RandomDelay") || trigger.has("Delay")) {
                    diagnostics.add(Reason.UNSUPPORTED_TRIGGER); continue;
                }
                if (!"EXPLICIT_OFFSET".equals(trigger.path("StartBoundaryResolution").asText())) {
                    diagnostics.add(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION); continue;
                }
                final OffsetDateTime boundary;
                try { boundary = OffsetDateTime.parse(trigger.path("StartBoundary").asText()); }
                catch (DateTimeParseException invalid) {
                    diagnostics.add(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION); continue;
                }
                int interval = type.equals("MSFT_TaskDailyTrigger")
                        ? trigger.path("DaysInterval").asInt(1) : trigger.path("WeeksInterval").asInt(1);
                int mask = trigger.path("DaysOfWeek").asInt(0);
                if (interval < 1 || interval > 365 || (type.equals("MSFT_TaskWeeklyTrigger") && (mask < 1 || mask > 127))) {
                    diagnostics.add(Reason.UNSUPPORTED_TRIGGER); continue;
                }
                Instant end = null;
                if (trigger.has("EndBoundary")) {
                    if (!"EXPLICIT_OFFSET".equals(trigger.path("EndBoundaryResolution").asText())) {
                        diagnostics.add(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION); continue;
                    }
                    try { end = OffsetDateTime.parse(trigger.path("EndBoundary").asText()).toInstant(); }
                    catch (DateTimeParseException invalid) {
                        diagnostics.add(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION); continue;
                    }
                }
                String identity = "index:" + trigger.path("indexWithinVersion").asInt(-1)
                        + (trigger.hasNonNull("Id") ? ":" + trigger.path("Id").asText() : "");
                if (trigger.path("indexWithinVersion").asInt(-1) < 0) {
                    diagnostics.add(Reason.UNSUPPORTED_TRIGGER); continue;
                }
                LocalDate first = from.atOffset(boundary.getOffset()).toLocalDate().minusDays(1);
                LocalDate last = to.atOffset(boundary.getOffset()).toLocalDate().plusDays(1);
                for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
                    long days = ChronoUnit.DAYS.between(boundary.toLocalDate(), date);
                    if (days < 0) continue;
                    if (type.equals("MSFT_TaskDailyTrigger")) {
                        if (days % interval != 0) continue;
                    } else {
                        int dayBit = 1 << (date.getDayOfWeek().getValue() % 7);
                        long weeks = ChronoUnit.WEEKS.between(
                                boundary.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)),
                                date.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)));
                        if ((mask & dayBit) == 0 || weeks % interval != 0) continue;
                    }
                    Instant scheduled = OffsetDateTime.of(date, boundary.toLocalTime(), boundary.getOffset()).toInstant();
                    if (scheduled.isBefore(from) || !scheduled.isBefore(to) || (end != null && scheduled.isAfter(end))) continue;
                    String key = version.jobId() + "\n" + version.id() + "\n" + identity + "\n" + scheduled;
                    found.add(new NominalOccurrence(sha256(key), version.jobId(), version.id(), identity,
                            scheduled, scheduled.minus(EARLY), scheduled.plus(NORMAL_LATE),
                            scheduled.plus(MISSED_GRACE_CONTEXT), "EXPLICIT_OFFSET", root.path("StartWhenAvailable").asBoolean(false)));
                }
            }
        } catch (Exception invalid) { return new Generation(List.of(), List.of(Reason.UNSUPPORTED_TRIGGER)); }
        found.sort(Comparator.comparing(NominalOccurrence::scheduledFor).thenComparing(NominalOccurrence::occurrenceId));
        return new Generation(List.copyOf(found), List.copyOf(diagnostics));
    }

    public static List<CorrelationResult> correlate(List<Version> versions, List<ExecutionEvidence> evidence) {
        Map<String, List<Version>> byJob = new HashMap<>();
        for (Version version : versions) byJob.computeIfAbsent(version.jobId(), unused -> new ArrayList<>()).add(version);
        List<ExecutionEvidence> ordered = evidence.stream().sorted(Comparator
                .comparing(ExecutionEvidence::startedAt, Comparator.nullsLast(Instant::compareTo))
                .thenComparing(ExecutionEvidence::evidenceId)).toList();
        Set<String> primary = new HashSet<>();
        List<CorrelationResult> results = new ArrayList<>();
        for (ExecutionEvidence run : ordered) {
            List<Version> history = byJob.getOrDefault(run.schedulerJobId(), List.of());
            if (history.isEmpty()) {
                results.add(result(run, State.INSUFFICIENT_EVIDENCE, Reason.NO_SCHEDULE_HISTORY, null, List.of(), null));
                continue;
            }
            if (run.outcome() == ExecutionOutcome.INCOMPLETE || run.startedAt() == null) {
                results.add(result(run, State.INSUFFICIENT_EVIDENCE, Reason.INCOMPLETE_EXECUTION_EVIDENCE, null, List.of(), null));
                continue;
            }
            if (run.source() == Source.MANUAL) {
                results.add(result(run, State.UNMATCHED, Reason.UNMATCHED_EXECUTION, null, List.of(), null));
                continue;
            }
            List<NominalOccurrence> candidates = new ArrayList<>();
            List<Reason> unsupported = new ArrayList<>();
            for (Version version : history) {
                Generation generated = generate(version, run.startedAt().minus(POSSIBLE_CATCH_UP).minus(NORMAL_LATE),
                        run.startedAt().plus(EARLY).plusSeconds(1));
                if (relevantUnsupportedVersion(version, run.startedAt()))
                    unsupported.addAll(generated.diagnostics());
                candidates.addAll(generated.occurrences());
            }
            candidates.sort(Comparator.comparing(NominalOccurrence::scheduledFor).thenComparing(NominalOccurrence::occurrenceId));
            List<NominalOccurrence> eligible = candidates.stream().filter(occurrence -> {
                Version own = history.stream().filter(v -> v.id() == occurrence.scheduleVersionId()).findFirst().orElseThrow();
                boolean observed = !occurrence.scheduledFor().isBefore(own.firstObservedAt())
                        && !occurrence.scheduledFor().isAfter(own.lastObservedAt());
                boolean inGap = history.stream().anyMatch(v -> v.previousLastObservedAt() != null
                        && occurrence.scheduledFor().isAfter(v.previousLastObservedAt())
                        && !occurrence.scheduledFor().isAfter(v.firstObservedAt()));
                return observed || inGap;
            }).toList();
            List<NominalOccurrence> possible = new ArrayList<>();
            boolean uncertainLate = false;
            boolean uncertainEarly = false;
            for (NominalOccurrence occurrence : eligible) {
                Instant next = eligible.stream().filter(other -> other.jobId().equals(occurrence.jobId())
                        && other.scheduledFor().isAfter(occurrence.scheduledFor()))
                        .map(NominalOccurrence::scheduledFor).min(Instant::compareTo).orElse(null);
                boolean normal = !run.startedAt().isBefore(occurrence.windowStart())
                        && !run.startedAt().isAfter(occurrence.windowEnd());
                Instant catchUpEnd = occurrence.scheduledFor().plus(POSSIBLE_CATCH_UP);
                if (next != null && next.isBefore(catchUpEnd)) catchUpEnd = next;
                boolean catchUp = occurrence.startWhenAvailable() && run.startedAt().isAfter(occurrence.windowEnd())
                        && run.startedAt().isBefore(catchUpEnd);
                if (!normal && !catchUp) continue;
                possible.add(occurrence);
                uncertainLate |= catchUp;
                uncertainEarly |= run.startedAt().isBefore(occurrence.scheduledFor());
            }
            List<String> ids = possible.stream().map(NominalOccurrence::occurrenceId).distinct().toList();
            boolean versionGap = history.stream().anyMatch(v -> v.previousLastObservedAt() != null
                    && run.startedAt().isAfter(v.previousLastObservedAt())
                    && !run.startedAt().isAfter(v.firstObservedAt()))
                    || possible.stream().anyMatch(o -> history.stream().anyMatch(v -> v.previousLastObservedAt() != null
                    && o.scheduledFor().isAfter(v.previousLastObservedAt())
                    && !o.scheduledFor().isAfter(v.firstObservedAt())));
            if (versionGap) results.add(result(run, State.AMBIGUOUS, Reason.AMBIGUOUS_SCHEDULE_VERSION, null, ids, null));
            else if (!unsupported.isEmpty()) results.add(result(run, State.UNSUPPORTED,
                    unsupported.contains(Reason.UNSUPPORTED_TIMEZONE_RESOLUTION)
                            ? Reason.UNSUPPORTED_TIMEZONE_RESOLUTION : Reason.UNSUPPORTED_TRIGGER, null, ids, null));
            else if (possible.size() > 1) results.add(result(run, State.AMBIGUOUS, Reason.MULTIPLE_CANDIDATES, null, ids, null));
            else if (possible.size() == 1 && uncertainLate) results.add(result(run, State.INSUFFICIENT_EVIDENCE,
                    Reason.LATE_CATCH_UP_UNPROVEN, null, ids, null));
            else if (possible.size() == 1 && uncertainEarly) results.add(result(run, State.AMBIGUOUS,
                    Reason.EARLY_UNPROVEN, null, ids, null));
            else if (possible.size() == 1) {
                NominalOccurrence only = possible.getFirst();
                Version version = history.stream().filter(v -> v.id() == only.scheduleVersionId()).findFirst().orElseThrow();
                if (only.scheduledFor().isBefore(version.firstObservedAt()) || only.scheduledFor().isAfter(version.lastObservedAt()))
                    results.add(result(run, State.INSUFFICIENT_EVIDENCE, Reason.OUTSIDE_OBSERVED_HISTORY, null, ids, null));
                else results.add(result(run, State.CORRELATED, Reason.UNIQUE_WINDOW, only.occurrenceId(), ids,
                        primary.add(only.occurrenceId()) ? "PRIMARY_EXECUTION" : "ADDITIONAL_EXECUTION"));
            } else if (history.stream().noneMatch(v -> !run.startedAt().isBefore(v.firstObservedAt())
                    && !run.startedAt().isAfter(v.lastObservedAt())))
                results.add(result(run, State.INSUFFICIENT_EVIDENCE, Reason.OUTSIDE_OBSERVED_HISTORY, null, ids, null));
            else results.add(result(run, State.UNMATCHED, Reason.UNMATCHED_EXECUTION, null, ids, null));
        }
        return List.copyOf(results);
    }

    private static boolean relevantUnsupportedVersion(Version version, Instant executionAt) {
        return !executionAt.isBefore(version.firstObservedAt().minus(EARLY))
                && !executionAt.isAfter(version.lastObservedAt().plus(POSSIBLE_CATCH_UP));
    }

    /** Join only mutually unique, mapped evidence. Timestamp proximity alone is insufficient. */
    public static List<ExecutionEvidence> combine(List<ExecutionEvidence> scheduler,
                                                   List<ExecutionEvidence> runner,
                                                   List<RunnerReceiptService.JobExecutions> trustedMappings) {
        List<ExecutionEvidence> combined = new ArrayList<>();
        Set<String> usedRunner = new HashSet<>();
        for (ExecutionEvidence scheduled : scheduler) {
            if (scheduled.source() != Source.SCHEDULER || scheduled.schedulerTask() == null
                    || scheduled.startedAt() == null || scheduled.outcome() == ExecutionOutcome.INCOMPLETE) {
                combined.add(scheduled); continue;
            }
            List<RunnerReceiptService.JobExecutions> mappings = trustedMappings.stream()
                    .filter(m -> "AVAILABLE".equals(m.profileStatus())
                            && Objects.equals(m.schedulerTask(), scheduled.schedulerTask())
                            && Objects.equals(scheduled.schedulerJobId(), canonicalMappingId(m.schedulerTask()))
                            && m.jobId() != null && !m.jobId().isBlank()
                            && m.profileId() != null && !m.profileId().isBlank()).toList();
            if (mappings.size() != 1) {
                combined.add(scheduled); continue;
            }
            RunnerReceiptService.JobExecutions mapping = mappings.getFirst();
            List<ExecutionEvidence> matching = runner.stream().filter(r -> r.source() == Source.RUNNER
                    && Objects.equals(r.schedulerJobId(), scheduled.schedulerJobId())
                    && Objects.equals(r.schedulerTask(), scheduled.schedulerTask())
                    && Objects.equals(r.runnerJobId(), mapping.jobId())
                    && Objects.equals(r.profileId(), mapping.profileId())
                    && r.runnerExecutionId() != null && r.startedAt() != null
                    && r.outcome() != ExecutionOutcome.INCOMPLETE && r.outcome() == scheduled.outcome()
                    && withinMergeWindow(r.startedAt(), scheduled.startedAt())).toList();
            if (matching.size() == 1) {
                ExecutionEvidence match = matching.getFirst();
                long competingScheduler = scheduler.stream().filter(s -> s.source() == Source.SCHEDULER
                        && Objects.equals(s.schedulerJobId(), scheduled.schedulerJobId())
                        && Objects.equals(s.schedulerTask(), scheduled.schedulerTask())
                        && s.startedAt() != null && withinMergeWindow(match.startedAt(), s.startedAt())).count();
                long competingRunner = runner.stream().filter(r -> r.source() == Source.RUNNER
                        && Objects.equals(r.schedulerJobId(), scheduled.schedulerJobId())
                        && Objects.equals(r.schedulerTask(), scheduled.schedulerTask())
                        && Objects.equals(r.runnerJobId(), mapping.jobId())
                        && Objects.equals(r.profileId(), mapping.profileId())
                        && r.startedAt() != null && withinMergeWindow(r.startedAt(), scheduled.startedAt())).count();
                if (competingScheduler == 1 && competingRunner == 1 && usedRunner.add(match.evidenceId())) {
                    combined.add(new ExecutionEvidence("combined:" + scheduled.evidenceId() + "+" + match.evidenceId(),
                            scheduled.schedulerJobId(), scheduled.schedulerTask(), match.runnerJobId(),
                            match.profileId(), match.runnerExecutionId(), match.startedAt(), match.outcome(), Source.COMBINED));
                    continue;
                }
            }
            combined.add(scheduled);
        }
        for (ExecutionEvidence r : runner) if (!usedRunner.contains(r.evidenceId())) combined.add(r);
        return List.copyOf(combined);
    }

    private static boolean withinMergeWindow(Instant a, Instant b) {
        return Duration.between(a, b).abs().compareTo(Duration.ofSeconds(30)) <= 0;
    }

    private static String canonicalMappingId(String schedulerTask) {
        try { return JobNormalizer.canonicalIdFromFullTask(schedulerTask); }
        catch (IllegalArgumentException invalid) { return null; }
    }

    /** Adapter preserves the distinction between a Runner invocation and a started child process. */
    public static ExecutionEvidence fromRunner(RunnerReceiptService.JobExecutions mapping,
                                               RunnerReceiptService.Execution run) {
        if (!"AVAILABLE".equals(mapping.profileStatus()) || !Objects.equals(mapping.jobId(), run.jobId())
                || !Objects.equals(mapping.profileId(), run.commandProfileId())
                || mapping.jobId() == null || mapping.jobId().isBlank()
                || mapping.profileId() == null || mapping.profileId().isBlank())
            throw new IllegalArgumentException("Runner mapping does not identify this execution");
        String schedulerJobId = JobNormalizer.canonicalIdFromFullTask(mapping.schedulerTask());
        boolean child = Boolean.TRUE.equals(run.childStarted()) && run.processStartedAt() != null;
        ExecutionOutcome outcome = !child || run.terminalAt() == null ? ExecutionOutcome.INCOMPLETE
                : "SUCCESS".equals(run.runnerOutcome()) ? ExecutionOutcome.EXECUTED_SUCCESS
                : ("FAILED".equals(run.runnerOutcome()) || "TIMEOUT".equals(run.runnerOutcome()))
                    ? ExecutionOutcome.EXECUTED_FAILED : ExecutionOutcome.UNKNOWN;
        Instant started = child ? Instant.parse(run.processStartedAt()) : Instant.parse(run.startedAt());
        return new ExecutionEvidence("runner:" + run.executionId(), schedulerJobId, mapping.schedulerTask(),
                run.jobId(), mapping.profileId(), run.executionId(), started, outcome, Source.RUNNER);
    }

    private static CorrelationResult result(ExecutionEvidence e, State state, Reason reason, String id,
                                             List<String> candidates, String relation) {
        return new CorrelationResult(e.evidenceId(), state, reason, id, candidates, e.outcome(), relation);
    }

    private static String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
}
