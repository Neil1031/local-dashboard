# Schedule Semantics & MISSED Readiness

2026-09-26 (Asia/Taipei). Branch: `research/dashboard-schedule-semantics`. Research and design only. **Overall: NOT_READY.** No evaluator, job status, Runner, receipt, history schema, Scheduled Task, or production configuration was changed. This document is the review artifact, not runtime acceptance.

## Scope and evidence method

The repository example selectors in `config/application.example.yml` were used as the inventory allowlist. On this host, read-only `Get-ScheduledTask` and `Get-ScheduledTaskInfo` were queried for the five exact names and the dated-task prefix; no task was run or edited. The inventory below contains only task class, trigger/settings metadata, and no action, executable, arguments, account, SID, or private path. It is a snapshot, not a history or proof of the effective configuration of every Dashboard instance. Current repository code was inspected at baseline `363ec95a27bd445fa4df718a823a3f0651de45da`; the prior Stage 4 research was used for context, with current values checked again.

## Current Scheduler evidence

`collect-scheduler.ps1` selects tasks using configured include/exclude selectors and returns `TaskName`, `TaskPath`, `Description`, `State`, `Enabled`, `LastRunTime`, `LastTaskResult`, `NextRunTime`, `NumberOfMissedRuns`, `StartWhenAvailable`, all CIM properties of every `Trigger` (including nested repetition), and collection errors. `collectedAt` is UTC. `JobNormalizer` publishes identity, enabled/state, last/next run instants, last result, trigger JSON, and the entire collector row as `raw` in `/api/jobs`. An invalid or timezone-less last/next timestamp becomes null with a warning; sentinel dates become null. `scheduledAt` is currently null. `MISSED` exists in the enum but normalization never assigns it. The configured `missed-grace-minutes: 15` is bound by `SchedulerProperties` but not used by an evaluator.

The current collector retains the *current CIM trigger properties*, not the complete registered task definition/XML. It does not publish `MultipleInstances`, principal/logon conditions, `WakeToRun`, all task settings, schedule versions, effective timezone history, or a continuous runtime/availability timeline. `raw` is a current API snapshot, not persisted schedule history. A request to `/api/jobs` runs the collector and `HistoryObserver`; it is not a read-only persistence operation, so this research did not call a live API.

`LastRunTime` is the Scheduler's latest run timestamp, `LastTaskResult` its latest result, `State=Running` a current observation, and `NumberOfMissedRuns` an aggregate counter. They provide positive clues, but none by itself identifies the scheduled occurrence or proves a negative. In particular, manual starts and retries are permitted, and the latest run can replace an earlier observation. Microsoft's [registered-task properties](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask) describe these values as latest or aggregate values, not an occurrence ledger. Its [missed-runs property](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask-numberofmissedruns) gives only a count; no occurrence ID, timestamp, cause, or coverage guarantee is specified.

## Trigger inventory

Snapshot: 2026-09-26, Windows timezone `Taipei Standard Time` (UTC+08:00, no DST on this host). All observed triggers were enabled, with no repetition, end boundary, random delay, or trigger ID. All five tasks were enabled/Ready, `StartWhenAvailable=true`, `WakeToRun=false`, `MultipleInstances=IgnoreNew`, `LogonType=Interactive`, `RunOnlyIfIdle=false`, and `RunOnlyIfNetworkAvailable=false`. A current enabled value cannot establish past enabled state. The weekday bitmask 62 means Monday–Friday; 32 means Friday. Clock times below are the current trigger boundaries, not a historical promise.

| Task class | Trigger type | Frequency | Clock time (+08:00) | Days of week | Enabled | Count |
| --- | --- | --- | --- | --- | --- | ---: |
| InsiderTracker-Market | Daily | every 1 day | 06:30 | daily | true | 1 |
| InsiderTracker-SyncImport | Daily | every 1 day | 10:40 | daily | true | 1 |
| InsiderTracker-SEC | Daily | every 1 day | 11:15 | daily | true | 1 |
| AIStockHunter-UnexplainedVolume-Daily | Weekly | every 1 week | 14:30, 17:00 | Monday–Friday | true | 2 |
| AIStockHunter-Accumulation-Weekly-Check | Weekly | every 1 week | 22:00 | Friday | true | 1 |
| AIStockHunter-Accumulation-Check-* | no matching registered task | unknown | unknown | unknown | unknown | 0 observed |

The UnexplainedVolume task differs materially from the older 13:35 example. Its two triggers start at `2026-09-21T14:30:00+08:00` and `2026-09-21T17:00:00+08:00`. The weekly check starts at `2026-09-18T22:00:00+08:00`; the three daily triggers start at 2026-09-19 at their respective times. The dated prefix currently has no matched task; this is a negative *inventory observation*, not evidence that a past dated task never existed. No one-time, startup, logon, or repetition trigger was observed among the currently selected tasks.

