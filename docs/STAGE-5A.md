# Stage 5A — Runner Core

Date: 2026-09-21 (Asia/Taipei). Manager baseline: `66484bb7f80545e84589cf5b336763363b8ade80`.
Branch: `implement/stage-5a-runner-core`, created from clean main after fetch, fast-forward pull and ancestry verification.
Repository files are the source of truth. Workspace AGENTS.md applies; no closer file exists.
Read PLAN/README, Stage 3A/3B, both Stage 4 research reports, collector/normalization, SQLite history and existing tests.
PLAN.md remains Manager-owned and unchanged. Stage 4 MISSED remains deferred.

## Plan / stages / gates

The `/plan` was presented before implementation, with no approval pause.

| Stage | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| Contract | Independent process, trusted profiles, versioned receipt identity, file-vs-DB decision | Existing Java 21 target, Jackson, Maven packaging | No service needed; clear failure/exit/privacy/crash contract | Preserve existing observation semantics; no browser execution path |
| Storage | Atomic immutable snapshots, primary/fallback, bounded internal reader | Local filesystem with atomic rename | Restart persistence, concurrent claims, no overwrite, explicit incomplete/unknown | Collision, partial temp, corrupt/future version, fallback coalescing |
| Process | Direct child start/wait/exit, bounded concurrent stream drain | ProcessBuilder, dedicated CLI JVM | Actual success/nonzero/start-failure/output/persistence tests | Windows quote encoding, noninteractive stdin, no implicit timeout/tree kill |
| Acceptance | Packaged runner offline + existing backend/Node/browser regressions | JDK, Windows, fixture classes, Edge/Playwright; isolated acceptance DB | All 15 requested Stage 5A gates supported by evidence | Crash while child lives; late persistence failure; descendants holding pipes |
| Delivery | README, acceptance, commit and push specified branch | Passed tests and reviewed scope | Clean pushed branch; stop for Manager Review | No runtime data/secret commit, main merge, task mutation or Stage 5B |

Expected changes were runner package, config example, Maven entry point, fixtures/tests, verification helper and docs.
No external runtime dependency was introduced.

## Existing architecture and runner process model

Dashboard remains `GET /api/jobs -> PowerShell collector -> normalization -> HistoryObserver -> SQLite v1`.
History GET is still a pure bounded read. Those rows are **scheduler observations**, not runner receipts.
Runner does not annotate, replace, infer or merge those observations.

```text
trusted local CLI invocation
  -> size/type/version checked local JSON + exact profile lookup
  -> STARTED receipt (UNKNOWN)
  -> ProcessBuilder(executable, explicit args), cwd from profile
  -> concurrent stdout/stderr drain; child stdin closed
  -> PROCESS_STARTED receipt (UNKNOWN)
  -> wait for direct child, with no execution timeout
  -> observe exit + finishedAt + monotonic duration
  -> bounded output finalization
  -> TERMINAL receipt
  -> System.exit(actual child code)
```

The runner classifier JAR uses the existing Spring Boot **packager/launcher**, but its main is `RunnerMain`.
It starts no Spring context, listener, HTTP client, scheduler collector or database connection.
It shares the bundled dependencies/build with the dashboard to avoid a second dependency stack.
Test fixtures are excluded from both packaged artifacts.

Windows profiles select absolute `.exe` paths and absolute working directories; args are a string array.
No PATH-based executable search, CLI-appended arguments or shell concatenation from profile IDs.
Scripts use an explicit interpreter; trusted `cmd.exe /c` or PowerShell script profiles remain operator code,
not a sandbox. Browser users cannot select a profile: there is no runner HTTP route or Spring component.

The config is strict UTF-8 JSON, max 1 MiB, max 256 profiles/args, max 32768 characters per argument.
Unknown fields, duplicate keys, trailing JSON, unknown versions, non-string arguments and invalid IDs fail before launch.
Safe IDs are `[a-z][a-z0-9-]{0,63}`; they identify logical jobs/profiles, not scheduler task paths.
Executable/cwd existence is intentionally checked by the actual start operation so missing paths produce START_FAILED evidence.

