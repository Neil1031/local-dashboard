# Stage B — Occurrence Correlation (shadow research)

## Plan / Stage / Gate

Goal: determine which nominal scheduled occurrence an observed execution could belong to. Scope: Stage A schedule versions, existing `job_run`, and existing Runner receipt diagnostics. Dependencies: the V2 schedule snapshot schema and explicit-offset daily/weekly definitions. Gate: deterministic distinct occurrences, bounded conservative matching, ambiguity preservation, regression tests, and reviewable pushed evidence. Done when the gate passes on `research/dashboard-occurrence-correlation`; Manager Review decides any later API, persistence, or status work. Self-QA checks the example matrix, schema/identity invariants, and absence of Scheduler/Runner mutation.

## Architecture

`OccurrenceCorrelation` is an opt-in pure calculation. `OccurrenceEvidenceRepository` reads the existing SQLite database in `mode=ro`; it does not create a database, write a correlation row, refresh `/api/jobs`, or contact Task Scheduler. The existing `RunnerReceiptService` can supply its already validated read-only execution view through `fromRunner`. There is no UI or HTTP endpoint in this stage. A future diagnostics endpoint could call these components with a bounded time range; it must retain the shadow labels and avoid changing status.

No `job`, `job_run`, `schedule_version`, `schedule_observation`, Runner receipt, or Scheduler schema/contract is changed. Correlation is recalculated, so a new table is not warranted yet. Persist only if future measured query cost or audit requirements justify a versioned, append-only shadow result with source evidence references and policy version. Never overwrite `job_run` or reuse its identity as an occurrence ID.

## Identity namespaces

These values have separate meanings and are retained separately in `ExecutionEvidence`:

| Field | Source and meaning |
| --- | --- |
| `schedulerJobId` | Dashboard `JobNormalizer` canonical identity: Base64URL without padding of lowercase `TaskPath + TaskName`. Stage A `schedule_version.job_id` and `job_run.job_id` use this namespace. |
| `schedulerTask` | Full Scheduler task path, for example `\\AIStockHunter-Accumulation-Weekly-Check`. It is `task_path + task_name` from the `job` row or the trusted Runner mapping. |
| `runnerJobId` | Native Runner profile job ID, for example `aistockhunter-accumulation-weekly`; absent on Scheduler-only evidence. |
| `profileId` | Native Runner command profile ID; absent on Scheduler-only evidence. |
| `runnerExecutionId` | Native Runner receipt execution ID; absent on Scheduler-only evidence. |

The Runner adapter verifies receipt `jobId` and `commandProfileId` against the trusted `RunnerReceiptService.JobExecutions` mapping, derives `schedulerJobId` from that mapping's full `schedulerTask` with the **same** `JobNormalizer` rule, and preserves the Runner's three native identifiers. The repository joins `job_run` to `job` to obtain the full Scheduler task path. No code equates a Runner job ID with a Dashboard job ID.

## NominalOccurrence

The model contains `occurrenceId`, `jobId`, `scheduleVersionId`, `triggerIdentity`, `scheduledFor`, `windowStart`, `windowEnd`, `graceUntil`, `timezoneResolution`, and `startWhenAvailable`. `graceUntil` is context for future missed-run research and is not used as the correlation window. A diagnostic request generates at most 32 days; it neither backfills unobserved history nor produces a missing-run judgment.

## Occurrence identity

SHA-256 over UTF-8 `jobId`, stored Stage A `schedule_version.id`, version-local canonical trigger index plus the optional trigger `Id`, and UTC `scheduledFor`, separated by newlines. The hash is deterministic for the same persisted version and definition. `schedule_version.id` identifies a stored version episode; occurrence identity never comes from a new auto-increment row. Rebuilding a database with different version IDs can produce different occurrence IDs, so cross-database portability is not claimed.

## Supported trigger types

Only enabled `MSFT_TaskDailyTrigger` and `MSFT_TaskWeeklyTrigger` with explicit-offset `StartBoundary` are generated. Positive `DaysInterval` and `WeeksInterval` are respected; weekly masks use Sunday=1 through Saturday=64, and weekly intervals are anchored to the Sunday calendar week of the original boundary. An explicit `EndBoundary` caps generation. Each trigger remains independent, including identical-time triggers with distinct version-local indexes. One-time, monthly, monthly day-of-week, repetition, random delay, and trigger delay produce `UNSUPPORTED_TRIGGER`; no generic parser is fabricated. Disabled triggers produce no occurrence.

Stage A preserves original boundary text, resolved UTC instant, and `windowsTimezoneId`. This stage uses the original explicit offset as a fixed offset. An offset-less boundary, including one with a Windows timezone ID, returns `UNSUPPORTED_TIMEZONE_RESOLUTION` until a verified Windows DST gap/fold policy exists. An explicit `+08:00` Taipei boundary is fully resolvable within this model. Future changes to actual offset require a new observed schedule version; a fixed offset does not silently infer DST.

