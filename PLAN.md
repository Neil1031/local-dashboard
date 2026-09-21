# Local Dashboard Implementation Plan

## Goal

Build a **local-only scheduler observability dashboard** for Windows.

The UI design already exists in `index.html`. Treat that file as the **visual source of truth**.

The first objective is not to replace existing scheduled tasks. It is to make their execution visible:

- Did the job run?
- Did it succeed?
- Did it fail?
- Was it expected to run but did not run?
- When did it last run?
- When will it run next?
- How long did it take?
- What was the last result / error?
- What happened over the last 7 / 30 days?

Do not redesign the UI unless required for real data. Preserve the existing pink visual language, spacing, cards, status presentation, responsive behavior, Today view, History view, filtering, and detail drawer.

---

# Product Rules

1. **Existing Windows scheduled tasks must keep working.**
2. Stage 1 must be read-only.
3. Do not rewrite or migrate current tasks just to make the dashboard work.
4. Localhost only by default.
5. No cloud account, external API, login, telemetry, or remote dependency is required.
6. Fail safely: dashboard failure must never prevent scheduled jobs from running.
7. Never report a job as successful only because the UI failed to collect newer information.
8. Preserve raw source information when possible so classification can be debugged.
9. A Windows Task Scheduler success result and an application-level success are not always the same thing.
10. Prefer simple implementation over premature abstractions.

---

# Suggested Architecture

Initial implementation:

```
Windows Task Scheduler
        |
        | PowerShell / Windows APIs
        v
Scheduler Collector
        |
        v
Spring Boot local service
        |
        +---- current scheduler state
        |
        +---- SQLite run history
        |
        v
Existing index.html UI
```

Suggested stack:

- Java 21+
- Spring Boot
- SQLite
- PowerShell ScheduledTasks cmdlets for the first implementation
- Plain HTML/CSS/JS from the existing prototype

Do not add React/Vue unless there is a concrete reason. The current UI does not require them.

---

# Status Model

The backend must normalize scheduler information into these statuses:

- `SUCCESS`
- `FAILED`
- `MISSED`
- `RUNNING`
- `READY`
- `DISABLED`
- `UNKNOWN`

## Important distinction

`READY` means the job is enabled and waiting for its next execution.

`SUCCESS` means a completed execution is known to have succeeded.

Do not show a future job as `SUCCESS` merely because its previous run succeeded.

## MISSED

A task is `MISSED` when:

- it was expected to run in an execution window,
- the expected window has passed,
- and no matching run is detected.

The calculation must consider the task trigger rather than simply comparing calendar dates.

Add a configurable grace period. Initial default: 15 minutes.

---

# Data Contract

Create a stable frontend-facing model similar to:

```json
{
  "id": "InsiderTracker-SEC",
  "name": "InsiderTracker-SEC",
  "description": "SEC filing parser",
  "enabled": true,
  "state": "READY",
  "status": "FAILED",
  "scheduledAt": "2026-09-21T11:15:00+08:00",
  "lastRunAt": "2026-09-21T11:16:03+08:00",
  "nextRunAt": "2026-09-22T11:15:00+08:00",
  "durationMs": 43000,
  "lastTaskResult": 1,
  "resultText": "Process exited with code 1",
  "source": "WINDOWS_TASK_SCHEDULER"
}
```

The UI must not need to know PowerShell-specific field names.

---

# Stage 0 — Repository Baseline

## Work

- Keep `index.html` as the reference UI.
- Create normal project structure.
- Add README with local startup instructions.
- Add configuration for monitored task names / task folders.
- Do not delete the mock UI until real API data can render the same screen.

Suggested configuration:

```yaml
dashboard:
  scheduler:
    include:
      - InsiderTracker-Market
      - InsiderTracker-SEC
      - SyncImport
    exclude: []
    missed-grace-minutes: 15
```

Support Windows Task Scheduler folders, because task names alone may not be globally unique.

## Gate

Application starts locally without changing any Windows scheduled task.

## Done when

- Project builds.
- Existing UI can still be opened.
- Configuration format is documented.

## Self-QA

- No existing task was modified.
- No admin privilege is required merely to open the dashboard.
- No external network dependency was introduced.