JDK Windows legacy quoting lost embedded quotes in the real Unicode argv test. The dedicated runner enables
`jdk.lang.Process.allowAmbiguousCommands=false`; no hand-built shell command line is used.
Do not surround a whole argument with extra double quotes: the JDK treats these as quoting syntax. v1 rejects that shape
instead of silently changing its literal value. Embedded quotes in otherwise unquoted strings are verified.
Nonstandard executable argument parsers and new interpreter profiles require their own pilot acceptance.

## Storage decision: SQLite vs files

| Option | Benefit | Cost / risk | Stage 5A decision |
| --- | --- | --- | --- |
| A: each runner writes existing SQLite | Immediate queryable data, one schema | Multiple JVM writers serialize; lock wait/failure and schema coupling; v1 only accepts observed SUCCESS/FAILED | Not selected |
| B: atomic local receipt files | No service or DB prerequisite, each invocation has independent files, preserves crash evidence | File reader/dedup, future ingestion and cleanup policy required | **Selected as authoritative runner receipt store** |

Existing SQLite uses short BEGIN IMMEDIATE transactions with bounded busy timeouts. WAL can improve reader/writer concurrency,
but would not remove single-writer coordination or migration coupling. Merely increasing lock waits would delay work startup.
Stage 5A therefore does not add runner writes to SQLite. **No DB migration is necessary because the DB schema is unchanged.**

File format migration boundary: every snapshot carries `schemaVersion=1`; there was no previous receipt format to migrate.
The reader accepts v1 only, rejects unversioned/future/corrupt data, and never rewrites original evidence on read.
A future incompatible version must add an explicit version-specific decoder/conversion and tests while retaining v1 readability;
do not relabel old files. If ingestion is approved later, append a separate SQL migration/table keyed by `executionId`,
transactionally coalesce phases/copies, and preserve scheduler history independently. Ingestion is not implemented here.

Each execution atomically claims its own directory; claiming an existing ID is rejected, never adopted.
Same-owner phase publication is synchronized, immutable, and refuses existing destinations. Each phase is max 16 KiB:
write same-directory temporary file -> `FileChannel.force(true)` -> `ATOMIC_MOVE`, without a non-atomic fallback.
The reader only accepts the three defined filenames; pending temp files are not receipts.
This is verified for process crashes on the local Windows filesystem, not a universal power-loss durability guarantee.
Java does not provide a portable Windows directory-fsync guarantee; storage/controller power failure remains a limitation.

The configured primary path is resolved against the config parent; optional fallback uses the same rule.
Default fallback is `<user.home>/.local-dashboard/runner-fallback`. It is persistent, not automatically removed by temp cleanup.
Primary failure switches to fallback for the rest of the invocation. Every fallback snapshot contains its own identity/times,
so terminal evidence remains usable even if no earlier snapshot survived in that spool.
An identity collision disables new persistence for that invocation rather than reuse the ID in another spool; child execution
still proceeds with a safe diagnostic. UUIDs make accidental collisions extremely unlikely; filesystem exclusion protects existing evidence.

## Receipt format and identity

| Field | v1 contract |
| --- | --- |
| schemaVersion | 1, independent of SQLite's schema version |
| executionId | `jobId_epochMilliseconds_UUID`; globally unique invocation key; directory name |
| jobId / commandProfileId | Safe operator-chosen logical identifiers, not secret arguments or executable paths |
| phase | STARTED, PROCESS_STARTED, TERMINAL |
| outcome | SUCCESS, FAILED, START_FAILED, UNKNOWN; TIMEOUT reserved but never emitted by v1 |
| startedAt | UTC after configuration validation, before initial persistence and launch attempt |
| processStartedAt | UTC observed immediately after ProcessBuilder.start returns; null if start not confirmed |
| finishedAt | UTC observed after waitFor, or after start failure; null for incomplete |
| durationMs | Nonnegative monotonic elapsed from startedAt's measurement point through observed completion; includes launch/initial persistence, excludes output finalization |
| exitCode | Actual direct child's Java int exit value; null if not observed |
| runnerExitCode | Same child code, or 127 for start failure; null in incomplete phases |
| processStartFailure | Safe PROCESS_START_FAILED or START_PERMISSION_DENIED code, not raw exception text |
| terminationReason | null in v1; no termination policy is implemented |
| stdout / stderr | observedBytes, sampleLimitBytes, sampledBytes, truncated, complete, readFailed, contentStored=false; null before terminal or if no child started |
| createdAt | UTC when this specific immutable snapshot was created |