The current fixture covers Market daily 06:30, SyncImport daily 10:40, SEC daily 11:15, UnexplainedVolume weekday 14:30 and 17:00 as **two** occurrences, and Weekly-Check Friday 22:00. No old 13:35 trigger is used.

## Schedule version ambiguity

Stage A records `previous_last_observed_at` and `first_observed_at` for a changed version. If a candidate occurrence's nominal time is in that open/closed observation gap, the result is `AMBIGUOUS` with reason `AMBIGUOUS_SCHEDULE_VERSION`, even when only the old definition would generate a candidate. No version is selected from observation timing alone. Occurrences outside a version's observed interval and outside a recorded change gap cannot become correlated. No historical version yields `INSUFFICIENT_EVIDENCE / NO_SCHEDULE_HISTORY`.

## Execution evidence

`job_run.observed_run_at` is Task Scheduler `LastRunTime`; `scheduler_result`, `outcome`, `first_observed_at`, and `last_observed_at` describe a repeatedly observed execution row keyed by `(job_id, observed_run_at)`. Neither that timestamp nor a result code identifies a trigger or proves a scheduled invocation. The repository reads rows without changing their IDs.

Runner receipts contain `executionId`, `startedAt`, `processStartedAt`, terminal time, mapped `jobId`/profile, and outcome, but no nominal time or trigger identity. The adapter uses `processStartedAt` for a real child start. An invocation that never started a child, or lacks terminal evidence, remains `INCOMPLETE / INSUFFICIENT_EVIDENCE`; an actual child exit 1 is `EXECUTED_FAILED` and can still correlate. The adapter requires the exact validated job/profile mapping. Incomplete Runner coverage is never negative evidence for an occurrence.

## Correlation states

| State | Meaning |
| --- | --- |
| `CORRELATED` | Exactly one supported, observed-version normal-window candidate, with no competing candidate. The execution outcome remains separate (`EXECUTED_SUCCESS` or `EXECUTED_FAILED`). |
| `AMBIGUOUS` | Multiple candidate occurrences, an unproven early candidate, or a schedule version observation gap. No occurrence is assigned. |
| `UNMATCHED` | A positively identified manual invocation, or an execution outside all plausible windows while schedule history covers its time. Reason `UNMATCHED_EXECUTION`. |
| `UNSUPPORTED` | Trigger or timezone semantics are not implemented. |
| `INSUFFICIENT_EVIDENCE` | No history, outside observed coverage, incomplete child evidence, or a single unproven late catch-up candidate. |

There is no `MISSED` state, status mutation, notification, remediation, or retry in this stage.

## Time window policy

These are **shadow research heuristics**, not a Windows Scheduler guarantee: normal window is `scheduledFor - 2 minutes` through `scheduledFor + 5 minutes`, both inclusive. An execution in the two-minute early segment is only a candidate and stays `AMBIGUOUS / EARLY_UNPROVEN`; it is never automatically correlated. Thus 14:10 does not match 14:30. A 14:33 start is within the normal candidate window. The separate 15-minute `graceUntil` is not a matching window.

`StartWhenAvailable` allows a tentative late catch-up window from the end of the normal window up to three hours after nominal time, capped at the next nominal occurrence for the same job. A sole tentative match is `INSUFFICIENT_EVIDENCE / LATE_CATCH_UP_UNPROVEN`; an overlap with another candidate is `AMBIGUOUS`. The three-hour horizon and next-occurrence cap are explicit model limits, not proof that Windows could not catch up later. A late execution after this cap may therefore need future provenance data to classify correctly. Microsoft's [StartWhenAvailable reference](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itasksettings-get_startwhenavailable) describes delayed queued starts, while its [daily trigger reference](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nn-taskschd-idailytrigger) defines the nominal time using `StartBoundary`. Neither supplies evidence that ordinary scheduled starts happen early. The early two minutes are deliberately treated as uncertainty, not scheduler provenance.

## Multi-trigger ambiguity

On Monday the UnexplainedVolume task generates separate 14:30 and 17:00 IDs. A 14:32 execution correlates only to 14:30. A 16:58 execution can be a tentative 14:30 catch-up and an unproven early 17:00 candidate: `AMBIGUOUS / MULTIPLE_CANDIDATES`, with both IDs and no assignment. A 17:02 execution has the 17:00 normal candidate under the explicit next-occurrence cap; it correlates if no competing evidence exists. This does not establish its real Windows trigger source. One execution never satisfies two occurrences.

## Manual runs

An execution explicitly identified as manual is `UNMATCHED` even if its time is close to nominal. Without provenance, `LastRunTime` alone cannot distinguish manual, scheduled, delayed, or retry starts. A 09:00 known manual execution is unmatched; an unknown-source 09:00 execution still inside a hypothetical late catch-up horizon remains insufficient evidence. This distinction is intentional.

## Retries / multiple executions

Results are sorted by start instant then evidence ID. For multiple uniquely correlated executions of one occurrence, the first is `PRIMARY_EXECUTION`, later ones are `ADDITIONAL_EXECUTION`. Neither overwrites the first or creates another occurrence. This deterministic relation is diagnostic only; the receipt contract and history rows remain unchanged.

