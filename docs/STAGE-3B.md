# Stage 3B — 7-Day History API and UI

Date: 2026-09-21 (Asia/Taipei). Baseline / Manager Plan: `2328b44b3b4b30c1e8273011989b572961992cdb`.
Branch: `implement/stage-3b`, created after checkout main, fetch, fast-forward pull, ancestry and clean-tree checks.
Repository files were the source of truth; no previous conversation was used. Workspace AGENTS.md applies, no closer instructions exist.
PLAN.md's Stage 3B section matches this assignment; its trailing older Stage 3A assignment is superseded by the explicit current request.
PLAN.md itself is unchanged. Implementation must remain unmerged pending Manager Review.

## Plan / scope / stages

The requested `/plan` was presented before implementation; no user approval pause was required.

| Step | Goal and scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| Backend | Bounded pure history read and public DTO | Stage 3A SQLite v1, existing JDBC | One prepared range query, safe 400/503, no collection or write | Half-open bounds, nanoseconds, all jobs/runs, missing/corrupt/locked DB, unchanged bytes |
| Frontend | Local calendar range, union, aggregation and cache | Existing Today snapshot, new history API | Seven local days; neutral empty; any failure wins; one request per range | Taipei midnight, DST, eighth day, current/history-only, invalid payload, request accounting |
| Detail / layout | Reuse pink drawer with explicit mode; all daily executions | Existing drawer and keyboard behavior | Chronological local times/results/messages; Tab/Enter/Space/Escape and focus return | Long Unicode names, literal text, null duration, 1280/820/375/320px and screenshot inspection |
| Real acceptance | Packaged JAR, actual previously persisted records | Existing Stage 3A DB, Java, Edge, Node, Python SQLite | Browser/API/independent DB match; repeated reads leave bytes unchanged | Source preserved, task hashes unchanged, no scheduled task execution or mutation |
| Delivery | README, acceptance, commit and push | All 15 Gate items verified | Clean implementation branch pushed, stop for review | No operational artifacts, schema change, next-stage work or merge |

Explicit exclusions: MISSED detection, expected windows, runner, application success contract, logs, 30-day reliability,
external integrations, scheduler changes and manual task execution. No new runtime dependencies, indexes or migrations.

## Files changed

- `.gitignore`: ignore Python import bytecode produced by the verification helper.
- `src/main/java/io/github/neil1031/dashboard/HistoryRepository.java`: separate read-only connection and joined range read.
- Same package: new `HistoryRange.java`, `HistoryResponse.java`, `HistoryController.java`.
- `dashboard.mjs`: validation, calendar boundaries, grouping, union, independent history loading/cache/error, explicit drawer modes.
- `index.html`: history table, local scroll/sticky row headings, legend, retry and history execution list; existing palette/cards retained.
- `src/test/java/io/github/neil1031/dashboard/HistoryApiTest.java`: real SQLite + HTTP range/read-only/error verification.
- `tests/history.test.mjs`, `tests/history-browser.test.mjs`: pure mapping and real Edge fixture tests.
- `tests/dashboard.test.mjs`, `tests/browser.test.mjs`: retain existing checks; replace Stage 2 unavailable-history expectations with actual read-only history behavior.
- `tests/live-history-browser.test.mjs`, `scripts/verify-history-ui-live.py`: packaged service, UI and independent SQLite acceptance.
- `README.md`, `docs/STAGE-3B.md`: current contract, use, evidence and limits.

Unchanged: PLAN.md, v1 schema, HistoryObserver, existing persistence identity/upserts, JobService, collector/normalization,
scheduler configuration, Maven dependency/build configuration and prior acceptance documents.

## History API contract

`GET /api/history?from=<UTC instant>&to=<UTC instant>` returns `Cache-Control: no-store`.

- Both inputs required: four-digit year ISO timestamp with seconds, optional 1–9 fractional digits, uppercase `T`/`Z`.
  Non-UTC offsets, invalid calendar dates, 24:00, leap seconds and arbitrary text are rejected.
