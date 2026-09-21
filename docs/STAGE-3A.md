# Stage 3A — Persist Execution History Core

Date: 2026-09-21 (Asia/Taipei). Baseline: `06b7ded71c5b9677ca8a21d344f4d43911756c33`.
Branch: `implement/stage-3a`, created from clean `main` after checkout, fetch, fast-forward pull and ancestry verification.
Repository PLAN.md, README.md, both prior acceptance documents, collector/normalization, UI/API flow and existing tests were read.
Workspace AGENTS.md applies; no closer AGENTS.md exists. No prior chat was used as implementation evidence.

## Plan, scope, dependencies and acceptance

The requested `/plan` was presented before implementation and checked against the Manager's PLAN.md.

| Step | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| Storage | Local SQLite job/run records, versioned schema, stable identity | Java 21+, Xerial JDBC; existing normalized Job contract | Fresh startup creates v1; known completed runs persist; DB enforces UNIQUE | Raw evidence, nullable enabled/duration, UTC identity, existing DB preservation |
| Integration | Observe after normalization; preserve current data on failure | Existing JobService and Stage 2 PARTIAL support | Snapshot transaction succeeds or safely reports failure | Invalid collection never reaches observer; partial diagnostics retained; no DB details in browser |
| Verification | Controlled fixtures, concurrent writes, shutdown/restart and real scheduler reads | Maven, Node 22+, test-only Playwright/Edge, Python 3.11+ for independent SQLite inspection | All 13 requested Gate items have evidence | Compare actual DB rows and stable primary keys, not just test counts; verify task hashes and UI |
| Delivery | README, acceptance record, commit and push implementation branch | Passed Gate and reviewed diff | Clean branch pushed; stop for Manager Review | No runtime DB/artifacts committed; no merge or next-stage implementation |

## Architecture / persistence design

Existing flow remains `GET /api/jobs → Windows collector → normalization → current scheduler snapshot`.
JobService calls `HistoryObserver → HistoryRepository` only after the complete selected snapshot has validated.
The returned current Job objects and collection timestamp are unchanged. Partial collections may save their reliable jobs;
UNKNOWN rows can update the job inventory but never manufacture completed runs.
The existing detail endpoint also calls JobService, so its observations share the same dedup protection.
No history REST API or history UI was introduced. `recentRuns(jobId, limit)` is an internal bounded read (1–1000 rows).

SQLite JDBC 3.53.4.0 is the only new runtime dependency. It bundles the Windows native library, uses standard JDBC,
and requires no ORM, external DB server, pool, migration framework or network service.
The reviewed driver is Apache-2.0 / BSD-2-Clause; SQLite itself is public domain.
Default path: `data/local-dashboard.db`, relative to process working directory; configurable through
`dashboard.history.database-path`. Parent directories and schema are created during startup.
DB files, sidecars and local artifacts are ignored. Tests use isolated temporary databases.

Schema v1:

- `job`: Stage 1 ID primary key, task_path, task_name, nullable enabled, first_seen_at, last_seen_at.
- `job_run`: internal integer primary key, foreign-key job_id, observed_run_at, SUCCESS/FAILED-only outcome,
  scheduler_result, nullable duration_ms, message, raw_result JSON, first_observed_at, last_observed_at.
- `UNIQUE(job_id, observed_run_at)` provides database-level deduplication. Foreign keys are enabled on every connection.

Migration strategy: immutable versioned SQL resource `V1__observed_history.sql` and `PRAGMA user_version = 1`.
Schema DDL and version bump are in the same transaction. Future schema changes must append sequential migrations
before advancing the supported version. Initialization refuses newer versions, nonempty unversioned databases and
damaged required columns/UNIQUE targets. No history drop/rebuild fallback exists.
Every write rechecks the schema, allowing recovery after an operator repairs the file without restarting the dashboard.

## Run identity / dedup rule

Identity is exactly **Stage 1 job ID + normalized lastRunAt**, serialized as canonical UTC with nine fractional digits.
Task result, outcome, message, browser timezone, refresh time and random identifiers are not identity components.
Run primary keys remain unchanged on conflict, across application restart and subsequent observations.

