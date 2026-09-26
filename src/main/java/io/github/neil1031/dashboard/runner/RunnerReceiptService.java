package io.github.neil1031.dashboard.runner;

import io.github.neil1031.dashboard.runner.ExecutionReceipt.Phase;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bounded, read-only view of the Runner's published version 1 evidence. */
@Service
public class RunnerReceiptService {
    static final int MAX_DIRECTORIES_PER_ROOT = 4096;
    static final int RECENT_LIMIT = 5;
    static final int MAX_MAPPINGS = 32;
    private final RunnerReceiptProperties properties;

    public RunnerReceiptService(RunnerReceiptProperties properties) { this.properties = properties; }

    public record Execution(String executionId, String jobId, String commandProfileId, String state,
                            String startedAt, String processStartedAt, String terminalAt, Long durationMs,
                            Boolean childStarted, Integer childExitCode, Integer runnerExitCode, String runnerOutcome,
                            String receiptCompleteness, String source, String reason,
                            List<String> phases, List<String> warnings) {}
    public record JobExecutions(String schedulerTask, String profileId, List<Execution> executions,
                                List<String> warnings) {}
    public record Response(String status, List<JobExecutions> jobs, List<String> warnings) {}

    public Response recent() {
        if (properties.configPath() == null || properties.configPath().isBlank())
            return new Response("NOT_CONFIGURED", List.of(), List.of());
        final RunnerConfig config;
        final Path configPath;
        try {
            configPath = Path.of(properties.configPath());
            if (!configPath.isAbsolute() || !Files.isRegularFile(configPath, LinkOption.NOFOLLOW_LINKS))
                throw new IOException("Runner config path is unavailable");
            config = RunnerConfig.load(configPath);
        } catch (Exception invalid) {
            return new Response("UNAVAILABLE", List.of(), List.of("Runner config unavailable or invalid"));
        }
        List<Path> roots = new ArrayList<>();
        try {
            roots.add(configPath.getParent().resolve(config.receiptDirectory()).normalize());
            roots.add(config.fallbackDirectory() == null
                    ? Path.of(System.getProperty("user.home"), ".local-dashboard", "runner-fallback")
                    : configPath.getParent().resolve(config.fallbackDirectory()).normalize());
        } catch (RuntimeException invalid) {
            return new Response("UNAVAILABLE", List.of(), List.of("Runner receipt roots invalid"));
        }
        List<JobExecutions> jobs = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> mappedTasks = new HashSet<>();
        Map<String, JobExecutions> profileResults = new HashMap<>();
        if (properties.mappings().size() > MAX_MAPPINGS)
            warnings.add("Runner mapping limit reached; additional mappings ignored");
        for (var mapping : properties.mappings().stream().limit(MAX_MAPPINGS).toList()) {
            if (mapping == null || mapping.schedulerTask() == null || mapping.schedulerTask().isBlank()
                    || !mapping.schedulerTask().startsWith("\\") || !RunnerConfig.safeId(mapping.profileId())) {
                warnings.add("Invalid Runner mapping ignored"); continue;
            }
            if (!mappedTasks.add(mapping.schedulerTask())) {
                warnings.add("Duplicate Scheduler mapping ignored"); continue;
            }
            RunnerConfig.Profile profile = config.profiles().get(mapping.profileId());
            if (profile == null) {
                jobs.add(new JobExecutions(mapping.schedulerTask(), mapping.profileId(), List.of(),
                        List.of("Runner profile is absent from trusted config")));
                continue;
            }
            JobExecutions result = profileResults.computeIfAbsent(mapping.profileId(), unused ->
                    scan(mapping.schedulerTask(), mapping.profileId(), profile.jobId(), roots));
            jobs.add(new JobExecutions(mapping.schedulerTask(), mapping.profileId(), result.executions(), result.warnings()));
        }
        return new Response("OK", List.copyOf(jobs), List.copyOf(warnings));
    }

