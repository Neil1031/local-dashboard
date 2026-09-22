# Stage 5B Retry — identity fix and attempt 2

**Principal fix and Scheduler preflight: PASSED. Controlled-operation integrity:
PASSED. Overall formal pilot Gate: FAILED because the weekly child returned 1.**
The one formal request completed, full Runner receipts and exit propagation were
verified, and the weekly task was restored to its exact original XML and ACL.
No retry, business-data repair, second task migration or main merge occurred.

This continues `implement/stage-5b-retry` from `3891db44b695f10171f065ee637408d3689f9df1`
under the Manager's explicit identity-fix authorization. Main remains
`42356abcdf206f0440f632268628d27a473dce6d`.

## Identity comparison

`scripts/windows-principal.ps1` resolves both the original XML UserId and diagnostic
readback UserId to `SecurityIdentifier.Value`. SID inputs use the SID constructor;
account names use `NTAccount.Translate(SecurityIdentifier)`. Blank identities and
translation failures throw a fixed error without exposing account text. There is
no guessing and no raw-string fallback.

The fixture's expected identity hash now comes from the canonical original SID.
The actual child hashes `WindowsIdentity.GetCurrent().User.Value`. Thus original
principal, registered/readback principal and actual process token are compared on
the same representation. The three observed hashes are identical:

```text
4030C819EB62D4F4EAEBB717E506185749F92413DC12038017F0E5963FC852F0
```

Four regressions passed: current account name versus token SID, unchanged SID
input, invalid account translation fails closed, and empty identity fails closed.
Only identity hashes and equality booleans are exported; no account name/raw SID.

## Attempt history and deployment reuse

Attempt 1 is unchanged in [`STAGE-5B-RETRY.md`](STAGE-5B-RETRY.md) and the original
[`stage-5b-retry` evidence](evidence/stage-5b-retry/): literal principal comparison
FAILED, zero requests and no Runner execution. Its private artifacts were not
overwritten. Attempt 2 has a separate private directory and a separate
[`attempt-2` evidence directory](evidence/stage-5b-retry/attempt-2/).

The existing immutable deployment was reused. Before preflight and again after
rollback, all 218 runtime/JAR hashes and the private config hash matched the
original manifest; RunnerRoot validation passed. No runtime was copied and no
release/config was overwritten. No task referenced the candidate before this
attempt or after final restore.

## Scheduler preflight attempt 2

The single triggerless diagnostic used the same canonical principal,
InteractiveToken, LeastPrivilege and unified Scheduler engine as the weekly task.
Its Action invoked stable Java directly. **Exactly one diagnostic request** ran.

- Canonical original/readback/process identity equality: true.
- Scheduler child verified all 218 release files plus private production config:
  219 files visible, every SHA-256 matched.
- Java and Runner started; harmless PowerShell fixture returned 0.
- One executionId had STARTED, PROCESS_STARTED, TERMINAL; duration 715 ms.
- Scheduler result = Runner result = fixture result = 0.
- Diagnostic task, config, fixture and temporary files were deleted.
- Weekly XML/ACL stayed exact original throughout preflight.

This establishes actual Scheduler-context execution, not merely creator-context
file visibility. No Stage 5B-R root-cause matrix or trampoline was used.

## Controlled-operation integrity versus ambient drift

The original 234-task baseline is retained without replacement. Historical
attempt 1 remains: **234/234 identical immediately after diagnostic cleanup**,
then a later read-only audit observed `OneSettings\RefreshCache` drift. The old
report's original strict all-task failure verdict remains as historical evidence;
the Manager's revised interpretation is recorded separately as
**EXTERNAL_DRIFT_OBSERVED**, actor/cause **UNKNOWN**.

Before attempt 2's first mutation, only that same explicitly accepted system task
differed from the original baseline. Its current hash was saved as a fixed delta
to the original inventory, not as a new full/replacement baseline. User/pilot
tasks and all other definitions received no exceptions. Any change to this fixed
comparison state during controlled operations would be a HARD FAIL, including
further changes to RefreshCache. The owned diagnostic is the sole temporary
addition; its definition and ACL are checked while present.

**All 18 controlled checkpoints passed**, including before/after diagnostic
registration, readback, execution/deletion, formal Apply/Restore, inspect and live
execution. They cover 234 expected tasks, or 235 while the owned diagnostic exists.
The final controlled Restore checkpoint passed at `2026-09-22T02:45:26+08:00`.