Eligibility: `lastRunAt != null AND lastRunStatus IN (SUCCESS, FAILED)`.
Current READY/DISABLED/UNKNOWN status is not substituted for lastRunStatus. A disabled task with a reliable completed
run is eligible. RUNNING, scheduler informational codes, missing/invalid time, never-run or incomplete data remain UNKNOWN
under the unchanged Stage 1 normalization. Result 0 alone is insufficient.

Each snapshot uses one short `BEGIN IMMEDIATE` transaction with prepared UPSERT statements, synchronous FULL and the
default rollback journal. Database serialization protects independent connections/instances, not an in-memory exists check.
The default busy timeout is 2000ms per lock wait, configurable within 1–10000ms. Connections/statements close after each operation.
Any failure rolls back the entire snapshot. No partial batch is reported as saved.

Newer collectedAt can revise the same run's metadata; older delayed snapshots cannot overwrite newer metadata.
First observed uses the earliest collectedAt, last observed the latest. An UNKNOWN observation does not alter an existing
completed run. Jobs not seen in a later snapshot are retained, including history for no-longer-monitored/deleted tasks.

History failures log the server-side exception and return a fixed diagnostic to the browser:
`HISTORY_PERSISTENCE_FAILED`, with null taskPath/taskName and no SQLite/SQL/path details.
Current jobs, original diagnostics and unmatchedIncludes survive; list collectionStatus becomes PARTIAL.
Startup initialization failure is logged explicitly but leaves the scheduler service available; configured observations retry.
No monitoring configuration still returns NOT_CONFIGURED. Collector failures retain their prior 503 behavior.

## Files changed

- `.gitignore`, `pom.xml`: exclude runtime databases; pin JDBC dependency.
- `src/main/resources/application.yml`, `config/application.example.yml`: history path and bounded lock timeout.
- `src/main/java/io/github/neil1031/dashboard/DashboardApplication.java`: enable history configuration binding.
- `src/main/java/io/github/neil1031/dashboard/JobService.java`: observe the validated normalized snapshot and append failure diagnostic.
- New Java files in the same package: `HistoryProperties.java`, `HistoryRepository.java`, `HistoryObserver.java`, `HistoryPersistenceException.java`.
- `src/main/resources/db/migration/V1__observed_history.sql`: schema v1.
- `src/test/java/io/github/neil1031/dashboard/HistoryRepositoryTest.java`: real SQLite constraints, transactions, identities and failure probes.
- `src/test/java/io/github/neil1031/dashboard/HistoryApplicationRestartTest.java`: two independently started/closed Spring application contexts.
- `src/test/java/io/github/neil1031/dashboard/HistoryFailureApiTest.java`: real unavailable, locked and corrupt DB through Spring HTTP handling.
- Existing `JobServiceTest.java`, `JobsApiTest.java`: observer wiring and isolated test DB.
- `tests/browser.test.mjs`: one added history-failure diagnostic regression; prior cases retained.
- `scripts/verify-history-live.py`: repeatable packaged-service restart, independent SQLite and scheduler verification.
- `README.md`, `docs/STAGE-3A.md`: configuration, semantics, limitations and acceptance evidence.

PLAN.md, index.html, dashboard.mjs, collector, normalization and existing task configuration selectors are unchanged.

## Commands / tests run

Environment verified: Windows, OpenJDK 25.0.2 (compilation target Java 21), Maven Wrapper 3.9.11,
Windows PowerShell 5.1, Node 24.19.0, Playwright 1.62.1 / installed Edge, Python 3.11.

```powershell
git checkout main
git fetch origin
git pull --ff-only origin main
git merge-base --is-ancestor 06b7ded71c5b9677ca8a21d344f4d43911756c33 HEAD
git switch -c implement/stage-3a

$env:JAVA_HOME = 'C:/Users/qwe74/.jdks/openjdk-25.0.2'
& .\mvnw.cmd -B clean verify

$stage3Node = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$env:NODE_PATH = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
& $stage3Node --test tests/dashboard.test.mjs tests/browser.test.mjs
python scripts/verify-history-live.py --java "$env:JAVA_HOME/bin/java.exe" --node $stage3Node

git diff --check
git diff --exit-code 06b7ded -- PLAN.md index.html dashboard.mjs src/main/resources/collect-scheduler.ps1 src/main/java/io/github/neil1031/dashboard/JobNormalizer.java
git check-ignore data/local-dashboard.db data/local-dashboard.db-journal sample.sqlite sample.sqlite-wal
```