---

# Stage 1 — Read Windows Task Scheduler

## Work

Implement a collector using Windows ScheduledTasks data.

Initial source can use:

- `Get-ScheduledTask`
- `Get-ScheduledTaskInfo`

Collect at least:

- TaskName
- TaskPath
- State
- Enabled
- LastRunTime
- LastTaskResult
- NextRunTime
- trigger information when available

PowerShell output should be converted to a machine-readable format such as JSON instead of parsing formatted console tables.

Handle:

- task names containing spaces
- non-ASCII names
- tasks inside folders
- never-run tasks
- disabled tasks
- tasks with no next run
- PowerShell errors
- permission-denied cases

## Gate

For every configured task, compare dashboard raw values against Windows Task Scheduler and confirm they match.

## Done when

An API such as:

```
GET /api/jobs
GET /api/jobs/{id}
```

returns normalized current state.

## Self-QA

Manually compare at least 3 tasks against Task Scheduler:

- one successful task
- one disabled / not-due task
- one failed or manually simulated failed task

Do not silently convert collector failures into empty task lists.

---

# Stage 2 — Connect Real Data to Existing UI

## Work

Replace mock job rows with backend data while preserving the current design.

Required behaviors:

- Today summary counts
- Today job list
- Success / Failed / Missed filters
- detail drawer
- Refresh button
- responsive layout

The UI should clearly distinguish:

- failed
- missed
- running
- ready/not due yet
- disabled
- unknown

Do not make every non-success state pink/red. Keep semantic colors currently defined in the prototype.

If backend cannot be reached, show a visible collection error instead of displaying stale mock data.

## Gate

Refreshing the page shows values that correspond to current Windows Task Scheduler state.

## Done when

The mock data can be disabled and the page remains fully usable.

## Self-QA

- Desktop layout
- narrow/mobile-width layout
- long task names
- missing date values
- backend unavailable
- no monitored jobs
- more than 20 monitored jobs

---

# Stage 3 — Persist Execution History

## Work

Add SQLite.

Suggested tables:

```sql
job (
  id TEXT PRIMARY KEY,
  task_path TEXT NOT NULL,
  task_name TEXT NOT NULL,
  display_name TEXT,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

job_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  observed_run_at TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduler_result INTEGER,
  duration_ms INTEGER,
  message TEXT,
  raw_result TEXT,
  created_at TEXT NOT NULL
);
```

Avoid creating duplicate history rows every time the dashboard polls.

A run identity must be stable enough to recognize the same execution across repeated observations.

## Gate

Repeated polling does not duplicate the same run.

## Done when

7-day history in the existing UI is populated from SQLite.

## Self-QA

- restart application
- refresh repeatedly
- task with multiple runs in one day
- task with no run
- task disabled midway
- system clock/timezone handling

Store timestamps in an unambiguous format. UI should present them in local time.

---

# Stage 4 — Reliable MISSED Detection

## Work

Implement expected-run evaluation from configured / discovered triggers.

Start with trigger types actually used by this machine.

Do not attempt to support every Windows Task Scheduler trigger before knowing they are needed.

At minimum consider:

- daily fixed-time trigger
- multiple daily triggers if present
- task disabled
- task not yet due
- machine was off / asleep
- StartWhenAvailable behavior when discoverable

Use:

```
expected execution time
+ grace period
< now
AND
no matching run
= MISSED
```

But do not mark an execution missed while it is still within the grace window.

## Gate

Create controlled test tasks and verify:

1. task runs normally -> not missed
2. task due but not run -> missed
3. task not due yet -> ready
4. disabled task -> disabled, not missed

## Done when

The UI's Missed count can be trusted.

## Self-QA

Test around midnight and daily boundaries.

---

# Stage 5 — Better Application-Level Results

Windows `LastTaskResult = 0` is not sufficient proof that the underlying business operation was successful.

Do this only after Stages 1–4 work.

## Work

Introduce an optional job result contract.

Possible approach:

```
Task Scheduler
      |
      v
dashboard-runner
      |
      v
actual command
```

Runner records:

