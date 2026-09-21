# Stage 5B Retry — stopped at failed preflight

**Gate: FAILED. No formal migration or weekly execution occurred.** The weekly
task retains its exact original XML and ACL, Ready and Enabled. This branch is
evidence of a failed attempt and deployment/guard tooling, not completed Stage 5B
integration. Baseline main was `42356abcdf206f0440f632268628d27a473dce6d`.

## What happened

On 2026-09-22, a versioned release was prepared in an inspected, physical fixed
NTFS workspace sibling, `[RUNNER_ROOT]`. It is outside AppData, package caches,
the repository and build output. The creator-context validator found no reparse
ancestors or redirected resolution. All 218 runtime/JAR file hashes matched
their packaged sources after copying, and matched again at final inspection.
The private configuration is separate and was created without overwriting an
existing file. No application, Runner production code or Stop behavior changed.

The triggerless diagnostic was registered with the weekly XML's UserId,
InteractiveToken, LeastPrivilege and the same unified Scheduler engine. Its
Action readback pointed directly to the stable Java/JAR and a harmless fixture.
Before calling `Run`, the new helper compared COM `Principal.UserId` **as a literal
string** with the original XML UserId. That comparison returned false. All seven
other recorded context/Action checks returned true.

The helper therefore failed its preflight gate **before any diagnostic execution**.
The diagnostic task and its configuration, fixture and temporary directories were
deleted. No second diagnostic attempt was made. No Java launch, Scheduler-context
file probe, fixture execution or receipt was observed in this attempt. There is
no evidence here of a recurrence of the previous missing-file launch failure.

**Evidence limitation:** identifiers were not canonicalized to Windows SIDs. The
diagnostic's raw principal readback/XML was not retained before deletion. A false
string comparison does not prove different Windows accounts. The recorded fact
is a failed helper assertion, not a proven security-context mismatch. The
preflight helper is experimental and is not accepted as a working identity gate.
A future reviewed attempt would need semantic identity verification and retained
sanitized comparison evidence. This attempt does not make that change or rerun.

## Deployment and migration guard

The migration helper now accepts an explicit `-RunnerRoot`. The validator rejects
relative/drive-relative/UNC/device paths, AppData/LocalCache/build/temp ancestry,
repository descendants and reparse/resolved-path mismatches. It does not establish
Scheduler access: only a successful Scheduler-context preflight could establish
that. A fixed version is selected by the full Runner JAR SHA-256:

```text
[RUNNER_ROOT]/releases/<sha256>/runtime/
[RUNNER_ROOT]/releases/<sha256>/runner.jar
[RUNNER_ROOT]/config/runner.json
[RUNNER_ROOT]/receipts/
[RUNNER_ROOT]/fallback/
```

The configured weekly profile uses the original PowerShell executable, original
weekly-check/NoNotification tokens and the previously established effective
System32 working directory. The planned Action references only this fixed
release, never `target`, `dist` or `.tools`; the original Action's absent working
directory element is preserved. **This Action was prepared, never applied.**

Apply requires a passed preflight tied to the deployment manifest and original
XML hashes, deleted diagnostic, unchanged private config/release, idle task and
unchanged non-pilot task definitions. Both negative checks were exercised:

- Missing preflight: Apply rejected; weekly XML remained exact original.
- Failed preflight: Apply rejected; weekly XML remained exact original.

No call reached formal task registration. Apply/Restore/Apply rehearsal and final
rollback exercise were **NOT RUN**. Equality of an unchanged definition is not
claimed as a successful rollback rehearsal.

## Weekly task and execution boundaries

Baseline captured XML, ACL, Action, Triggers, Principal, Settings, RegistrationInfo,
Enabled/state and execution metadata with private file hashes. Final verification:

