# Local Dashboard Implementation Plan

# Current roadmap — 2026-09-23（等待 Manager Review）

本輪已核對遠端 `main` = `22af205509f2a25ce287053a120cd6a82784a8ee`。
本次只更新規劃文件；新的 Stage 排序是待審提案，不授權功能實作、排程操作、部署或正式資料修復。

- **完整完成盤點／backlog／優先順序／各 Stage Gate**：[docs/BACKLOG.md](docs/BACKLOG.md)。
- **新增 Dashboard UX metadata 需求與 UX-A/B/C**：[docs/DASHBOARD-UX-METADATA.md](docs/DASHBOARD-UX-METADATA.md)。
- 已合併：Stage 0/1、2、3A、3B、5A、Windows app-image/launcher、config bootstrap、monitoring selection、中文 aliases、Safe Stop，以及 Stage 4 與 5B 的研究／失敗證據。
- **5B final migration = BLOCKED**：attempt 2 preflight/receipt/exit propagation 通過，但 ai-stock-hunter weekly-check child exit `1`（`DAY_INCOMPLETE:2026-09-18`、`UNRESOLVED_REVALIDATION`），已 exact rollback；merge 不表示 migration 成功。
- **Stage 4 MISSED = DEFERRED**：缺足夠 coverage/negative evidence；4R/4A/4B/4C/4D 均未啟動，不阻擋其他 Stage。
- **Port 43871 = BRANCH_ONLY**：`fix/dashboard-port-43871` / `96fd763d` 尚未進 main；另待 Manager 處置，本輪不合併。

建議執行順序（舊 Stage ID 保留，依此優先順序排工作）：

| 優先順序 | Stage 與目標 |
| --- | --- |
| P0 | Manager Review 本規劃；獨立 review 43871 分支的整合／延期 |
| P1 | **UX-A metadata／基本顯示 → UX-B 日期折疊／流程視圖 → UX-C 之後的顯示設定頁** |
| P2 | **5C Runner receipt API/UI → 6 Logs/error detail**；5B final migration 保留 BLOCKED，外部 blocker 處置與 Manager 再授權後另排單一 pilot |
| P3 | **8A Tray → 8B opt-in auto-start → 8C installer/upgrade/uninstall → 8D updater** |
| P4 | **7 三十日 observed reliability**；**4R–4D MISSED** 保留 deferred evidence strategy，不把未知顯示為 0 |
| P5 | **9 維護 backlog**：retention/backup、collection/UI 韌性、history 規模、identity linkage、平台/無障礙、Runner 進階政策、可選控制功能 |

Blocked/Deferred 項目不構成整個佇列的串行阻塞。5C 可使用隔離 receipts 開發，不需重新跑正式 5B；
三十日 observed metrics 可獨立於 MISSED，但 duration／missed count 必須標示實際來源與可用性。
下列原始 Stage 規格保留作設計與歷史追溯；目前狀態與下一個指派以上述 roadmap、backlog 與本文末節為準。
歷史 `docs/STAGE-*.md` 的「Next stage／pending merge」只表示當時交付狀態。

---

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

Preserve the existing UI as the baseline; the proposed UX-A/B/C stages may extend its information layout only after Manager approval. Preserve the existing pink visual language, spacing, cards, status presentation, responsive behavior, Today view, History view, filtering, and detail drawer.

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

**Deferred design, not current behavior.** The conditions below are necessary but not sufficient: Stage 4R–4D must first establish trustworthy occurrence identity and observation/negative-evidence coverage. A missing run alone remains UNKNOWN; see [the current Stage 4 backlog](docs/BACKLOG.md).

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

- current scheduler summary counts
- current job list
- current-status filters
- last-run outcome shown separately from current status
- detail drawer
- Refresh button
- responsive layout

The UI should clearly distinguish:

- failed
- running
- ready/not due yet
- disabled
- unknown
- missed, only when the backend explicitly returns MISSED

