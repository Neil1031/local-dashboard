# Stage 5B-R — Windows Task Scheduler → Runner launch diagnostics

**Research Gate PASSED. The failure is explained and a candidate deployment was
verified only on the dedicated diagnostic task. Stage 5B production integration
remains incomplete; the formal weekly task still uses its original Action.**

Baseline `main`: `8e3e7462e49037cfdb4dd13d4e8bd588c1333f35`.
Branch: `research/stage-5b-runner-launch`. Date: September 22, 2026, Asia/Taipei.
Fetch, main fast-forward, exact baseline and clean tree were checked before branch
creation. Repository and private original artifacts were inspected afresh.
No production Runner, Launcher, Stop, UI, stock source or policy was changed.

## Plan / Stage / Gate / Self-QA

| Stage | Goal and scope | Gate / done when | Self-QA |
| --- | --- | --- | --- |
| Baseline | Read-only inventory, original weekly state, runtime identity | Restore-independent evidence before diagnostic registration | 234 task XML hashes; weekly ACL/run metadata; port/log state |
| Matrix | One triggerless InteractiveToken/LeastPrivilege task; harmless fixtures | A before B–F; G only if direct Java fails; one request per named case | Action readback, result, marker/receipt, other-task comparison each case |
| Cause and candidate | Same-binary visibility and physical/shared-path controls | Reproduce failure, establish cause and successful direct Runner chain | A2/B2/D2/D3; no production retry |
| Cleanup and delivery | Delete temporary task/config/markers/releases; publish evidence | Existing task definitions and environment unchanged; regressions pass | Explicit cleanup targets, sanitized source evidence, clean pushed branch |

## Root cause

**The creating process saw a redirected AppData filesystem view. Task Scheduler
could not find Java at the ordinary AppData path stored in the Action.**

The old private Action used an already-expanded absolute path. It did **not**
contain `%LOCALAPPDATA%`; that text in the prior Git evidence was a redaction
substitution. This research uses `[LOCALAPPDATA]` for redacted absolute paths and
retains `%LOCALAPPDATA%` only when the Action really contains that literal token.

Observed on this host:

```text
Creating process's apparent absolute path:
  [LOCALAPPDATA]\LocalDashboard\runner\releases\...\runtime\bin\java.exe
Physical file returned by Path.resolve(strict=True):
  [LOCALAPPDATA]\Packages\OpenAI.Codex_...\LocalCache\Local\LocalDashboard\runner\releases\...\runtime\bin\java.exe

Scheduler → ordinary AppData path → executable missing → 0x80070002
Scheduler → resolved physical path → Java → Runner → marker + terminal receipt
```

Direct evidence, not just a documentation inference:

1. The creating process can read both path forms with identical hashes.
2. The diagnostic task runs as the same SID (hash/equality captured), in System32,
   with the same LOCALAPPDATA value and 64-bit architecture. From that context,
   ordinary Java/JAR paths do not exist; the resolved physical files do exist.
3. Scheduler `java -version` fails at the ordinary absolute path (B) and succeeds
   at the resolved physical path of the same binary (B2).
4. The full Runner chain fails at the ordinary path (D), succeeds with the original
   files' resolved paths (D2), and succeeds from a temporary shared location outside
   the package cache (D3). Java/JAR hashes are identical across these controls.

Java SHA-256: `63267782812F84001922687FEEAA93C3218C7A1F03409F0650DCDBEF2E7BC8CB`.
Runner JAR SHA-256: `6582B291D95B1D4FE070169D35E1622940703BB8CC0FED6E5CC24C694462F5AF`.
All 218 files of the prior release were verified before reuse. No rebuild was
substituted in the same-binary controls.

This observed redirection matches Microsoft's documented per-package AppData
behavior for virtualized packaged desktop applications. The scope of the finding
is this host and creation/launch context; it is not a claim that every absolute
AppData path or every packaged process is inaccessible.
[Microsoft: packaged desktop filesystem behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).

The visibility mismatch and physical LocalCache placement are directly verified;
the precise mechanism inherited by the creating tool's child process was not
instrumented. A later read-only `GetCurrentPackageFullName` probe on the inspecting
Python process returned `APPMODEL_ERROR_NO_PACKAGE` (15700), and the logical parent
directory was not a reparse point. Thus this report does not claim that Python
itself has package identity or that a directory junction explains the behavior.
That bounded uncertainty does not change the missing-file/same-file-launch controls.
See [context probe](evidence/stage-5br/creation-context.json) and
[Microsoft API return contract](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getcurrentpackagefullname).