The later ambient audit still observed only the known RefreshCache delta from
the original inventory, and **no new differences from the controlled anchor**.
Its observed StartBoundary was `2026-09-22T02:28:01+08:00`. No claim is made about
who changed it or why. No unrelated task was altered, restored or run by this work.
This ambient observation does not negate the passed controlled checks.

Only one original full inventory is needed. Attempt 2 publishes its fixed
pre-operation delta, compact checkpoints and final diff, plus detail for the sole
drifting system task; it does not add full inventories for each operation.

## Rehearsal and the single formal weekly request

After preflight PASSED: Apply → exact Inspect → Restore → exact original XML/ACL
verification → Apply → exact Inspect all passed. Only the Action changed; the
full non-Action XML and ACL equality checks cover triggers, principal, enabled
state, conditions, RestartOnFailure, timeout and registration information.

Before requesting execution: Dashboard had no process/listener on 8080, the task
was Ready/Enabled with zero instances, the 135-file protected baseline was exact,
the two existing weekly reports/log were snapshotted and receipt roots were empty.
The create-only request record prevents a second manual request.

One `Start-ScheduledTask` request was issued at `2026-09-22T02:45:14+08:00`.
LastRunTime updated from `00:11:50` to `02:45:14`. Dashboard remained offline in
the before/after observations.

| Receipt field | Observed value |
| --- | --- |
| executionId | `aistockhunter-accumulation-weekly_1790016314870_1cb96c96-b5c5-43a9-a04a-b5c17cb85999` |
| phases | STARTED → PROCESS_STARTED → TERMINAL, same executionId |
| startedAt | `2026-09-21T18:45:14.870391700Z` |
| processStartedAt | `2026-09-21T18:45:14.952233600Z` |
| finishedAt | `2026-09-21T18:45:16.308399700Z` |
| durationMs | 1437 |
| exitCode / runnerExitCode / Scheduler result | **1 / 1 / 1** |
| outcome | FAILED |

The weekly report was `FAILED`, with `DAY_INCOMPLETE:2026-09-18` and
`UNRESOLVED_REVALIDATION`. These are observed report results, not a new diagnosis
or a repair. The existing command maps its non-success report to exit 1. Transport,
receipt lifecycle and exit propagation worked, but **the user's required zero-exit
formal pilot Gate did not pass**. No business-success claim is made.

## File effects, rollback and final state

All 135 protected source/data/config files were unchanged, including formal stock
SQLite/locks, operation journal, notification databases, non-weekly outputs and
Dashboard config/history. Stock working-tree status hash was unchanged. One new
weekly report was produced; `latest.json` matched it; older reports were unchanged;
the weekly log only appended bytes with its old prefix intact. Notifications were
`NOT_REQUESTED`; report inspection mode was `READ_ONLY_OBSERVATIONS`.

On nonzero result, evidence was saved and exact rollback completed at 02:45:26.
Final XML hash equals original `2D4183FD...`, and the original ACL is exact.
Final state: **original PowerShell Action, Ready, Enabled, zero instances**.
The Friday trigger and all other settings remain unchanged. The ambient audit
confirmed the same single-run metadata (LastTaskResult 1) and exactly three live
receipt files; no second request was issued. The original execution history is
not rewritten by rollback.

The release/config and live receipts remain private and explicitly
**UNREFERENCED**. The local marker was updated to describe this failed formal run.
No retry of the previously policy-blocked deletion was attempted. Candidate
retention is not a reason for the integration Gate failure; child exit 1 is.

## Validation and disposition

- Canonicalization: 4 passed; RunnerRoot: 13 passed.
- Maven verify: 133 tests, zero failures/errors/skips.
- Frontend/real-browser regressions: 32 passed, zero failures/skips.
- Actual Scheduler fixture, rehearsal and exact final rollback: passed.
- PowerShell syntax and `git diff --check`: passed.
- Package smoke was not rerun: no application/packaging source changed. The
  successful attempt-1 package smoke is retained separately, not relabeled as a
  new test. The deployed files remain hash-identical to that built release.

The exporter asserts this attempt's boundaries before writing a new output
directory. Sanitized evidence contains selected receipt fields and source hashes,
not raw receipts/logs/config/XML/DB files. Previous attempt files remain unchanged.

**Overall Stage 5B Retry: FAILED. Final task state is safe and unambiguous.**
Commit/push on the same branch, no merge. Stop for Manager Review; no second
formal request, stock repair, additional diagnostic attempt or broader migration.