Receipt ID uniquely identifies one runner invocation; job/profile names and timestamp make it traceable.
Three lifecycle files are **one logical receipt**, not three executions. `ReceiptFiles.read(root, id)` returns its latest valid phase;
the multi-root overload coalesces primary/fallback by ID and rejects identity conflicts or disagreeing same-phase copies.
It does not enumerate an unlimited history or expose anything publicly.

Repeated profile invocation, scheduler retry or a manual restart each creates a **new execution ID**.
One invocation starts at most one direct child. There is no automatic retry, no caller-supplied execution ID, and no exactly-once
guarantee across separately launched runner processes. Scheduler invocation/occurrence linkage is unknown in Stage 5A;
the runner does not assume that two nearby executions are the same scheduled occurrence.

## Failure policy and exit codes

| Evidence | Runner OS exit | Receipt / diagnostic |
| --- | --- | --- |
| Child returned 0 | 0 | SUCCESS, only process-level success |
| Child returned nonzero | Same integer/Windows bits | FAILED, preserves child exit including 7, 3010 and signed -1 |
| OS cannot start child | 127 | START_FAILED, null processStartedAt and child exitCode, safe failure code |
| Invalid config/profile/CLI | 64 | Fixed RUNNER_CONFIG_INVALID, no child/no execution receipt because command identity was not established |
| Primary storage failed | Child exit unchanged | Safe diagnostic + fallback snapshots |
| Both stores failed | Child exit unchanged | RUNNER_RECEIPT_UNAVAILABLE on local stderr, no guaranteed durable receipt |
| Existing execution identity collision | Child exit unchanged | RUNNER_IDENTITY_COLLISION, no overwrite/adoption |
| Runner externally killed/crashes | OS-dependent, not a fabricated child code | Last durable nonterminal snapshot stays UNKNOWN; child may still run |

Observability failure never turns failed work into exit 0 or suppresses an established command.
The OS exit alone cannot distinguish a child returning 127/64 from runner errors; use the receipt/diagnostic.
On Windows, Java represents high-bit exit values as signed int; the Windows exit bit pattern is preserved by System.exit.
Profiles inherit the caller environment and identity, but are noninteractive (stdin EOF).

No arbitrary five-minute execution timeout. Thread interruption of the wait does not imply authorization to terminate work:
runner continues waiting, preserves the actual exit, then restores interrupt status. There is no shutdown hook that invents a
terminal outcome or kills child/descendants. External OS termination cannot guarantee a terminal receipt.

## stdout / stderr and process tree

Two daemon platform threads drain streams concurrently using an 8 KiB buffer and at most 64 KiB transient sample per stream.
Beyond the sample cap, the runner keeps reading/discarding to avoid blocking the child. Counts saturate at Long.MAX_VALUE.
Snapshots store only sizes/flags; samples are never decoded, logged, hashed, served or saved, and are cleared after draining.
Thus a multi-gigabyte output cannot create a multi-gigabyte receipt or memory buffer.

`truncated=true` means the 64 KiB sample budget was exceeded. `contentStored=false` applies even below the limit.
`observedBytes` is bytes actually read, not a promise about all output ever emitted. `complete=true` means EOF observed;
read failure sets readFailed; inherited open pipes may leave complete=false.

Direct-child exit is authoritative for v1. Descendants are not enumerated or killed. After direct child exit, reader completion
has a **shared five-second drain budget**, after which terminal metadata is a snapshot and the CLI returns the child code.
This is an output-finalization budget, not a process timeout. Detached descendants may continue; output they emit after runner
exit is not captured and their inherited pipes may close. Foreground commands that wait for their real work are required for a
meaningful receipt. This is why scheduler pilot migration needs behavioral comparison in Stage 5B.

