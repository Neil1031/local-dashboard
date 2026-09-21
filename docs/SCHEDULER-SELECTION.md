# Scheduler monitoring selection — Manager Review

Verified on 2026-09-21, Asia/Taipei. Branch: `fix/scheduler-monitoring-list`.

## Plan / Stage / Gate

| Stage | Goal and scope | Dependency | Gate / Done when | Self-QA |
| --- | --- | --- | --- | --- |
| 1 | Sync main; read-only scheduler inventory | Clean checkout, read access | Required tasks exist; definitions captured | Export all accessible definitions/actions/triggers |
| 2 | Prefix selector, template, display aliases | Existing selector and bootstrap | Shared Java/PowerShell contract; unchanged identity | Selector fixtures, real PowerShell, SQLite integration |
| 3 | Back up local include config; repackage | Stage 2 tests; approved bootstrap dependency | Existing config retained; current image built | Byte comparison, Maven verify, bundled runtime smoke |
| 4 | Actual home API/UI and integrity | Packaged image | All 15 requested Gates pass | Real HTTP/DOM, history identity, 234-task hashes |

The user approved carrying bootstrap commit `cd799cc` from `fix/windows-config-bootstrap`; it was cherry-picked as `046e635`. The synchronized main did not yet contain it. Main was not merged or modified.

## Actual Task Scheduler findings