Final backend build: **BUILD SUCCESS**, 55 tests, zero failures/errors/skips (14.620 seconds).
The 31 existing tests remain; 22 repository cases, 1 full application restart case and 1 multi-phase HTTP failure case were added.
Node/Edge: **20 fixture/mapping tests passed**, zero failures/skips, plus **1 live browser test passed** inside live verification.
Runtime HTML and JS are still byte-compared by the existing HTTP tests.

Additional evidence beyond counts:

- Eight independent repository instances concurrently initialize a fresh file and write the same run; exactly one row remains.
  A raw duplicate SQL INSERT bypassing Java is rejected by UNIQUE.
- Ten observations and repository recreation preserve primary key, first observation, outcome, raw evidence and NULL duration.
  New run times and different jobs produce distinct rows. Signed Windows results preserve raw evidence and normalized unsigned value.
- Changed result/outcome/disabled state updates the same run; stale observations cannot replace newer run metadata.
- Taipei midnight, adjacent 100ns timestamp, UTC-equivalent offset and JVM default-zone change preserve the correct two identities.
- A forced mid-batch DB trigger failure rolls back the snapshot while preserving earlier history. Initial DDL/version are also rolled back
  when the surrounding transaction fails. Unsupported/unversioned/corrupt schemas are rejected without deleting records.
- HTTP test starts Spring with an unavailable DB path, then verifies recovery, real writer-lock failure, corrupt DB, retained diagnostics,
  collector 503 precedence and recovery. Returned current jobs are unchanged; DB filename, SQL internals and JDBC messages never reach response text.
- Browser regression displays HISTORY_PERSISTENCE_FAILED while retaining READY / last-run SUCCESS and unavailable-history placeholder.

An initial HTTP test failure came from re-stubbing a Mockito method that was already configured to throw; switching to doReturn fixed the
test setup. Live verifier development exposed PowerShell 5.1 JSON array wrapping and progress CLIXML on stderr; using the unwrapped array,
suppressing progress and explicitly decoding UTF-8 stdout fixed the verification helper. These did not require collector/runtime changes.
Final self-QA also replaced SQL LIKE with GLOB for the literal `sqlite_` system-name prefix: LIKE treats underscore as a wildcard.
A regression test proves an unrelated `sqlitex_evidence` table causes a nonempty unversioned DB to be rejected without adoption or data loss.
JDK 25 emits a SQLite JNI native-access warning; it does not prevent startup or persistence on this verified JDK.

## Real-machine verification

Verified **2026-09-21 11:45:27 +08:00**, using the final packaged JAR and configured existing tasks; no task was created, modified, started or stopped.
Two separate dashboard processes used the same isolated database. The helper stops only its own dashboard processes after acceptance.

| Observation | job rows | completed run rows | duplicate identities |
| --- | ---: | ---: | ---: |
| Fresh application startup, before API requests | 0 | 0 | 0 |
| First API request | 5 | 4 | 0 |
| Ten total API observations | 5 | 4 | 0 |
| New process, before first collection | 5 | 4 | 0 |
| Three more API observations | 5 | 4 | 0 |
| Real browser initial load + Refresh | 5 | 4 | 0 |

All 15 captured snapshots' eligible identities exactly matched independently queried SQLite rows; run primary keys stayed stable.
The helper also verified schema version, integrity_check, foreign_key_check, outcomes, scheduler results, NULL duration and raw task names.
All five task definitions' SHA-256 hashes were identical before/after. All five current scheduler values matched separate Windows reads.

| Task | current status | lastRunStatus | scheduler result | saved run |
| --- | --- | --- | ---: | --- |
| AIStockHunter-Accumulation-Weekly-Check | FAILED | FAILED | 1 | Yes |
| AIStockHunter-UnexplainedVolume-HealthCheck | DISABLED | SUCCESS | 0 | Yes |
| InsiderTracker-Market | READY | SUCCESS | 0 | Yes |
| InsiderTracker-SEC | READY | SUCCESS | 0 | Yes |
| InsiderTracker-SyncImport | RUNNING | UNKNOWN | 267009 | No |

The live browser test used actual HTTP responses, checked all rows/drawers and exactly two GET requests, and captured desktop/narrow screenshots.
Both live screenshots were opened and visually inspected: current layout/statuses and responsive behavior remain intact.