## Crash / restart / recovery and cleanup

`STARTED` proves a validated invocation was requested, not that a child ran. `PROCESS_STARTED` confirms launch was observed.
Only `TERMINAL` records an observed finish/start failure. Both earlier phases always carry UNKNOWN with null exit/end/duration.
Internal readers report their `completionState()` as INCOMPLETE, including while a process could still be running.
They never assert RUNNING forever or infer SUCCESS from elapsed time.

If runner dies between child launch and PROCESS_STARTED publication, only STARTED may survive even though child ran.
If it dies after the child finishes but before terminal publication, completion remains UNKNOWN.
If it dies before the first durable snapshot or both stores are unavailable, there may be no receipt.
No receipt is not proof of no execution or MISSED.

On restart, read both configured spools, coalesce by execution ID, preserve originals and classify published nonterminal evidence without a terminal as INCOMPLETE.
An execution directory without any of the three published phase files is **no published receipt evidence**:
single-root read returns Optional.empty(), whether the directory is empty or contains only pending temp files.
It does not become an INCOMPLETE execution receipt and does not block a valid receipt in another root.
Every published phase is still parsed and validated; corrupt JSON, unsupported schema, identity conflicts or invalid lifecycle
fail closed even when another root has valid evidence. Empty-claim handling does not catch or suppress those errors.
Do not use a stale-age threshold alone to declare a dead process or rerun work. Inspect application-specific output/state first;
runner crash does not prove its child was stopped. A manual retry gets a new ID and must account for business idempotency.
Corrupt/unsupported/conflicting evidence is an explicit read error, not silently replaced by success.

No automatic retention/deletion/ingestion is added. Archive complete execution directories only after preserving the evidence
you need; keep incomplete records for investigation. For pending files/empty claimed directories, first establish their owner is
no longer writing. Do not clean up by age alone. Atomic files give bounded per-execution size, not bounded total history size.

## Privacy

Config is trusted local code and may contain sensitive arguments; restrict its filesystem access and keep it out of Git.
Use innocuous profile/job names. Receipts contain neither executable/cwd paths, full command lines, environment variables,
raw exception messages, account identities nor stdout/stderr contents/hashes. Profile/config toString is redacted.
CLI diagnostics use fixed codes plus safe execution ID; malformed config/IDs are never echoed.
This does not hide child command lines from local OS process inspection or protect against a malicious local administrator.
No remote shell, browser execution capability, API route, log UI or external telemetry was added.

## Files changed

- `.gitignore`: ignore secret local `config/runner.json`.
- `pom.xml`: explicit dashboard main and separate runner classifier using existing packager/dependencies.
- `config/runner.example.json`: safe test-only Java-version profile template.
- `src/main/java/io/github/neil1031/dashboard/runner/`: RunnerConfig, RunnerMain, ExecutionReceipt, OutputDrain, ReceiptFiles.
- `src/test/java/io/github/neil1031/dashboard/runner/`: RunnerFixture, RunnerTest, ReceiptFilesTest.
- `src/test/java/io/github/neil1031/dashboard/JobsApiTest.java`: assert command endpoints do not exist.
- `scripts/verify-runner.py`: packaged Windows offline/fault/concurrency/crash/tree acceptance.
- `README.md`, this document: configuration, contract, evidence and limitations.

Unchanged: PLAN.md, UI, collector, normalization, current/history endpoints, SQLite schema/storage, scheduler config and old acceptance docs.

## Commands / tests and real-machine evidence

Generated configs/receipts, DB copies, logs and screenshots remain ignored.

```powershell
$env:JAVA_HOME = 'C:/Users/qwe74/.jdks/openjdk-25.0.2'
& ./mvnw.cmd -B clean verify
# After final reader/collision tests were added:
& ./mvnw.cmd -B verify

$stage5Node = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$env:NODE_PATH = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
& $stage5Node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
python scripts/verify-runner.py --java "$env:JAVA_HOME/bin/java.exe"
python scripts/verify-history-ui-live.py --source-db .tools/stage-3b-source/observed.db --java "$env:JAVA_HOME/bin/java.exe" --node $stage5Node
git diff --check
```