## Nominal occurrence model

Proposed immutable `NominalOccurrence`:

| Field | Meaning |
| --- | --- |
| `jobIdentity` | canonical Scheduler path and name / existing Dashboard job ID |
| `scheduleVersion` | fingerprint plus observation interval of the definition that generated it |
| `triggerIdentity` | stable ID within that version, including trigger index if Windows ID is absent; index must be invalidated on reordering |
| `scheduledFor` | resolved UTC instant plus original local wall time |
| `windowStart`, `windowEnd` | explicit evidence/correlation window boundaries, not inferred from last run alone |
| `timezone` | Windows timezone ID, rule version if available, offset used, and resolution decision |
| `graceUntil` | `scheduledFor + effective start grace` |

An occurrence ID should deterministically include task identity, schedule version, trigger identity, and scheduled instant. Generation must use an observed definition valid for that period; no retroactive generation from today's trigger. Multiple triggers generate separate occurrences, even when they belong to one job. A run cannot silently satisfy two occurrences. For this snapshot, candidate generators could cover single daily and single weekly calendar triggers. The two-trigger job requires explicit ambiguity handling. Unsupported trigger types, missing definitions, and ambiguous local time yield `UNKNOWN`/`UNSUPPORTED`, not invented occurrences. This Stage implements no parser or generator.

## Timezone semantics

The live boundaries carry explicit `+08:00`; normalize these to instants while preserving the source text and offset. Do not use browser timezone or bare `new Date()` to reinterpret a wall-clock schedule. Microsoft's [StartBoundary contract](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itrigger-get_startboundary) says a boundary *without* offset/Z uses the local computer timezone and daylight-saving information. Therefore future offset-less boundaries require the Windows timezone at the definition/occurrence time, not the Dashboard JVM or browser default. The current Windows zone is `Taipei Standard Time`; JVM default was not verified because `java` is not on this shell's PATH, and no JVM default is needed to interpret the explicit-offset boundaries. A future JVM running elsewhere must use captured Scheduler timezone/rules and `Instant` comparisons. For DST gaps/folds, require an explicit policy verified against Task Scheduler behavior; until then those occurrences remain unsupported/unknown. Clock changes and timezone changes must invalidate assumed observation continuity.

## Grace period

Proposed start grace: global default 15 minutes, optional per-job override and later per-trigger override if justified. `earliestMissedEvaluation = scheduledFor + grace`; at the exact boundary, remain within grace. Grace is a tolerance for delayed **start**, not completion or retry duration. The task's `ExecutionTimeLimit` and child runtime do not automatically extend it: a confirmed started/running or failed execution is already positive evidence. If startup delay, conditions, or catch-up policy varies, configure and justify those separately. The current YAML value is only configuration data; no current MISSED logic uses it. Machine downtime and `StartWhenAvailable` can outlast 15 minutes, so elapsed grace alone never makes absence conclusive.

## Scheduler evidence

`LastRunTime` with a completed result supports a latest observed execution, but a successful Scheduler exit is not necessarily application success. `State=Running` is positive current activity with no completed outcome. `NumberOfMissedRuns=0` cannot prove every nominal occurrence ran; a nonzero count cannot identify which one did not. `NextRunTime` concerns the next schedule only. A manual/demand run, restart, retry, or overlapping trigger may explain a timestamp near a nominal time. Negative evidence requires provenance, a bounded and complete observation interval, task-condition/catch-up knowledge, and matching rules. Current collector lacks these.

## Runner evidence correlation

Runner receipts use UTC `startedAt`, `processStartedAt`, and `finishedAt`; phases are `STARTED`, `PROCESS_STARTED`, and `TERMINAL`. `STARTED` proves a validated Runner invocation, `PROCESS_STARTED` proves child launch was observed, and terminal `FAILED`/`START_FAILED` is not an absent execution. The receipt has `jobId` and `executionId`, but no `scheduledFor`, trigger ID, or nominal occurrence ID. A nearest timestamp can bind a manual run, late catch-up, retry, or the wrong one of two triggers. Future work should carry a Scheduler-supplied or independently verified occurrence token (`nominalOccurrenceId`, `scheduledFor`, schedule version, trigger identity, provenance) into the invocation and receipt. If Windows cannot provide a causal token, define a conservative matching algorithm with an explicit `AMBIGUOUS` result; never claim deterministic correlation from proximity alone. No Runner change is made here.

## History evidence