Ignored local evidence:

- `.tools/stage-3a-build.log`, `.tools/stage-3a-ui-tests.log`, `.tools/stage-3a-live.log`.
- `target/stage-3a/live-s86werhs/receipt.json`, `observed.db`, both application logs, `live-browser.log`.
- `target/stage-2/live-ui.json`, `live-desktop.png`, `live-mobile.png`.

## Gate result

**PASSED — Stage 3A only.**

| Required Gate | Verified evidence |
| --- | --- |
| 1. Fresh startup | Missing-file repository test + packaged process creates empty schema before API |
| 2. Version/migration strategy | Transactional v1/user_version, rollback, unknown-version and damaged-schema tests |
| 3. Completed executions persist | SUCCESS/FAILED/disabled fixture records + 4 real completed runs |
| 4. Repeat does not duplicate | Ten fixture observations + ten live observations |
| 5. DB-level UNIQUE | Concurrent connections + direct SQL duplicate rejection |
| 6. Restart dedup | Repository restart, closed/reopened Spring contexts, two packaged processes |
| 7. New execution adds row | Distinct timestamp fixtures, separate same-time jobs |
| 8. No false UNKNOWN/never-run run | Nine uncertainty scenarios + live RUNNING excluded |
| 9. Current API preserved | Existing API tests; live independent 5/5 scheduler comparison |
| 10. Safe history failure | Unavailable/lock/corruption/recovery through Spring HTTP + browser diagnostic test |
| 11. Scheduler unchanged | Read-only code paths, no mutation commands, all five definition hashes unchanged |
| 12. Stage 2 UI unchanged | Exact source diff / HTTP bytes, prior browser tests, live rendering and inspected images |
| 13. All tests pass | 55 backend + 20 frontend fixture/mapping + 1 live browser; no skips |

## Known limitations

- **Observed history is not a complete Windows execution audit stream.** The collector exposes only the last execution snapshot.
  If the dashboard is closed for three days and a task runs 20 times, only the last observable completed execution can be saved;
  the other 19 cannot be reconstructed. The same gap exists between polls, during DB failure, or if a running execution is superseded before completion is observed.
- The scheduler snapshot is not atomic. This stage relies on unchanged Stage 1 normalization and cannot eliminate task changes between Windows reads.
  `observed_run_at` is LastRunTime, not a measured completion time; duration is unknown. Scheduler success is not application-level success.
- Stage 1 ID derives from lowercased task path/name. Rename/move creates a different job identity; old history is retained without automatic linkage.
  Recreated tasks with the same path/name follow the same identity. Distinct executions indistinguishable at the source timestamp precision cannot be separated.
- Same-execution metadata uses the latest observed completed result; it is not a revision audit trail. No retention/purge or background polling was added.
- DB lock waits add bounded latency per wait to the HTTP observation. No asynchronous queue, long-term retry backlog or history backfill exists.
- **Verified:** this host, Java 25.0.2, real SQLite files/JDBC, real packaged application restart, Edge and listed fixture/error scenarios.
  **Not verified:** JDK 21 runtime, fresh Windows install, physical disk-full/power-loss fault injection, all Windows trigger types, other browsers.
  Controlled database lock, corrupt-file and unavailable-path tests do not claim physical disk-failure testing.

## Follow-up recommendations

Manager / Stage 3B should explicitly decide rename/move linkage and display semantics for multiple outcomes on the same day.
Keep current state separate from observed history and make observation gaps clear; do not interpret missing rows as MISSED.
Use the bounded internal read as a starting point, then define the actual seven-day history API in Stage 3B.

## Next stage

Stage 3B only: define bounded 7-day history API and connect the existing history view to persisted records, including empty history,
multiple executions per day, mixed outcomes and local/UTC boundaries. Stage 3B has not been started. Merge requires Manager Review.

## References

- [Xerial JDBC release](https://github.com/xerial/sqlite-jdbc/releases/tag/3.53.4.0), [license](https://github.com/xerial/sqlite-jdbc/blob/master/LICENSE).
- [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html), [transaction semantics](https://www.sqlite.org/lang_transaction.html),
  [user_version](https://www.sqlite.org/pragma.html#pragma_user_version).