Verified environment: Windows, OpenJDK 25.0.2 (Java 21 compilation target), Maven Wrapper 3.9.11,
Node 24.19.0, Playwright 1.62.1, installed Edge and Python 3.11.

| Verification | Initial implementation result (before Manager fallback fix) |
| --- | --- |
| Maven verify | **98 passed**, 0 failures/errors/skips; 60 existing cases + 38 runner cases; BUILD SUCCESS in 19.135 s |
| Node mapping / Edge fixture regression | **30 passed**, 0 failures/skips |
| Packaged runner Windows acceptance | **14 scenarios passed**, 2026-09-21 14:51:01 +08:00 |
| Actual packaged Today / History browser acceptance | **2 passed**, 0 failures/skips, completed 14:54:46 +08:00 |
| Scope / artifacts | UI, scheduler collector, normalization, SQLite schema/repository and PLAN identical to baseline; runtime artifacts ignored |

Evidence beyond test counts:

- Packaged CLI OS exits 0/1/7/3010 match both the direct fixture and persisted terminal result. Unit integration additionally
  checks 127/255/signed -1. Missing executable/cwd and invalid executable produce START_FAILED, not fake child completion.
- Unicode cwd, literal shell metacharacters and embedded quotes reach the Java fixture correctly. Unicode output byte counts match
  independently calculated UTF-8 sizes and the child-created Unicode filename/content is checked.
- Each stream produces **16,777,216 bytes simultaneously** through the packaged runner. Both counts match; sampledBytes=65536,
  truncated=true, complete=true, no contents persisted. Tests also check exact 65536/65537 cap boundary.
- A real file blocking the receipt directory forces fallback. A second blocked fallback still leaves the child-created marker,
  returns child exit 0 and prints the safe diagnostic. Unit integration also preserves child exit 7 under primary failure.
- After PROCESS_STARTED is durable, moving only the test-owned primary directory and blocking its original path forces **terminal-only
  fallback with the same execution ID**, while child work completes. Internal-reader tests coalesce primary/fallback in either order.
- Four concurrent packaged runners plus a later invocation create **five distinct IDs**; all earlier snapshot bytes remain unchanged.
  Competing exclusive claims permit only one owner, and duplicate phase writes are rejected.
- Killing only the test runner after launch leaves PROCESS_STARTED/UNKNOWN with no terminal. Its finite child still creates its completion
  marker. A later invocation creates a distinct terminal execution and leaves the old incomplete bytes intact.
- A direct child exits 7 while its descendant retains stdout/stderr pipes for nine seconds. Runner returns in **5.875 seconds**,
  persists exit 7 with complete=false, and the descendant later finishes normally. No runner tree termination occurred.
- Unknown/injection-looking selectors cannot execute the configured marker child. Malformed config/unknown fields/duplicate keys/
  scalar coercion/size violations are rejected without disclosing source text. Receipt/config toString privacy and content exclusion are tested.
- Before standalone acceptance, a local process preflight found **0 matching dashboard Java service processes**. The verifier launches
  only the independent runner and finite fixtures; receipt persistence does not involve a Spring context, HTTP call or SQLite.
- The separate dashboard regression starts its own packaged service and isolated backup of the existing Stage 3A evidence DB.
  Browser/API/independent SQLite agree on four in-range executions (2 SUCCESS, 2 FAILED); original IDs 1/3/4 are still displayed.
  Ten repeated history reads leave full DB bytes unchanged. Original source hash remains
  `eb7c3cb189251dee2312a3d1dbf31306ac84947d66d8e6ff69db9d8b66eb8440`.
  All five monitored task definition hashes match before/after; helpers contain only scheduler reads, never task execution/mutation.
  Desktop Today and 320px History screenshots were opened and visually inspected; layout/status presentation remains intact.

The first focused test run exposed Windows legacy quote loss and numeric-to-string JSON coercion; both were reproduced and fixed.
Final tests use the corrected production paths. No runtime code changed after the final Maven build and packaged verification.

Local evidence (not committed):

