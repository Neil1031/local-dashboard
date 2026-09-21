# Stage 5B — Single Real Task Runner Pilot

## Result

**Overall Gate NOT PASSED. Final local task uses the exact original Action.**
The single permitted manual Task Scheduler request failed with `0x80070002`
before any observable Runner receipt or weekly output. The migrated definition
was restored; no second manual request and no other task migration were made.
Mechanical migration, full rollback, equivalent child fixtures and existing
regressions passed. These do not prove that the real scheduler can launch Runner.

Baseline: `8b209bc98dd14962da594cab65c05250197fa5b2`.
Branch: `implement/stage-5b-runner-pilot`. Work: September 21–22, 2026, Asia/Taipei.
The repository and live task definition were inspected before implementation.
PLAN.md remains unchanged. No Runner, Launcher, Stop, collector, UI, schema or
stock-project source changes are included.

## Plan / stages / gates

| Stage | Scope and dependency | Gate / done when | Self-QA result |
| --- | --- | --- | --- |
| Baseline | Clean approved main; actual task and child source | Complete restore-ready XML/ACL/metadata and all task hashes | Saved before task writes; pilot original preserved |
| Equivalent profile | Existing Stage 5A CLI; packaged Java/JAR | Same executable, argument tokens, effective cwd and user in harmless fixtures | Passed, including nonzero/storage/config failures |
| Pilot | Only approved task Action; offline Dashboard | Apply, exact rollback, reapply, at most one safe manual request | Definition operations passed; actual launch failed; restored |
| Delivery | Data/task integrity, regressions, private evidence | Explicit evidence limits; branch commit/push; no merge | Research/verification delivery, not live acceptance |

## Original task definition

Task `\AIStockHunter-Accumulation-Weekly-Check`, enabled, Ready before work.
Weekly Friday 22:00 Taipei, one-week interval; next natural occurrence
`2026-09-25T22:00:00+08:00`. Existing InteractiveToken principal, LeastPrivilege,
IgnoreNew, StartWhenAvailable=true, WakeToRun=false, ten-minute execution limit,
and RestartOnFailure count=2 / interval=5 minutes were preserved.
Before manual request: LastRunTime `2026-09-18T22:00:00+08:00`, LastTaskResult=1.

Sanitized original Action (actual absolute paths are in private backup):

```text
Execute: C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe
Arguments: -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "<stock-project>\tools\run_stock_task_hidden.ps1" -Kind weekly-check -NoNotification
Start in: absent
```

Absent Start in uses `%windir%\System32`, per the
[New-ScheduledTaskAction contract](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskaction?view=windowsserver2025-ps).
The profile explicitly selects that directory; the scheduled Action keeps its
WorkingDirectory XML node absent. The existing PowerShell supervisor then selects
the stock project root as the Python worker's cwd, exactly as before.

## Pilot selection and side effects

Current working files were inspected, including `run_stock_task_hidden.ps1`,
`WindowsTaskJob.cs`, `run_stock_task.py`, `weekly_accumulation_check.py`, and the
read-only accumulation/readback and atomic-report paths. The stock repository has
existing uncommitted work and was not edited or reset.

The weekly branch opens the formal SQLite DB and operation journal with `mode=ro`;
it does not call collection, repair, promotion, strategy/trading or notification
delivery. Expected writes are only an append to `weekly-check-task.log`, a uniquely
identified weekly JSON report and replacement of weekly `latest.json`. Repeating
inspection does not alter formal data. Existing nine isolated tests also check
read-only/repeat behavior and forbid provider fetch/initialization.

This justified one manual request. The request did not produce these expected
outputs: all existing reports and the log remained byte-identical. Do not treat
the previous September 18 FAILED report as an output of this pilot.

## Trusted Runner deployment / profile

Stage 5A CLI was reused without modification:

```text
<release>\runtime\bin\java.exe -jar "<release>\runner.jar" run "<dashboard-home>\config\runner.json" aistockhunter-accumulation-weekly
```