Stage 2 must **not infer MISSED** from time, dates, `nextRunAt`, `lastRunAt`, or `NumberOfMissedRuns`.
Reliable expected-run / MISSED detection belongs to Stage 4.

Do not treat `READY + lastRunStatus=SUCCESS` as "today succeeded". Stage 2 is a current scheduler overview, not an execution-window tracker.

Do not make every non-success state pink/red. Keep semantic colors currently defined in the prototype.

If backend cannot be reached, show a visible collection error instead of displaying stale mock data. Never fall back to runtime mock scheduler data.

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

# Stage 3A — Persist Execution History Core

## Work

Add SQLite persistence for jobs and observed completed executions.

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

Requirements:

- persist across application restart
- repeated polling must not create duplicate history rows for the same execution
- define and document a stable run identity / deduplication rule
- do not invent executions when Task Scheduler does not provide enough evidence
- preserve current Stage 2 UI behavior
- do not implement 7-day history rendering yet
- do not implement MISSED detection yet

## Gate

The same scheduler execution observed repeatedly produces exactly one persisted run, including after application restart.

## Done when

- SQLite schema is created/migrated safely
- current jobs can be associated with persisted history
- duplicate observation tests pass
- restart persistence is verified
- history can be queried internally/API-ready without changing the 7-day UI

## Self-QA

- restart application
- refresh repeatedly
- same task observed many times
- task with multiple distinct executions
- task with no recorded run
- task disabled midway
- failed and successful last results
- timezone / UTC storage
- database file missing on first startup
- database unavailable/corrupt failure behavior

Store timestamps in an unambiguous format. Prefer UTC persistence; UI localization remains a presentation concern.

---

# Stage 3B — 7-Day History API and UI

## Work

Build the user-facing history view on top of the verified Stage 3A persistence layer.

Add only the API/data shaping needed by the existing 7-day history UI.

Requirements:

- populate real 7-day history from SQLite
- no fake history cells
- support multiple executions for the same task on one day
- preserve task identity across renamed display text where possible
- keep current scheduler snapshot and history concepts separate
- do not infer MISSED; Stage 4 owns MISSED detection

### 7-day history presentation rules

The history grid is a **daily summary of observed runs**, not a replacement for individual executions.

For each job + local calendar day:

- no observed runs -> neutral empty cell
- exactly one SUCCESS -> green success cell
- exactly one FAILED -> red failed cell
- multiple runs, all SUCCESS -> green cell with the run count
- multiple runs containing at least one FAILED -> red/attention cell with the run count
- a later SUCCESS must never erase the fact that an earlier run failed that same day

A day cell with observed runs must be interactive. Selecting it shows all runs for that job/day in chronological order, including at least:

- local execution time
- SUCCESS / FAILED outcome
- scheduler result code
- result/message when available

Do not collapse multiple runs into only the final outcome.

Use the browser's local calendar day for grouping presentation, while persisted run identity/timestamps remain UTC.

The 7-day window should be seven local calendar days including today.

History queries must be bounded and must not trigger a fresh Windows Task Scheduler collection.

## Gate

The 7-day UI matches persisted run records for controlled fixtures and real observed runs, including multi-run days where a failure is followed by a success.

## Done when

- history API is stable and bounded
- 7-day history renders real persisted executions
- empty/no-history state is clear
- repeated refreshes do not alter historical counts
- desktop and narrow layouts remain usable

## Self-QA

- no history
- one run
- multiple runs in one day
- success then failure on same day
- failure then success on same day
- seven-day boundary
- local midnight / UTC boundary
- renamed task display name
- deleted/disabled task with retained history

---

# Stage 4 — Reliable MISSED Detection

## Manager status

**Deferred after two research passes.**

Research established that current Task Scheduler snapshots, Stage 3 observed-run history, and the currently disabled Task Scheduler Operational log do not provide sufficient negative evidence to declare a scheduled occurrence MISSED reliably on this machine.