    private JobExecutions scan(String task, String profileId, String jobId, List<Path> roots) {
        Map<String, Evidence> grouped = new HashMap<>();
        List<String> warnings = new ArrayList<>();
        for (int index = 0; index < roots.size(); index++) {
            Path root = roots.get(index);
            try {
                if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) continue;
                if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)) {
                    warnings.add("Receipt root unavailable"); continue;
                }
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(root)) {
                    int examined = 0;
                    for (Path directory : stream) {
                        if (++examined > MAX_DIRECTORIES_PER_ROOT) {
                            warnings.add("Receipt scan limit reached; recent history may be incomplete"); break;
                        }
                        String id = directory.getFileName().toString();
                        if (!id.startsWith(jobId + "_") || !id.matches("[a-z][a-z0-9-]{0,63}_[0-9]{1,19}_[a-f0-9-]{36}")) continue;
                        try {
                            Map<Phase, ExecutionReceipt> phases = ReceiptFiles.readPhases(root, id);
                            if (phases.isEmpty()) continue;
                            if (phases.values().stream().anyMatch(receipt -> !receipt.jobId().equals(jobId)
                                    || !receipt.commandProfileId().equals(profileId))) {
                                warnings.add("1 receipt ignored: profile identity mismatch"); continue;
                            }
                            Evidence evidence = grouped.computeIfAbsent(id, unused -> new Evidence());
                            if (!evidence.add(phases, index == 0 ? "primary" : "fallback"))
                                warnings.add("1 receipt ignored: conflicting execution snapshots");
                        } catch (Exception invalid) {
                            warnings.add("1 receipt ignored: invalid or unreadable evidence");
                        }
                    }
                }
            } catch (IOException | SecurityException unavailable) { warnings.add("Receipt root unreadable"); }
        }
        List<Execution> executions = grouped.entrySet().stream()
                .map(entry -> normalize(entry.getKey(), entry.getValue()))
                .filter(execution -> execution != null)
                .sorted(Comparator.comparing((Execution execution) -> Instant.parse(execution.startedAt())).reversed()
                        .thenComparing(Execution::executionId, Comparator.reverseOrder()))
                .limit(RECENT_LIMIT).toList();
        return new JobExecutions(task, profileId, executions, List.copyOf(warnings));
    }

    private static final class Evidence {
        final Map<Phase, ExecutionReceipt> phases = new EnumMap<>(Phase.class);
        final Map<Phase, String> source = new EnumMap<>(Phase.class);
        boolean add(Map<Phase, ExecutionReceipt> next, String root) {
            ExecutionReceipt first = phases.values().stream().findFirst().orElse(null);
            for (var receipt : next.values()) {
                if (first != null && (!first.startedAt().equals(receipt.startedAt())
                        || !first.jobId().equals(receipt.jobId())
                        || !first.commandProfileId().equals(receipt.commandProfileId()))) return false;
                ExecutionReceipt existing = phases.get(receipt.phase());
                if (existing != null && !existing.equals(receipt)) return false;
            }
            ExecutionReceipt process = phases.containsKey(Phase.PROCESS_STARTED)
                    ? phases.get(Phase.PROCESS_STARTED) : next.get(Phase.PROCESS_STARTED);
            ExecutionReceipt terminal = phases.containsKey(Phase.TERMINAL)
                    ? phases.get(Phase.TERMINAL) : next.get(Phase.TERMINAL);
            if (process != null && terminal != null && (terminal.outcome() == ExecutionReceipt.Outcome.START_FAILED
                    || !process.processStartedAt().equals(terminal.processStartedAt()))) return false;
            next.forEach((phase, receipt) -> {
                phases.putIfAbsent(phase, receipt);
                source.putIfAbsent(phase, root);
            });
            return true;
        }
    }

    private static Execution normalize(String id, Evidence evidence) {
        ExecutionReceipt started = evidence.phases.get(Phase.STARTED);
        ExecutionReceipt process = evidence.phases.get(Phase.PROCESS_STARTED);
        ExecutionReceipt terminal = evidence.phases.get(Phase.TERMINAL);
        ExecutionReceipt latest = terminal != null ? terminal : process != null ? process : started;
        if (latest == null) return null;
        List<String> warnings = new ArrayList<>();
        if (started == null) warnings.add("STARTED receipt not observed");
        if (terminal != null && terminal.processStartedAt() != null && process == null)
            warnings.add("PROCESS_STARTED receipt not observed");
        Instant begin = Instant.parse(latest.startedAt());
        if (latest.processStartedAt() != null && Instant.parse(latest.processStartedAt()).isBefore(begin))
            warnings.add("Impossible phase timestamp ordering");
        if (terminal != null && Instant.parse(terminal.finishedAt()).isBefore(begin))
            warnings.add("Impossible phase timestamp ordering");
        if (terminal != null && terminal.processStartedAt() != null
                && Instant.parse(terminal.finishedAt()).isBefore(Instant.parse(terminal.processStartedAt())))
            warnings.add("Impossible phase timestamp ordering");
        if (!warnings.isEmpty() && warnings.contains("Impossible phase timestamp ordering")) return null;
        String completeness = terminal == null ? "INCOMPLETE"
                : terminal.outcome() == ExecutionReceipt.Outcome.START_FAILED ? "NEVER_STARTED_CHILD"
                : started != null && process != null ? "COMPLETE" : "PARTIAL_TERMINAL";
        List<String> present = evidence.phases.keySet().stream().sorted().map(Enum::name).toList();
        String source = evidence.source.values().stream().distinct().count() > 1 ? "primary+fallback"
                : evidence.source.values().stream().findFirst().orElse("unknown");
        return new Execution(id, latest.jobId(), latest.commandProfileId(), latest.phase().name(),
                latest.startedAt(), latest.processStartedAt(), terminal == null ? null : terminal.finishedAt(),
                terminal == null ? null : terminal.durationMs(), terminal != null && terminal.outcome() == ExecutionReceipt.Outcome.START_FAILED
                        ? Boolean.FALSE : latest.processStartedAt() != null ? Boolean.TRUE : null,
                terminal == null ? null : terminal.exitCode(),
                terminal == null ? null : terminal.runnerExitCode(), latest.outcome().name(), completeness,
                source, terminal == null ? null : terminal.processStartFailure() != null
                        ? terminal.processStartFailure() : terminal.terminationReason(), present, List.copyOf(warnings));
    }
}