The fixed local release is beneath
`%LOCALAPPDATA%\LocalDashboard\runner\releases\pilot-6582b291d95b1d4f`.
It copies the packaged runtime and classifier JAR outside `target`/`dist`, so a
future build cannot remove an active task's binaries. Every deployed file and
private config was hashed. Runner JAR SHA-256:
`6582B291D95B1D4FE070169D35E1622940703BB8CC0FED6E5CC24C694462F5AF`.

The private UTF-8, no-BOM config has one profile/job ID:
`aistockhunter-accumulation-weekly`. Child executable is the original absolute
Windows PowerShell path. Args are the exact ten tokens from the original Action,
including the absolute original script, `-Kind`, `weekly-check`, and
`-NoNotification`. No child command string is assembled. Primary receipts use
`<dashboard-home>\data\runner-receipts`; fallback uses
`<dashboard-home>\runner-fallback`. No browser or HTTP input is involved.

After final rollback, these local files remain as **unreferenced review artifacts**;
no Scheduled Task references this Runner release/config. No private config,
receipts, XML, logs, DB, account SID or user identity is committed.

## Migration, immutable fields and rollback

`scripts/stage-5b-weekly-pilot.ps1` supports Backup / Prepare / Apply / Restore /
Inspect and hardcodes only the approved task. It never starts any task. Backup
refuses existing destinations. Prepare requires the exact reviewed Action shape
and refuses existing config/release. Apply verifies backup, config, release and
other-task hashes before updating an idle task away from its natural trigger.

Only Exec.Command and Exec.Arguments were changed. Every XML field outside Actions
and the owner/group/DACL SDDL were verified unchanged, covering task name/path,
description, principal/user/logon/run level, all triggers, enabled state,
conditions, retries, timing and settings. Apply failures attempt exact restoration.
Restore refuses unexpected task changes rather than overwriting them.

COM RegisterTask uses UPDATE (4), DONT_ADD_PRINCIPAL_ACE (16), and
IGNORE_REGISTRATION_TRIGGERS (32), total 52; no CREATE or enable/disable operation.
See [Microsoft RegisterTask](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskfolder-registertask).
During initial verification, passing an explicit unchanged SDDL added a
RegistrationInfo/SecurityDescriptor node. This was detected and recovered.
The corrected helper omits the SDDL argument during UPDATE and verifies the
existing ACL separately. It waits for two consecutive matching fresh exports
instead of trusting an immediate registration readback.

Successful sequence: Apply → Restore → Apply → one manual request → final Restore.
Both rehearsal and final restore reproduced the original full XML bytes and ACL.
Original/final UTF-16 XML file SHA-256:
`71ED789B5639D1C0127D5D9969F45729EDEE86EBE47A59E369472CCA05C4E2E1`.
Task-wide hash comparisons use SHA-256 over the UTF-8 exported XML string; this is
a different encoding/hash measure from the saved UTF-16 XML file.

The external evidence root is
`%LOCALAPPDATA%\LocalDashboard\pilots\weekly-check\20260922-000842-pre-migration`.
Use the actual directory recorded in ignored `.tools/stage-5b-current.txt` if
working from this checkout. To verify or restore, without executing a task:

```powershell
$backup = (Get-Content .tools/stage-5b-current.txt -Raw).Trim()
./scripts/stage-5b-weekly-pilot.ps1 -Mode Inspect -BackupDirectory $backup
./scripts/stage-5b-weekly-pilot.ps1 -Mode Restore -BackupDirectory $backup
```

This branch is a failed-live-pilot review. Do not reapply the known failed candidate
as if it passed; further scheduler diagnostics or another real request require a
new reviewed scope. Generic Backup/Prepare/Apply capabilities exist for review,
not an instruction to retry this host. Apply rejects this backup's recorded failed
live result; that refusal was tested and left the task definition unchanged.

## Controlled execution and receipt evidence

Exactly one manual Task Scheduler request was recorded with a create-only local
request marker at `2026-09-22T00:11:50.3111819+08:00`. Before it: zero instances,
Ready, protected hashes unchanged, no Dashboard Java process or 8080 listener.

After it: LastRunTime `2026-09-22T00:11:50+08:00`, LastTaskResult=2147942402
(`0x80070002`), Ready, no instances. Primary and fallback had **zero live receipts**.
There is therefore no live executionId, child exit code, duration or terminal
outcome to report. The scheduler result is not a captured child exit code.