- `.tools/stage-5a-build.log`, `.tools/stage-5a-browser.log`, `.tools/stage-5a-runner-live.log`, `.tools/stage-5a-dashboard-live.log`.
- `target/stage-5a/runner-5tj65213/verification.json` and test-only lifecycle snapshots/markers.
- `target/stage-3b/live-te8u_jzl/receipt.json`, isolated DB, application/browser logs.
- `target/stage-2/live-desktop.png`, `target/stage-3b/live-history-320.png` and the existing browser suite's other screenshots.

## Manager Review follow-up: empty primary claim recovery

Baseline: `2db9bd34c7b4998b9b58df53f8f2deca0b1fb108`. This revision only fixes receipt recovery; merge approval is still pending.

An execution directory with no published phase files, including one containing only `.pending-*`, now returns `Optional.empty()`.
This lets the multi-root reader recover a valid fallback receipt after the primary claim succeeded but its first publication failed.
Published STARTED-only evidence still returns INCOMPLETE / UNKNOWN. Published invalid JSON, unsupported schema, identity conflicts
and invalid lifecycle evidence still fail closed, even when another root contains a valid terminal receipt.

Ten additional parameterized test cases cover empty/pending-only single-root and primary/fallback reads, STARTED-only recovery,
corruption at each of the three published phase paths, and first-publication failure with child exits 0 and 7.
The publication-failure test performs a real claim, injects IOException at the first write, runs a real child, verifies its marker and
fallback terminal, then reads both roots through the real reader. This is controlled I/O fault injection, not a physical disk-failure test.
Before the fix, these tests reproduced six `Incomplete execution without readable receipt` errors; after the fix all pass.

Revalidation completed 2026-09-21, with the packaged runner report at 15:17:52 +08:00 and dashboard report at 15:18:19 +08:00:

| Verification | Follow-up result |
| --- | --- |
| Runner unit/integration tests | **48 passed**, 0 failures/errors/skips (12 ReceiptFilesTest + 36 RunnerTest) |
| Full Maven verify | **108 passed**, 0 failures/errors/skips; BUILD SUCCESS |
| Node / Edge fixture regression | **30 passed**, 0 failures/skips |
| Packaged runner acceptance | **14 scenarios passed** |
| Actual packaged Today / History browser acceptance | **2 passed**, source DB unchanged, ten reads leave DB bytes unchanged, task definitions unchanged |
| Scope / whitespace | Only reader, runner tests and documentation changed; `git diff --check` passed |

Commands used the same Java/Node environment documented above:

```powershell
& ./mvnw.cmd -B '-Dtest=ReceiptFilesTest,RunnerTest' test
& ./mvnw.cmd -B verify
& $stage5Node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
python scripts/verify-runner.py --java "$env:JAVA_HOME/bin/java.exe"
python scripts/verify-history-ui-live.py --source-db .tools/stage-3b-source/observed.db --java "$env:JAVA_HOME/bin/java.exe" --node $stage5Node
git diff --check
```

Ignored local evidence: `.tools/stage-5a-fallback-{red,runner-tests,build,browser,packaged,dashboard-live}.log`,
`target/stage-5a/runner-4zrj0bkq/verification.json`, and `target/stage-3b/live-w_j8sagm/receipt.json` plus `browser.log`.
No Windows scheduled task changes, Stage 4 behavior changes, UI changes, SQLite schema changes or Stage 5B implementation.
The **Stage 5A implementation Gate remains 15/15 PASS**; Manager Review must still approve merge.

## Gate result

**PASSED — Stage 5A implementation acceptance. Manager Review is still required for merge.**