```json
{
  "job": "InsiderTracker-SEC",
  "startedAt": "2026-09-21T11:15:02+08:00",
  "finishedAt": "2026-09-21T11:16:21+08:00",
  "exitCode": 1,
  "status": "FAILED",
  "message": "SEC parser error"
}
```

Runner must propagate the actual process exit code.

Do not migrate all existing tasks at once.

Migrate one low-risk task first.

## Gate

Running through the wrapper produces the same business result and exit behavior as running the original command directly.

## Done when

Dashboard can distinguish:

- Scheduler says command launched
- actual application says success/failure

## Self-QA

- success exit code
- non-zero exit code
- timeout
- process crash
- command not found
- dashboard service not running

The scheduled job itself must still execute even if dashboard persistence fails.

---

# Stage 6 — Logs and Error Detail

## Work

Expose useful output in the existing detail drawer.

Possible sources:

1. runner stdout/stderr
2. configured log file tail
3. Windows Task Scheduler result/error
4. dashboard collector diagnostics

Limit log size returned to the browser.

Do not load entire multi-GB logs.

Suggested default:

- latest 200 lines, or
- latest 64 KB

Indicate which source produced the displayed log.

## Gate

A failed task can be diagnosed from the dashboard without opening Task Scheduler or manually searching the log directory for common failures.

## Done when

The existing `Latest output` panel displays real data.

## Self-QA

- empty log
- huge log
- Unicode
- locked file
- missing file
- multiline exception

---

# Stage 7 — 30-Day Reliability View

Only after reliable history exists.

Add:

- success rate
- failed run count
- missed run count
- average duration
- last failure
- 7 / 30 day toggle

Keep this secondary to today's status.

Do not turn the homepage into a dense monitoring product.

---

# API Suggestions

Keep API small.

```
GET /api/dashboard/today
GET /api/jobs
GET /api/jobs/{id}
GET /api/jobs/{id}/runs?days=7
GET /api/jobs/{id}/latest-output
POST /api/refresh
```

`POST /api/refresh` refreshes dashboard data only.

It must **not** execute a scheduled task.

Manual task execution can be considered later as a separate explicit feature.

---

# Error Handling Rules

The following states are different and must not be collapsed:

- Scheduler collector unavailable
- task does not exist
- task disabled
- task never ran
- task is running
- task failed
- task missed
- task not due yet
- history unavailable
- log unavailable

Surface uncertainty as `UNKNOWN` rather than guessing success.

---

# Security / Local Safety

Initial version:

- bind to `127.0.0.1`
- no inbound LAN access by default
- no credentials in repository
- no shell command composed from unsanitized browser input
- browser must not be able to execute arbitrary PowerShell
- API task IDs must map to server-known configured tasks

Do not add a generic "run command" API.

---

# Testing Strategy

Prefer tests around status classification.

Unit tests should cover:

- Windows result normalization
- status mapping
- missed detection
- grace period
- not-due-yet logic
- duplicate run detection
- timestamp handling

Integration tests may use fixture JSON representing PowerShell output so most tests do not depend on the developer machine's live Task Scheduler.

---

# Codex Working Rules

1. Start with `/plan`.
2. Work one stage at a time.
3. Do not implement later stages early unless required by the current stage.
4. Preserve the existing UI unless a backend requirement makes a small change necessary.
5. If a problem occurs, investigate and attempt a solution before asking the user.
6. Do not stop only to report a minor issue that can be resolved locally.
7. Never claim a Gate passed without verifying it.
8. At the end of each stage report:
   - files changed
   - commands/tests run
   - Gate result
   - known limitations
   - next stage
9. Keep changes reviewable.
10. Do not rewrite working scheduling scripts unless the current stage explicitly requires it.

---

# First Codex Assignment

Implement **Stage 0 and Stage 1 only**.

Do not connect the UI to real data yet.

Expected output:

- buildable local application
- scheduler collector
- normalized model
- `GET /api/jobs`
- configuration for include/exclude
- tests for normalization
- README startup instructions
- evidence that returned values match at least the available local Windows scheduler fixtures / live tasks

After Stage 1 passes its Gate, stop and report results before moving to Stage 2.