SQLite v1 persists only normalized completed `SUCCESS`/`FAILED` observations. Identity is existing `jobId + lastRunAt` in canonical UTC; `observed_run_at` is Scheduler `LastRunTime`, not the Dashboard poll or completion time. `first_observed_at`/`last_observed_at` are poll times, not continuous coverage. Re-observing the same identity updates latest metadata and preserves earliest/latest observation timestamps. Restart retains rows, but a run overwritten between polls, a start/crash before a completed result, or a period without Dashboard polling can be absent. History is useful positive execution evidence, not an absence audit, schedule-version ledger, or occurrence table. Existing history identity must remain intact.

## Machine offline semantics

For 22:00 schedule, power off at 21:00 and boot at 23:00: the nominal 22:00 time may exist, but the Dashboard cannot state whether Windows queued a catch-up, whether the interactive principal was available, or whether execution evidence was lost. This snapshot has `StartWhenAvailable=true`, `WakeToRun=false`, and interactive logon for all five tasks. Microsoft's [StartWhenAvailable documentation](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable) permits delayed starts for applicable time-based tasks and describes a default queue delay; it does not give this Dashboard a per-occurrence catch-up deadline. [WakeToRun](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-waketorun) is a configuration flag, not proof that a machine woke. Required evidence includes boot/shutdown/sleep intervals, Scheduler service availability, logon/session and relevant task conditions, event-log continuity, and whether catch-up has closed. Missing any required interval makes negative inference `UNKNOWN`. A proven machine-off interval is a reason/context; product policy must decide whether to count it as MISSED, and must not imply the child failed.

## Disabled semantics

An observed `enabled=false` prevents generation of **future** obligations while it remains disabled. It does not erase earlier obligations. If 22:00 was expected and the task was disabled at 22:30, classification depends on whether it was enabled at 22:00 and on execution/catch-up evidence. Current `job` table stores latest enabled with first/last seen timestamps, not an enable-state timeline; the current collector has only the present value. Therefore historical disable timing is `UNKNOWN`. Future schedule snapshots need enable transitions with observation bounds; observed state changes do not reveal exact change time between polls.

## Schedule-change problem

Changing 06:30 to 07:30 today cannot redefine yesterday's obligation. Persist safe, versioned definition snapshots: task identity, trigger definitions and order, enabled flag, relevant settings/conditions, Windows zone context, canonical fingerprint, `observedAt`, and interval/coverage metadata. `effectiveFrom` is bounded by observation; the true edit time within a polling gap is unknown. Deletion needs a tombstone with the same uncertainty. Compare versions before generating an occurrence; straddling change intervals remain `UNKNOWN`. Never retain or push raw action/executable/args XML for this purpose.

## One-time semantics

No dated task currently matched. Model a one-time trigger as at most one occurrence per observed definition/version. After its time passes, retained task plus verified run gives `EXECUTED_SUCCESS` or `EXECUTED_FAILED`; retained task without a run remains `UNKNOWN` until grace, coverage, availability, and catch-up gates are met. A deleted task cannot be treated as never scheduled: use prior snapshot and deletion observation bounds. If it succeeds or fails once, do not create daily repetitions from the date-like name. If no historical definition exists, return `UNKNOWN` rather than reconstructing it from `YYYY-MM-DD`. Expired one-time tasks, multiple one-time triggers, and repeated/changed definitions need explicit policies in a later Stage.

## FAILED vs MISSED vs UNKNOWN

- `FAILED` / proposed occurrence result `EXECUTED_FAILED`: positive execution evidence with a failed result, including a child exit 1. It is never MISSED merely because work did not succeed.
- `MISSED`: an expected nominal occurrence with no execution evidence **after** the evaluation window, only when definition, enabled/conditions, clock, collection coverage, provenance, and catch-up closure are all established. No current job is assigned this state by this Stage.
- `UNKNOWN`: evidence is insufficient or ambiguous, including no record with incomplete coverage, possible catch-up, machine/session uncertainty, changed schedule, or ambiguous multi-trigger matching.

Example: Friday 2026-10-02 22:00 +08:00 weekly check = `2026-10-02T14:00:00Z`; illustrative start grace 15 minutes ends 22:15 +08:00. The proposed evidence window begins at the verified nominal trigger time and remains open for evidenced late starts/catch-up under an explicit policy; it is **not** arbitrarily closed at 22:15. A Scheduler run and matching Runner terminal success yields `EXECUTED_SUCCESS`; a matching child exit 1 yields `EXECUTED_FAILED`; no run after 22:15 with current evidence yields `UNKNOWN`; host off 21:00–23:00 yields `UNKNOWN` while catch-up/availability is unresolved; a task disabled before 22:00 produces no future obligation, while disable at 22:30 requires historical state and execution evidence. These are model examples, not claims about that future Friday.

## Per-job readiness

`scheduleCurrent` means this snapshot can describe the current trigger, not historical occurrence coverage. All rows lack schedule history, deterministic Runner correlation, and machine/service/session availability evidence. Thus all are **NOT_READY for automatic MISSED**.