All four tasks have TaskPath `\`. Times below are Asia/Taipei.

| Task | Enabled | Actual trigger | Next run at inspection | Matches request |
| --- | --- | --- | --- | --- |
| AIStockHunter-UnexplainedVolume-Daily | true | Mon–Fri 14:30 and 17:00 | 2026-09-22 14:30 | Yes |
| AIStockHunter-Accumulation-Weekly-Check | true | Friday 22:00 | 2026-09-25 22:00 | Yes |
| AIStockHunter-Accumulation-Check-2026-09-22 | true | One-time 2026-09-22 18:00 | 2026-09-22 18:00 | Yes |
| AIStockHunter-UnexplainedVolume-HealthCheck | false | Legacy Mon–Fri 13:35 | Scheduler reports 2026-09-22 13:35 despite disabled | Yes, disabled |

Actions were inspected read-only. All four invoke the existing hidden stock-task PowerShell wrapper: respectively `-Kind daily -EnableNotification -ScheduledRetries`, `-Kind weekly-check -NoNotification`, `-Kind startup-check -CheckDate 2026-09-22 -EnableNotification`, and `-Kind health`. No action was run or changed.

`InsiderTracker-Market`, `InsiderTracker-SEC`, and `InsiderTracker-SyncImport` exist, are enabled at root, and remain selected. Their next runs were 2026-09-22 06:30, 11:15, and 10:40 respectively.

## Monitoring list before / after

Before: three InsiderTracker tasks, legacy HealthCheck, weekly check (five exact selectors).

After: three InsiderTracker tasks, Daily, weekly check, and `\AIStockHunter-Accumulation-Check-*` (six selectors).

The actual current view has **eight jobs**: the wildcard also finds the still-existing 2026-09-18 and 2026-09-21 checks. These are enabled but have no next run. The requested prefix intentionally selects all three dated tasks; no implicit date/enabled filter was added. HealthCheck is absent from current monitoring and remains in SQLite history.

## Selector change

Only a nonempty prefix followed by a single trailing `*` is special. A leading `\` matches full path; otherwise the prefix matches task name across folders. Matching is case-insensitive. Exact names/paths and trailing-backslash folder subtrees remain supported. Other `*` positions, repeated `*`, bare `*`, `?`, brackets and regex-looking text remain literal; no general glob/regex engine.

Include and exclude share the same matcher. A found include stays matched even when its tasks are excluded. A missing prefix remains unmatched. Thirty-two shared cases exercise Java and the production PowerShell function; collector tests also exercise unmatched/exclude behavior.

## Local config migration

Backed up `%LOCALAPPDATA%\LocalDashboard\config\application.yml` to `application.yml.backup-20260921-184630` before editing. Replaced the old HealthCheck selector with Daily and added the dated prefix. All other bytes remained unchanged, including database path, busy timeout, exclude, grace period and timeout. The backup and private config are outside Git.

Bootstrap's existing-config policy is unchanged; this was a one-time explicit migration, not automatic overwriting on launch.

## Display names

| Original name | Display |
| --- | --- |
| InsiderTracker-Market | 市場資料更新 |
| InsiderTracker-SEC | SEC 內部人交易更新 |
| InsiderTracker-SyncImport | 內部人資料同步 |
| AIStockHunter-UnexplainedVolume-Daily | 異常成交量每日掃描 |
| AIStockHunter-Accumulation-Weekly-Check | 籌碼累積每週檢查 |
| AIStockHunter-Accumulation-Check-YYYY-MM-DD | 籌碼累積上線檢查 · YYYY-MM-DD |
| AIStockHunter-UnexplainedVolume-HealthCheck | 舊版異常成交量健康檢查 |

Aliases preserve raw names/subtitles and IDs in current/history. Unknown names fall back unchanged. Tests cover both 2026-09-22 and 2026-10-01 without hardcoding dates in runtime/template.

## Tests / verification

- `scripts/package-windows.ps1 -JdkHome <JDK 25>` ran Maven **clean verify: 120 passed, zero failed/errors/skipped**, then jpackage and isolated bundled-runtime/SQLite smoke.
- Node 24: dashboard/history mapping and browser suites **32 passed**, no skips. The system's old Node cannot run `--test`; verification used the available bundled Node, without changing system settings.
- Packaged bootstrap acceptance passed clean first run, restart preserving config/history, existing custom config, concurrent first run, default home, real UI, and unchanged scheduler hashes.
- Actual user-home live browser suites **2 passed**, no skips: Chinese labels, raw names, drawers, Refresh, desktop/mobile screenshots, no JavaScript errors or page overflow. Screenshots were visually inspected.
- Live `/api/jobs`: **OK**, eight jobs, empty unmatched/errors. Read-only comparison verified each task's identity, enabled/state, results/times, all trigger properties, and detail ID.
- The live verifier was corrected to distinguish a raw Windows date from normalized null for `SCHED_S_TASK_HAS_NOT_RUN`; application normalization was not changed.
- Exact-to-prefix selection preserves the pinned job ID and same SQLite run row in an integration test. Actual original five run identities/times/outcomes remain; three newly observed executions bring history to eight. HealthCheck's original history remains. SQLite integrity is `ok`, schema/version remain v1.
- Packaged JavaScript, collector and bootstrap template byte-match current source. Repeated actual-home EXE launch reused PID 41744.
- `git diff --check` passed. No job-ID algorithm, database schema, Stage 5B, or scheduler mutation was introduced.

## Packaged EXE

`dist/LocalDashboard/LocalDashboard.exe` is the newly built image and the real user's running dashboard uses its bundled runtime/JAR. The previous image is preserved by the existing package script. The desktop shortcut already points to the correct EXE; its SHA-256 remained unchanged and it was not recreated.

EXE SHA-256: `057513578e2c6ce1203dc243e0826057f940c2394bb8328512d89e37fad766aa`.
Dashboard JAR SHA-256: `6522e2134582950b4a87e751f2d41eb29531880c7d1058dc563bd1386a4732b1`.

## Scheduled Task integrity

All **234** accessible tasks have identical before/after full definition, Actions and Triggers SHA-256 values and Enabled values. No task was run, enabled, disabled, rescheduled, registered or deleted. Only the identified Local Dashboard server was restarted to load the new package/config.

## Gate result and evidence

**PASS: all 15 requested Gates.** Complete local receipts (not committed) are in `%TEMP%\dashboard-scheduler-selection-20260921-184117`; bootstrap acceptance is in `.tools/config-bootstrap-acceptance/e23bb42e660147448606a70eedd07454/verification.json`; desktop/mobile evidence is in `target/stage-2`.

This verifies dashboard collection/display and identity preservation. Existing FAILED task outcomes are faithfully displayed; their underlying workflows were not repaired or rerun. Ready/status values do not imply business success.

Stop after commit/push for Manager Review; do not merge main.