- Require `from < to` and elapsed range <= 31 days. Exactly 31 days is accepted; 31 days plus one nanosecond is rejected.
- Range is **`from <= observedRunAt < to`**. API uses explicit UTC instants and never guesses browser timezone.
- 200 body: `{from, to, jobs: [{id, taskPath, taskName, enabled, runs: [{id, observedRunAt, outcome, schedulerResult, durationMs, message}]}]}`.
  Jobs include every retained identity with an in-range execution, regardless of current monitoring settings.
  Runs are chronological, tie-broken by ID. Enabled/result/duration/message preserve null. No rows means `jobs: []`.
- 400 body: `{code: "INVALID_HISTORY_RANGE", message: <fixed safe guidance>}`.
- 503 body: `{code: "HISTORY_UNAVAILABLE", message: <fixed safe guidance>}`; exception details remain server-side only.
- DTO excludes raw_result, observation metadata, DB path and SQL. No browser parameter becomes SQL source text.

The endpoint's dependency is HistoryRepository only. Its read uses a separate SQLite connection with read-only open flags
and URI `mode=ro`; it never invokes the existing write-capable connection or startup/migration routine.
It checks schema version via read-only PRAGMA, then uses one joined SELECT with two prepared parameters formatted using
the same canonical nine-fraction-digit UTC formatter as v1 storage. No per-job or per-cell queries.
The JOIN does not consult `/api/jobs`, JobService, HistoryObserver, SchedulerCollector or PowerShell.
Missing files/directories stay missing; incompatible/damaged DBs fail without auto-repair.