Current product behavior:

- preserve reliable SUCCESS / FAILED / RUNNING observations
- preserve UNKNOWN when evidence is insufficient
- do not infer MISSED from elapsed time, empty history, LastRunTime gaps, NumberOfMissedRuns, or an empty Event Log query
- treat automatic MISSED detection as a future enhancement requiring a separately approved evidence strategy
- do not block Stage 5 on unresolved MISSED detection

See:
- `docs/STAGE-4-RESEARCH.md`
- `docs/STAGE-4-EVENT-RESEARCH.md`


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

The following is only a candidate rule after the separately approved evidence/coverage Gate; it must not be implemented from timestamps or missing receipts alone.

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

Stages 1–3B are available; Stage 4 MISSED is deferred and does not block Stage 5. Stage 5A is merged, 5B final migration is blocked, and 5C receipt API/UI is planned; see the current backlog.

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

1. A long-lived **Manager Chat** owns requirements, PLAN updates, review, Gate decisions, and the decision to start the next stage.
2. Each implementation stage should normally use a **new Codex Implementation Chat**. Do not continue the previous implementation chat into the next stage.
3. Use a separate Research / Debug Chat when a bounded investigation would otherwise distract or destabilize the implementation chat.
4. Repository files are the source of truth; do not depend on previous chat context being available.
5. Start every implementation stage with `/plan`.
6. Work one stage at a time.
7. Do not implement later stages early unless required by the current stage.
8. Preserve the existing visual language; only the separately approved UX stage may extend information layout within its stated scope.
9. If a problem occurs, investigate and attempt a solution before asking the user.
10. Do not stop only to report a minor issue that can be resolved locally.
11. Never claim a Gate passed without verifying it.
12. At the end of each stage report:
   - files changed
   - commands/tests run
   - Gate result
   - known limitations
   - follow-up recommendations
   - next stage
13. Keep changes reviewable.
14. Do not rewrite working scheduling scripts unless the current stage explicitly requires it.
15. After a stage passes its Gate, commit and push the implementation branch, then stop. Manager Review decides whether it is merged.
16. Do not merge an implementation branch to `main` until Manager Review explicitly passes it.

---

# Current Next Codex Assignment

**本次：Planning only，commit/push 新的 planning branch 後，等待 Manager Review。**

本輪 scope：核對最新 main 的 PLAN/README/docs 與實作入口、整理完整 backlog、正式寫入 UX metadata 需求、修正過時指派與目前狀態。
不實作功能、不改 configuration/schema/Scheduler/正式資料、不重跑 Stage 5B、不啟用 Event Log、不 merge main。

Manager Review 後建議另開 **UX-A — Dashboard Job Metadata / Basic Display only** 的 Implementation Chat，從當時最新 main 開始：

- 依 [UX 設計提案](docs/DASHBOARD-UX-METADATA.md) 定義 Dashboard 專用 metadata contract。
- 台股／美股／其他、中文 display name/description、前置與推導後置、自訂排序、legacy 預設隱藏、備註。
- 保留 raw Scheduler name/path/Description、current/last-run 區別、history identity；不改 Windows Task Scheduler Description。
- metadata 缺失／無效、同名不同資料夾、循環／缺少依賴、排序衝突、hidden attention 與 fallback 都需明確 Gate。
- **UX-B 日期型 task 折疊／流程視圖** 與 **UX-C 顯示設定頁** 是後續獨立 Stage，不在 UX-A 提前實作。
- 5B final migration、5C Runner receipt UI、Stage 6 logs、7 reliability、8 Windows 產品化、9 維護與 Stage 4 MISSED 不遺漏，也不夾帶進 UX-A。

驗收與停止點：docs-only diff、連結／需求覆蓋／狀態一致性檢查，提交／推送 planning branch；
Manager 決定是否合併與何時開始下一 Stage。此段取代過時的「下一步 Stage 5A Runner Core」指派。