Evidence: [prior candidate](evidence/stage-5br/prior-candidate.json),
[creating-process resolution](evidence/stage-5br/path-resolution.json),
[scheduler visibility](evidence/stage-5br/marker-A2.json),
[derived assertions](evidence/stage-5br/analysis.json).

## Test matrix results

Exactly 12 manual requests, each named case requested once. Only
`\LocalDashboard-Stage5B-Diagnostic` was registered, updated, run or deleted.
It had no triggers, InteractiveToken, LeastPrivilege, no restart/repetition,
IgnoreNew and a two-minute diagnostic limit. All cases used the same COM XML
registration path and unified scheduling engine as the original pilot. The
diagnostic principal matched the invoking user, verified by fixture SID equality.

`java ordinary` means the original expanded AppData path. `java physical` means
the resolved location of the **same original file**, not a different runtime.

| Case | Action | Scheduler result | Marker / receipts | Evidence |
| --- | --- | --- | --- | --- |
| A | System PowerShell, harmless marker | 0 | marker, no Runner | [A](evidence/stage-5br/case-A.json) |
| B | java ordinary `-version` | `0x80070002` | none | [B](evidence/stage-5br/case-B.json) |
| C | literal `%LOCALAPPDATA%` Java `-version` | `0x80070002` | none | [C](evidence/stage-5br/case-C.json) |
| D | java ordinary + absolute original JAR + test config | `0x80070002` | none | [D](evidence/stage-5br/case-D.json) |
| E | copied same release, config and fixture in physical paths with Chinese/spaces | 0 | marker + 3 phases | [E](evidence/stage-5br/case-E.json) |
| F1 | ordinary Runner paths, absent WorkingDirectory | `0x80070002` | none | [F1](evidence/stage-5br/case-F1.json) |
| F2 | same action/config, explicit System32 WorkingDirectory | `0x80070002` | none | [F2](evidence/stage-5br/case-F2.json) |
| A2 | PowerShell reads visibility/hashes for ordinary and physical files | 0 | visibility marker | [A2](evidence/stage-5br/case-A2.json) |
| B2 | java physical `-version` | 0 | no fixture required | [B2](evidence/stage-5br/case-B2.json) |
| D2 | original physical Java/JAR + same harmless D config | 0 | marker + 3 phases | [D2](evidence/stage-5br/case-D2.json) |
| G | test-only PowerShell trampoline using ordinary Java path | 1 | wrapper entered; Java invisible; no Runner receipt | [G](evidence/stage-5br/case-G.json) |
| D3 | same release + config + fixture under unredirected repository `.tools` test directory | 0 | marker + 3 phases | [D3](evidence/stage-5br/case-D3.json) |

A2/B2/D2/D3 are bounded follow-up controls for the reproduced B/D failure. Each
case records complete sanitized Action/readback, LastRunTime/LastTaskResult,
polling observations where available and before/after inventories. No case calls
the formal child, sends notifications, accesses a formal DB or initiates network I/O.

Two harness issues were corrected without repeating a case: a Windows PowerShell
5.1 JSON-array nesting issue blocked before A registration; after E completed,
the collector lacked Get-FileHash in its inherited module environment. File hashing
now uses .NET SHA-256 and E was collected read-only with `Collect`, retaining its
original single request. `collectionRecovered=true` and null poll duration expose
that recovery; receipt timestamps/duration were preserved.

## Environment-variable and WorkingDirectory conclusions