| Property | Final observation |
| --- | --- |
| Action | Original PowerShell Action |
| XML / ACL | Exact original equality |
| Trigger / principal / all settings | Unchanged, covered by full XML equality |
| Enabled / state / instances | true / Ready / 0 |
| LastRunTime | 2026-09-22 00:11:50 +08:00, unchanged |
| LastTaskResult | `0x80070002`, unchanged metadata from the previous attempt |
| Formal manual requests | 0 |
| Diagnostic run requests | 0 (registration/readback only) |
| Live receipts / child exit / Scheduler vs Runner comparison | NOT RUN / NOT VERIFIED |
| Dashboard final state | No Dashboard process found; no 8080 listener |

There was no weekly child result to describe as either process success or
business success. Live-only protected-file/output snapshots were not taken
because execution was never reached. No stock scripts/data were edited and no
weekly-check, notification, trade, migration of another task or retry was invoked.

## Scheduler integrity and evidence

The evidence layout is one baseline inventory, compact checkpoint assertions and
one final inventory. At diagnostic cleanup **all 234 definitions matched** the
baseline. At final audit **233 of 234 matched**: one non-pilot Windows task drifted:

`\Microsoft\Windows\Flighting\OneSettings\RefreshCache`

Its baseline hash starts `1E513621`, final hash starts `D5D57AA8`; current observed
StartBoundary was `2026-09-22T02:15:50+08:00`. This work never wrote or ran that
task. Actor and cause are **UNKNOWN**. Only baseline hashes, not full baseline XML
for every non-pilot task, were captured, so an exact field-level before/after diff
cannot be established. No baseline was replaced to mask this drift and no attempt
was made to restore an unrelated task. **Final complete integrity: FAILED.**

Only the drifting task gets additional definition-field evidence. Raw XML, ACL,
configuration and logs remain private. Sanitized artifacts and their original
source hashes are in [`evidence/stage-5b-retry`](evidence/stage-5b-retry/).
The final metadata collector corrected a string-versus-JSON-DateTime comparison
to compare UTC ticks; both original timestamps were identical. This collection
correction did not write or run any task.

## Cleanup

The diagnostic task and temporary diagnostic files were deleted. No separate
temporary test release was created. A read-only scan found zero Scheduler
definitions referencing the candidate deployment.

Automatic approval review rejected the candidate deletion command with only
`blocked by policy`; the command did not execute. The 218 release files and private
config remain in the durable root, explicitly marked **UNREFERENCED** by a local
`UNREFERENCED.json`. They are not an installed pilot. No deletion workaround was
attempted. Private evidence was retained, and no deployment binary/config was
added to Git.

## Gates and regressions

| Gate | Result |
| --- | --- |
| Physical durable root / create-only release / copied hashes | PASSED in creator context |
| Scheduler principal assertion | FAILED; literal identity comparison limitation |
| Scheduler visibility / Java / harmless three-phase receipt | NOT RUN |
| Complete original weekly backup | PASSED |
| Action-only migration / rollback rehearsal | NOT RUN |
| Offline formal live run / receipt / child / matching exits | NOT RUN |
| Final exact original XML / ACL / Ready / Enabled | PASSED; task never changed |
| Final all-task integrity | FAILED: one unrelated definition drift |
| Maven / package | 133 tests, 0 failures/errors/skips; package readiness, isolated SQLite and safe Stop smoke PASSED |
| Frontend / real-browser tests | 32 passed, 0 failures/skips |
| Read-only root guard tests | 13 passed, 0 failures/skips |
| Overall Stage 5B Retry | **FAILED** |

`scripts/test_runner_root.py` checks unsafe path classes without creating tasks or
deployment files. These passing regressions do not override either failed gate.
Reparse rejection is implemented; an adversarial reparse fixture was not exercised.

`scripts/export-stage-5b-retry-evidence.py` asserts the recorded failed-attempt
boundaries, task-count/diff, zero requests, original weekly invariants and test
results before exporting sanitized evidence. No raw task XML, config, receipt,
log, SID, real user path or database is committed.

Branch: `implement/stage-5b-retry`. Commit/push only; no main merge. Stop here for
Manager Review. Stage 5B formal integration remains incomplete.