Reference for the open mode: [SQLite URI documentation](https://www.sqlite.org/uri.html).
Strict timestamp parsing uses [Java OffsetDateTime](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/OffsetDateTime.html).

## Local-day aggregation and UX

Browser constructs seven local-midnight Date objects using calendar components, ending at tomorrow's local midnight,
then sends the endpoints as UTC. Tests cover 167/169-hour DST windows, not just a 168-hour week.
UTC persistence identity remains unchanged; browser local date is used only for presentation.

Rows are current snapshot jobs UNION returned history jobs by exact ID. Current names/paths take precedence;
historical-only identities use saved names/paths with `History only`, never `Deleted`. Distinct rename/move IDs are not merged.
Current jobs without recent history receive seven neutral cells. History uses the most recently successful snapshot's inventory;
current collection failures still retain Stage 2's explicit error and remove Today rows/counts.

| Runs in job/local day | Presentation |
| --- | --- |
| 0 | neutral `—`, not a button |
| 1 SUCCESS | green `✓` |
| 1 FAILED | red `!` |
| multiple, all SUCCESS | green `✓ N` |
| multiple, any FAILED | red `! N`, including failure followed by later success |

Every populated cell is a native button with a job/date/run-count/failed-count accessible label.
Activation opens the shared drawer with `data-mode="history"`, a date and Observed executions subtitle, and all runs sorted
chronologically (including sub-millisecond order). Current details set `data-mode="current"` and show their separate fields.
History includes local time, visible outcome, scheduler result and optional message/duration. NULL duration is omitted.
All supplied strings use textContent. Tab is contained in the drawer, Escape/Close returns focus to the source cell.
The table scrolls inside its region on narrow screens; sticky row headings remain readable and long names wrap.

Initial history entry shows Loading history, then a table or clear empty message. Error shows History unavailable and Retry history.
History failure never changes Today snapshot/summary or collection status. Arbitrary error response text is not reflected to the UI.

Cache is per page and range. Switching views or opening details does not collect. Successful Current Refresh advances a revision:
if History is visible it reloads, otherwise next entry reloads. An old in-flight response cannot satisfy the newer revision;
after it finishes a single replacement request is made. Concurrent history activations coalesce.
Date boundaries are recomputed on History entry / Refresh; no background polling or automatic midnight timer.

## Commands / tests run

Environment: Windows; existing OpenJDK 25.0.2, Java target 21, Maven Wrapper 3.9.11;
Node 24.19.0, test-only Playwright 1.62.1 and installed Edge; Python 3.11.
The machine's older default Java/Node were overridden only in the command environment.

```powershell
git checkout main
git fetch origin
git pull --ff-only origin main
git merge-base --is-ancestor 2328b44b3b4b30c1e8273011989b572961992cdb HEAD
git switch -c implement/stage-3b

$env:JAVA_HOME = 'C:/Users/qwe74/.jdks/openjdk-25.0.2'
& ./mvnw.cmd -B verify

$stage3bNode = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$env:NODE_PATH = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
& $stage3bNode --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs

python scripts/verify-history-ui-live.py --source-db .tools/stage-3b-source/observed.db --java "$env:JAVA_HOME/bin/java.exe" --node $stage3bNode
# After refining the Retry button assertion:
& $stage3bNode --test tests/history-browser.test.mjs

git diff --check
git diff --exit-code 2328b44 -- PLAN.md src/main/resources/db/migration/V1__observed_history.sql src/main/resources/collect-scheduler.ps1 src/main/java/io/github/neil1031/dashboard/HistoryObserver.java src/main/java/io/github/neil1031/dashboard/JobNormalizer.java src/main/java/io/github/neil1031/dashboard/JobService.java
```

- **Backend: 60 passed, zero failures/errors/skips**, including all 55 previous tests. Build success, 14.503 seconds.
- **Frontend/fixture browser: 30 passed, zero failures/skips**: 20 preserved Stage 2/3A tests plus 4 history mapping and 6 history browser tests.
  Six history browser cases also passed after strengthening the Retry interaction assertion.
- **Real-service browser: 2 passed, zero failures/skips**, existing Today acceptance plus new history acceptance.
- Runtime Java/HTML/JS did not change after the successful packaged build and real-machine acceptance.

Evidence beyond counts:

- Real SQLite rows immediately before `from`, at `from`, immediately before `to`, at `to`; nanosecond-accurate exclusion/inclusion.
- Multiple jobs and all four in-range executions for one retained task; intervening failure and later success both returned.
- SQL triggers reject every INSERT/UPDATE/DELETE on job/job_run; six repeated HTTP reads still succeed with identical responses.
  Whole DB bytes stay identical, covering both record counts and first/last observation metadata. Mock collector records zero calls
  across every new HTTP case, so the only scheduler/PowerShell entry point is never reached.
- Missing file/parent, corrupt file, newer schema, reserved writer and exclusive lock: reads either work safely or give sanitized 503;
  no file creation, repair, schema write or secret path/SQL leakage. Invalid range validation occurs before DB access.
- SUCCESS/FAILED/mixed/day-order/count cases, Taipei midnight, eighth day exclusion, current-name precedence, retained identity,
  no-history row, DST spring/fall, invalid/duplicate payloads, keyboard detail, literal markup, refresh races, retry and midnight cache rollover.
- Overflow assertions at 1280/820/375/320px for table and drawer. Desktop/narrow fixture and live screenshots were opened and visually inspected.

## Real-machine verification

Receipt time: **2026-09-21 12:12:43 +08:00**.
Source is the actual Stage 3A artifact `target/stage-3a/live-s86werhs/observed.db`, copied before validation to ignored
`.tools/stage-3b-source/observed.db`. Both files' SHA-256 matched:
`eb7c3cb189251dee2312a3d1dbf31306ac84947d66d8e6ff69db9d8b66eb8440`.
The helper used SQLite backup to create a separate acceptance copy, then started the packaged JAR on a random loopback port.
No synthetic run was inserted into that DB; normal Today collection was allowed to persist newly observed completed executions.

| Evidence | Verified result |
| --- | --- |
| Original Stage 3A records | 4 total; original IDs 1, 3, 4 displayed in this seven-day window |
| Query window | `[2026-09-14T16:00:00Z, 2026-09-21T16:00:00Z)` = Taipei Sep 15–21 |
| Current rows | 5; the health-check task has no in-window run and shows seven `—` |
| In-window executions | 4: 2 SUCCESS, 2 FAILED, 4 populated daily cells |
| Newly observed completed execution | SyncImport, previously RUNNING in Stage 3A; normal Today collection now observed FAILED |
| Browser comparison | Every cell and all 4 detail executions match API IDs/times/results/messages |
| Independent Python SQLite comparison | Exact job metadata, run IDs, timestamps, outcomes, result, duration and message match |
| History request isolation | History browser load: exactly one initial `/api/jobs` and one `/api/history`; details and tab switching add none |
| Repeated pure reads | 10 identical history responses; full DB rows and bytes unchanged |
| Scheduler safety | All 5 monitored task definition hashes unchanged before/after; no task creation/modification/execution command |
| Source safety | Original source hash unchanged; only helper-owned dashboard process stopped |

There was no real multi-run day in this window. Multi-run/mixed-outcome behavior is therefore **fixture verified**, not claimed
as observed on this machine. The out-of-window health-check execution remains in SQLite; it is correctly excluded from the grid.

Ignored receipts/artifacts:

- `.tools/stage-3b-build.log`, `.tools/stage-3b-ui-tests.log`, `.tools/stage-3b-ui-final.log`, `.tools/stage-3b-live.log`.
- `target/stage-3b/live-k56rgib9/receipt.json`, `observed.db`, `application.log`, `browser.log`.
- `target/stage-3b/live-history.json`, `live-history-{1280,820,375,320}.png`, `live-detail.png`.
- `target/stage-3b/history-{1280,820,375,320}.png`, `history-detail-320.png`; prior Today receipt remains in `target/stage-2/`.

## Gate result

**PASSED — Stage 3B implementation acceptance; Manager Review still required for merge.**

| Required Gate | Evidence |
| --- | --- |
| 1. Bounded read-only API | Strict range contract, prepared SELECT, read-only SQLite connection |
| 2. No collector from history | No collector dependency; zero collector calls in every history HTTP test |
| 3. No DB writes | Mutation-rejecting triggers, byte equality, real repeated-read comparison |
| 4. Seven local days | Taipei boundary, DST 167/169 hours, browser request range and rollover |
| 5. Persisted history in UI | Stage 3A original records displayed and independently matched |
| 6. Zero/one/multiple runs | Pure mapping + Edge fixture + real current no-history row |
| 7. Any-failure precedence | SUCCESS/FAILED/SUCCESS gives red `! 3`; both two-run orders tested |
| 8. Every daily execution viewable | Sorted 3-run fixture details and every real populated cell |
| 9. Current job without history | Seven neutral cells, including live health-check task |
| 10. Historical-only jobs | Joined backend query independent of snapshot; fixture retained row/label |
| 11. History failure independent | Sanitized error, Today rows/counts intact, successful Retry |
| 12. No fake history | Empty runtime table; source assertion; no fixture fallback; real DB comparison |
| 13. Desktop/narrow usable | All four required viewport assertions and inspected screenshots |
| 14. No Stage 2/3A regression | All prior backend and frontend cases pass with obsolete placeholder expectations updated |
| 15. All tests pass | 60 backend + 30 frontend/fixture + 2 live, no skips |

## Known limitations

- Observed completed executions are not a complete Windows audit trail. Unobserved executions cannot be reconstructed;
  empty cells do not imply success, failure or MISSED. Scheduler result 0 does not prove business-level success.
- Same-run metadata can be revised by a later normal observation, as in Stage 3A. A history GET itself never revises it.
- Task rename/move may produce a new ID. Old/new identities remain separate; no guessed linkage.
- Duration is normally unknown. Browser time formatting shows seconds; persistence/API retain finer timestamp precision.
- Range is time bounded, not row-count capped/paginated. Appropriate for the current small local data set; no new index/migration.
- Cache is per page; another page's collection is seen on this page's next Current Refresh. No automatic midnight refresh while idle;
  re-entering History or Refresh recalculates its range. Network requests rely on browser completion; no added fetch timeout.
- **Verified:** this Windows host, Java 25, Edge, real SQLite/JDBC/packaged JAR, recorded fixtures and error scenarios.
  **Not verified:** JDK 21 runtime, other browsers, physical mobile device, screen-reader speech, fresh-machine installation.

## Follow-up recommendations

- Manager can define explicit rename/move linkage later if desired; do not infer or merge IDs based on similar names.
- Correct PLAN.md's trailing stale Stage 3A assignment in a Manager-owned planning update.
- Consider pagination/query performance only if actual volume warrants it; current scope needs no schema change.

## Next stage

Stage 4 — Reliable MISSED Detection: evaluate expected execution windows and grace periods for supported triggers,
with disabled/not-due/sleep/StartWhenAvailable considerations and separately authorized controlled task validation.
Stage 4 is not started. Commit/push this branch and stop; only Manager Review can authorize merge.