## Scheduler + Runner evidence

`combine` merges only a mutually unique Scheduler/Runner pair whose canonical Dashboard job ID and full Scheduler task path agree, whose Runner native job ID and profile ID agree with one `AVAILABLE` trusted mapping, whose known outcomes agree, and whose start instants are within 30 seconds. A competing Scheduler or Runner execution, duplicate mapping, mapping mismatch, conflicting outcome, or uncertain pair remains as separate evidence. Thirty seconds is a correlation guard, not proof of common origin. Runner-only and Scheduler-only evidence may be evaluated separately. A `COMBINED` record uses the Runner child start, retains Runner native IDs, and retains both source IDs in its diagnostic ID.

## Unsupported version scoping

An unsupported trigger diagnostic applies only if that version's observed episode could affect the execution time: from two minutes before `firstObservedAt` through three hours after `lastObservedAt` (the shadow early/catch-up bounds). Nominal candidates outside their observed episode and outside every recorded change gap are excluded before choosing the next trigger that caps a possible catch-up. An old unsupported episode that ended the previous day cannot taint a current supported Daily candidate or shorten its catch-up window. An execution inside the unsupported episode remains `UNSUPPORTED`. If the execution or a supported nominal candidate lies in a recorded version-change observation gap, `AMBIGUOUS_SCHEDULE_VERSION` takes priority over unsupported semantics because the effective version is unknown. An unsupported episode within the possible late catch-up bound can still make a nearby execution unsupported; the bound is conservative and does not prove trigger provenance.

## Correlation matrix

| Case | Evidence | Shadow result |
| --- | --- | --- |
| A | Market 06:30 → 06:31 | `CORRELATED`, 06:30 |
| B | Market 06:30 → 06:30 child exit 1 | `CORRELATED + EXECUTED_FAILED` |
| C | Market 06:30 → known manual 09:00 | `UNMATCHED_EXECUTION` |
| D | UnexplainedVolume 14:30 → 14:32 | `CORRELATED`, 14:30 |
| E | UnexplainedVolume execution 16:58 | `AMBIGUOUS`, 14:30 catch-up / 17:00 early |
| F | UnexplainedVolume 17:00 → 17:02, no competing evidence | `CORRELATED`, 17:00 |
| G | 06:30→07:30 schedule change observed between 06:00 and 07:00 | `AMBIGUOUS_SCHEDULE_VERSION` for 06:30 candidate |
| H | No schedule version | `INSUFFICIENT_EVIDENCE` |

## Future Runner occurrence token

An authenticated, Scheduler-origin invocation envelope could carry `scheduledFor`, `scheduleVersionId`, `triggerIdentity`, `nominalOccurrenceId`, and `invocationSource` into the Runner receipt. It could disambiguate adjacent triggers, a late catch-up versus a normal start, known manual invocations, and retries tied to the same occurrence **when the source really knows the occurrence**. A token must be checked against the stored schedule version and expected job/profile, bound to the invocation, and never accepted merely because a caller supplied a plausible timestamp. It would not reconstruct schedules before observation, resolve offset-less DST rules, or turn absent execution evidence into a proven missed occurrence. This stage does not alter Runner invocation or receipts.

## Tests

`OccurrenceCorrelationTest` covers live fixture daily/weekly masks, two independent weekday triggers, deterministic ID, explicit +08:00 resolution, observation-gap ambiguity, normal same-version match, window inside/outside, failed child, early and late ambiguity, manual run, retries, Runner-only and Scheduler-only evidence, unique combined evidence, unsupported one-time and offset-less definitions, historical unsupported scoping, relevant unsupported episodes, gap priority, missing history, incomplete child, and no `MISSED` state. `OccurrenceEvidenceRepositoryTest` checks Stage A version reading, unchanged `job_run` identity, actual task path from the joined `job` row, no database creation on the read path, and an integration-style weekly task with different real Scheduler and Runner identity namespaces. The latter rejects mismatched task paths, profile IDs, and Runner job IDs. Full Maven regression covers Stage A, Runner diagnostics, and history. No UI/API was changed, so Node/browser tests are not required for this code-only correction.

## Limitations

Schedule observation intervals do not prove when Windows changed a task. Scheduler `LastRunTime` and Runner timestamps do not prove trigger provenance. The 2-minute early, 5-minute normal, 3-hour possible catch-up, 30-second source merge, and next-occurrence cutoff are policy choices requiring real operational evidence before promotion. A fixed explicit offset is not a DST policy. Diagnostics are bounded to 32 days, 1000 versions, and 1000 Scheduler runs per repository query; exceeding a limit fails visibly. No persisted correlation, API, UI, live task execution, Scheduled Task edit, formal Runner config edit, or runtime acceptance is claimed.

## Recommendation

Keep this as a shadow domain/repository model for Manager Review. Before any status or missed-run work, collect verified trigger-origin evidence or design the authenticated occurrence token, validate late catch-up and early-start behavior against real Scheduler lifecycle data, define DST handling, and retain conservative unknown outcomes when provenance remains unavailable.