Diagnosis verified the configured executable exists, has a valid signature,
reports OpenJDK 25.0.2, and successfully executes the same-JAR fixtures from the
expected cwd. Config/release hashes and task readback matched. No relevant
Application-log event was found; TaskScheduler Operational logging was disabled
and was not enabled. The underlying launch cause remains **unverified**. No runtime,
ACL or scheduling guess was deployed to hide the failure. Microsoft's
[scheduler troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/troubleshoot-scheduled-tasks-not-running)
identifies task history as an additional diagnostic source; a future scoped
investigation needs launch-time evidence before another approved attempt.

## Offline and failure fixtures

`scripts/verify-stage-5b-runner.py --backup-directory <private-backup>` uses the
actual deployed Java/JAR, original interpreter/flags, and harmless replacement
PowerShell scripts in paths containing Chinese text and spaces. It compares the
original raw command-line shape with Runner's explicit args and records the same
Kind, NoNotification, cwd and Windows SID in private markers. It never invokes the
real stock child and never creates, edits or runs any Scheduled Task.

| Case | Observed result |
| --- | --- |
| Child 0 / 7 / 3010 | Direct and Runner OS exits identical; full three-phase receipt |
| Primary blocked by a regular file | Child 7 retained; fallback lifecycle complete |
| Primary and fallback blocked | Child executed, exit 7 retained, no receipt; fixed unavailable diagnostic |
| Missing config | Exit 64, fixed CONFIG_INVALID diagnostic; no child launch path |

Receipt fixtures contain one executionId per STARTED / PROCESS_STARTED / TERMINAL
set, jobId, timestamps, duration and matching child/Runner exits. These are fixture
receipts, **not live scheduled receipts**. `SUCCESS` here means child process
returned 0, not business success. Port 8080 was offline before/after every fixture
and before/after the real request. Offline direct Runner behavior passed; live
scheduler-offline execution and scheduler-to-child exit propagation did not pass.

## Other tasks and protected files

Initial inventory: 234 readable tasks. Before any registration, the integrity
guard detected a changed hash for
`\Microsoft\Windows\Flighting\OneSettings\RefreshCache`. Its current StartBoundary
was `2026-09-22T00:06:36+08:00`. The original inventory and drift evidence were kept;
the actor/cause cannot be proven with the disabled task event log. We did not edit
or run that task. A fresh full pre-migration inventory was captured while the
pilot still matched its original XML byte-for-byte.

Against that explicitly refreshed baseline, all 233 other task definitions were
unchanged after Apply and Restore, and final rollback restored **all 234 hashes**.
It would be incorrect to claim that all hashes remained identical throughout the
entire session from the first inventory.

109 source/protected data/config files were hashed before and after the request,
including the formal stock DB, operation journal, notification DBs/locks, existing
non-weekly outputs, Dashboard config and SQLite history. All were unchanged.
Existing weekly reports/log were separately unchanged, with no new weekly report.
No notification, trade, data fetch or second task was invoked by this work.

## Tests and Gate

- Maven/package: 133 tests, zero failures/errors/skips; bundled-runtime HTTP,
  writable isolated SQLite, safe defaults and packaged Stop smoke passed.
- Frontend/real browser: 32 passed, zero failures/skips.
- Existing weekly-check isolated tests: 9 passed; no formal DB used by tests.
- Deployed-runtime integration: all six cases above passed.
- Actual target definition apply/rollback/reapply and final exact restore passed.
- No application implementation changes requiring a different build were made.

**Definition migration / rollback checks: PASSED.**
**Actual Task Scheduler Runner integration: FAILED (`0x80070002`).**
**Overall Stage 5B Gate: NOT PASSED; candidate not retained.**
**Natural Friday scheduled Runner evidence: NOT VERIFIED, no Runner action left
installed to collect it.** The original task still has its Friday trigger.

Final local state: original PowerShell Action, Enabled=true, Ready, unchanged
Friday schedule/principal/settings. LastTaskResult remains the observed failed
manual attempt; restoring a definition does not rewrite execution history.
No main merge, second migration, monitoring automation or broader rollout.