B and C both failed, so the stipulated B-success/C-failure condition did not occur.
`%LOCALAPPDATA%` expansion is **not established as the cause**, and cannot explain
the old Action because it already contained an expanded path. Scheduler and creator
have the same LOCALAPPDATA text but different file visibility at the ordinary path.
We did not change environment variables or the task engine's cached environment.
See [Microsoft ExecAction](https://learn.microsoft.com/en-us/windows/win32/taskschd/execaction)
for its environment caching contract; the conclusion here comes from the controls.

F1/F2 had identical executable/arguments/config and differed only in Action cwd.
Both failed; explicitly setting System32 did not fix this missing-file failure.
Successful A/A2 and Runner fixtures also recorded System32 as the effective cwd.
This does not assert cwd is irrelevant to all possible child programs.

## Direct Java, Runner and trampoline conclusions

Direct Java is supported here when the configured executable is visible to the
scheduler context. Direct Runner E/D2/D3 all generated STARTED, PROCESS_STARTED
and TERMINAL for one executionId each, with exitCode=runnerExitCode=0.
That means **child process returned 0**, not stock/business success.

D3's executionId is
`stage5br-test-only_1790011642959_a0cf5975-ca2e-4d24-908d-6a82c783c7bc`,
duration 1333 ms; receipt times are UTC while scheduler dates include Taipei offset.
SID equality was true; all captured fixture processes were 64-bit. Bundled Java was
not on PATH, which was recorded as a boolean without exposing the full PATH.

G was run only after B failed. Its wrapper started but could not see ordinary Java;
exit 1 is a wrapper launch error, **not a Runner child exit code**. It did not make
missing files visible. No production wrapper is needed or proposed.

## Proposed Stage 5B retry action — description only

In a new approved implementation scope, deploy a versioned runtime/JAR and trusted
config into an operator-selected durable location that is demonstrably visible
outside the creating application's virtualized AppData view. Use explicit absolute
Java, JAR and config paths, with the same original child profile contract. Verify
file visibility and binary hashes from the same scheduler principal before the
one approved formal pilot execution.

D3 proves this direct-launch design in an unredirected test location with spaces
in its path. That directory was removed; it is not a production destination.
D2 proves that resolved physical paths also launch, but a package-private cache
should not be promoted into a production installation merely because it passed:
its lifecycle is tied to the creating package. No destination or official task
change was applied here. Runner production code has no demonstrated bug in this
failure, so no production code fix was made.

## Cleanup and Scheduled Task integrity

The diagnostic task was deleted. Both copied releases, test configs/scripts and
working markers were removed: 467 files across the two verified test-only roots,
plus six original marker snapshots after capturing observations and hashes.
Sanitized evidence retains observations, not live marker/config files.
The pre-existing Stage 5B release remains untouched and unreferenced by scheduled
tasks, as it was before this research.

All 234 pre-existing task XML hashes matched before/after each case and after
cleanup. There was **no external drift in this research window**. Weekly Action,
ACL and LastRunTime/LastTaskResult were unchanged: the old `00:11:50`, `0x80070002`
history entry is the prior experiment, not a new weekly run. No Daily,
InsiderTracker, dated accumulation or other existing task was modified or invoked.

Port 8080 had no listener before or after; the research did not start/stop the
Dashboard. TaskScheduler Operational logging was disabled before/after and never
enabled. Existing Application-log query found no related event. No policy change.

Evidence: [cleanup](evidence/stage-5br/file-cleanup.json),
[task cleanup](evidence/stage-5br/task-cleanup.json),
[before](evidence/stage-5br/tasks-before.json),
[after](evidence/stage-5br/tasks-after-cleanup.json),
[environment before](evidence/stage-5br/environment-before.json),
[environment after](evidence/stage-5br/environment-after.json).
The [final read-only audit](evidence/stage-5br/final-audit.json) reconfirmed these
invariants after file cleanup and evidence preparation.

## Validation, evidence and delivery

Maven `verify`: 133 tests, zero failure/error/skip; frontend/browser: 32 passed,
zero failures/skips. No application-code change requiring another package build.
Evidence exporter asserts all 12 outcomes, receipt lifecycles, file-hash controls,
F1/F2 equivalence except cwd, 234 task hashes, user equality and cleanup invariants.
Python AST / PowerShell parser, redaction checks and Git diff checks also pass.
See [regressions](evidence/stage-5br/regressions.json) and the
[evidence index](evidence/stage-5br/README.md).

Helpers: `stage-5br-diagnostics.py` prepares fixed cases using standard-library
Windows argv quoting; `stage-5br-task.ps1` restricts all scheduler mutations to the
one diagnostic name and guards against repeat requests; `export-stage-5br-evidence.py`
derives/asserts sanitized evidence. `Collect` recovers evidence without rerunning;
`CleanupFiles` validates absolute owned targets and refuses reparse points before
recursive deletion. Raw configs, full paths, SIDs, DBs and logs are not committed.

**All 15 requested research gates passed.** This establishes the launch cause and
test-only candidate, not a completed Stage 5B migration, a formal weekly receipt,
a natural Friday execution, or Stage 5C. Commit/push this research branch only;
stop for Manager Review. No merge or production retry in this scope.