| Job | Current schedule verified | Special issue | MISSED readiness |
| --- | --- | --- | --- |
| InsiderTracker-Market | daily 06:30 | manual/late run attribution; catch-up | NOT_READY |
| InsiderTracker-SyncImport | daily 10:40 | manual/late run attribution; catch-up | NOT_READY |
| InsiderTracker-SEC | daily 11:15 | manual/late run attribution; catch-up | NOT_READY |
| AIStockHunter-UnexplainedVolume-Daily | two weekday triggers, 14:30 and 17:00 | multi-trigger attribution; old 13:35 assumption invalid | NOT_READY |
| AIStockHunter-Accumulation-Weekly-Check | Friday 22:00 | retry/catch-up, interactive session | NOT_READY |
| AIStockHunter-Accumulation-Check-* | no current match | one-time task may have been deleted; no historical definition | NOT_READY / CURRENT_DEFINITION_ABSENT |

## Structured readiness

Readiness is a diagnostic research assessment, not a new API/UI contract. `READY` here means the named dimension is sufficiently specified for this **design**; it does not override the overall gate.

| Dimension | State | Evidence / missing requirement |
| --- | --- | --- |
| `scheduleDefinition` | PARTIAL | Current CIM triggers available; complete settings and definition history absent; dated task absent |
| `scheduleHistory` | NOT_READY | No versioned snapshots, enabled/deletion timeline, or bounded effective intervals |
| `timezoneSemantics` | PARTIAL | Explicit +08:00 current boundaries understood; JVM/Windows zone drift and DST gap/fold policy unverified |
| `graceSemantics` | READY_DESIGN | Configurable 15-minute start tolerance defined; catch-up closure remains separate |
| `schedulerOccurrenceEvidence` | NOT_READY | Latest values and aggregate missed count lack causal ID and continuous absence coverage |
| `runnerCorrelation` | NOT_READY | No scheduledFor/occurrence token or trigger provenance in receipts |
| `historyCoverage` | NOT_READY | Completed-run snapshots only; gaps and starts/crashes not captured |
| `machineAvailability` | NOT_READY | No boot/sleep/service/session/condition timeline |
| `triggerSupport` | PARTIAL | Current daily/weekly forms understood; multi-trigger and one-time semantics need separate validation |
| `overall` | **NOT_READY** | Negative inference cannot meet the evidence gate |

## Future architecture and recommendation

1. **Stage A — snapshot history:** persist sanitized definition/settings, trigger versions, enabled/deletion observations, timezone context, and collection coverage without altering v1 run identity.
2. **Stage B — occurrence correlation:** establish causal provenance or a conservative ambiguity-aware matching contract for Scheduler, Runner, manual runs, retries, and multi-trigger jobs. Add receipt fields only in an explicitly approved Runner Stage.
3. **Stage C — availability evidence:** capture bounded machine, Scheduler service, session, conditions, event-log continuity and catch-up closure; define policy for machine-off obligations.
4. **Stage D — shadow evaluator:** calculate `WOULD_BE_MISSED` and reasoned `UNKNOWN` in separate diagnostics over a review period; do not change UI status or notify.
5. **Stage E — production decision:** only after measured shadow false-positive review and Manager approval, consider a production MISSED contract and targeted tests.

Recommendation: approve Stage A as the next isolated design/implementation review. Do not enable automatic MISSED from current `/api/jobs`, `NumberOfMissedRuns`, or SQLite rows. The current multi-trigger change and absence of dated tasks should be explicit Stage A fixtures.

## Tests and research gate

This Stage adds documentation only. No production parser/evaluator/API/UI code was added, so the 25-case implementation test matrix is deferred to the Stage that implements those behaviors. Review checks for this Stage: baseline and clean branch verified; live selected task inventory read-only; code path and schema inspected; official Scheduler contracts linked; `git diff --check`; final working tree and remote commit verified after push. The cached Maven 3.9.11 launcher was invoked directly with JDK 25 and `-DforkCount=0` because this environment could not launch `cmd.exe` for Surefire's fork (`CreateProcess error=740`): **BUILD SUCCESS, 156 Java tests, 0 failures/errors/skips**. Bundled Node 24 with the existing `NODE_PATH` passed **40 Node/browser tests, 0 failures**. The ordinary forked Maven path is not verified in this environment. No live Dashboard service was started and no real `/api/jobs` request, Scheduled Task execution/mutation, operational DB access, or live boot/catch-up/DST experiment occurred. Therefore negative-coverage behavior and production runtime acceptance are **NOT VERIFIED**.

**Research Gate: PASS for documented readiness assessment; automatic MISSED Gate: NOT_READY.** Stop at Manager Review; no merge to `main`.