| # | Required Gate | Evidence |
| --- | --- | --- |
| 1 | Runner independent of dashboard | Separate packaged main; offline test-only verifier; no HTTP/Spring/DB path |
| 2 | Exit propagation | Actual OS CLI 0/1/7/3010 plus direct Java high-bit tests |
| 3 | Success receipt | SUCCESS only with observed child exit 0 |
| 4 | Failed receipt | FAILED with preserved nonzero child code |
| 5 | Start failure | Missing executable/cwd and invalid executable; null child start/exit; runner 127 |
| 6 | Start/end/duration | UTC lifecycle snapshots; nonnegative monotonic duration assertions |
| 7 | Bounded stdout/stderr | Concurrent 16 MiB per stream, 64 KiB cap, 16 KiB receipt limit, incomplete-drain flags |
| 8 | Persistence failure does not block work | Primary/fallback unavailable and mid-execution fault, independently checked marker side effects |
| 9 | Concurrency cannot overwrite | Four simultaneous JVMs, exclusive claims, duplicate rejection, preserved previous bytes |
| 10 | No generic remote shell | No controller/component; POST /api/run and /run both 404; profile injection tests |
| 11 | Existing scheduled tasks unchanged | No task mutation/run command; live regression before/after definition hashes match |
| 12 | Existing dashboard regression passes | All 60 old Maven cases, 30 Node/fixture and 2 actual service browser tests pass |
| 13 | Restart/incomplete policy | Actual runner kill, child survival, unchanged UNKNOWN receipt, distinct next invocation; conservative recovery contract |
| 14 | Privacy documented | IDs only, no command/env/output/raw errors; config ignored, fixed diagnostics, leak assertions |
| 15 | Stage 5B not started | No scheduler registration, task migration, production profile or pilot work |

## Known limitations / verification boundaries

- **Verified:** this Windows host/JDK 25, direct foreground Java fixtures, atomic local publication, process-crash behavior,
  controlled path/storage failures, actual packaged CLI, prior dashboard/browser behavior and internal reader invariants.
- **Inferred:** standard filesystem semantics support the chosen publish protocol. This is not proof of uninterrupted power-loss durability.
- **Not verified:** JDK 21 runtime, fresh machine/other OS, physical power loss/full disk, Windows ACL-denial experiments,
  every interpreter's argument parsing, noninteractive Scheduled Task account/session, real job business behavior or any task migration.
- No execution timeout/termination/retry/automatic cleanup, scheduler-occurrence association, business-success contract, SQLite ingestion,
  public receipt API or receipt/log UI. These omissions are explicit Stage 5A boundaries.
- Receipts can be lost if both stores fail; stderr is best-effort. Local filesystem I/O itself has no portable deadline, so a hung disk/share
  can delay the invocation. Use reliable local paths, not network shares. Only returned storage failures are covered by the fallback contract.
- The runner only waits for its direct child. Detached descendants are not covered by its success/duration and may lose their output pipe
  when the runner exits. Incomplete evidence cannot determine whether application side effects occurred, so blind rerun is unsafe.
- Total storage grows with execution count. A later reviewed retention policy must preserve incomplete/conflicting evidence and coordinate
  with ingestion before deleting anything. No tamper-proof audit or admin-resistant file protection is claimed.

## Follow-up recommendations

Manager should review the file contract, process-level success wording, noninteractive stdin, interpreter argv behavior and fallback
location/account permissions before selecting a pilot. Preserve profile versions as new safe profile IDs when commands change and their
exact historical configuration matters. Keep future ingestion dedup keyed by execution ID, with phase advancement and source conflicts explicit.

## Next stage

**Stage 5B only, after Manager Review and explicit approval:** migrate exactly one selected low-risk task in a new Implementation Chat,
compare original versus wrapped command side effects/exit/environment/cwd/account behavior, confirm receipts with dashboard offline,
and define rollback. Stage 5B has not begun. This branch must remain unmerged pending review.

## References researched

- [Java Process](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Process.html): finite pipe buffers, exit/wait and descendants snapshot semantics.
- [ProcessBuilder](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ProcessBuilder.html): structured commands, environment, cwd and start failures.
- [Files](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/Files.html): exclusive directory creation and ATOMIC_MOVE portability limits.
- [SQLite locking](https://www.sqlite.org/lockingv3.html): multiple processes still coordinate through database locks.
- Installed OpenJDK 25.0.2 `lib/src.zip`, Windows `java.base/java/lang/ProcessImpl.java`: strict vs legacy quote behavior,
  confirmed by the actual literal-argv test. No JDK implementation source was copied into this repository.
