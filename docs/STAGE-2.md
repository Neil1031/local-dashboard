# Stage 2 — Connect Real Data to Existing UI

Date: 2026-09-21 (Asia/Taipei). Baseline: `30411d880264444ef1e39a869ea4fc0470b2b229`.
Branch: `implement/stage-2`, created after updating `main` with `git pull --ff-only` and checking baseline ancestry.

## Plan, stages and boundaries

Scope is the existing UI's connection to the Stage 1 list API only. Read PLAN.md, README.md, docs/STAGE-0-1.md,
the complete original HTML, backend/collector implementation and existing tests before implementation.
The workspace AGENTS.md applies; there are no closer project instructions.

| Step | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| Contract | Confirm baseline and distinguish current state from last execution | Merged Stage 1 model and HTTP response | Mapping follows the actual API; no new backend endpoint | READY + SUCCESS stays Ready; no time-derived MISSED |
| UI | Replace runtime fixtures; loading, refresh, filters, drawer and collection states | Same-origin GET /api/jobs | Existing pink design renders real jobs and diagnostics | No detail calls, no fake history/logs, no HTML interpretation of task text |
| Validation | Exercise rendering and real service end to end | Node 22+, test-only Playwright, Edge, JDK and configured tasks | Automated cases and desktop/narrow visual inspection pass | Live browser receipt plus independent scheduler values; keyboard, empty/missing/long data |
| Delivery | Update instructions, acceptance record, commit and push | Completed checks | Branch pushed, clean working tree, no merge | Scope/diff inspection; runtime assets only in JAR |

Data flow: page load / Refresh → one GET /api/jobs → validate response → store its complete Job objects in memory
→ render summary and current-status rows → filter locally / open drawer from the same object.
Refresh uses both a synchronous in-flight guard and a disabled button. No polling or POST /api/refresh.
At refresh start, remove the old snapshot and counts. On error, retain an explicit error and no rows;
the prior successful Last refresh timestamp is not advanced.

The user-provided Stage 2 boundary takes precedence over the older PLAN wording:
MISSED is displayed only if the API explicitly returns it. No execution windows or missed-run inference.
No SQLite, runner, log collection, 30-day metrics, external integrations, scheduler mutations, or backend behavior changes.

## Files changed

- `index.html`: retain the original palette/card/drawer/responsive CSS; remove static scheduler rows, fake counts/dates,
  fake history and inline mock script. Add collection notices and real-data labels, status styles and responsive adjustments.
- `dashboard.mjs`: plain browser module for API loading, validation, mapping, rendering, filters, drawer and keyboard handling.
- `pom.xml`: package the module next to the existing root HTML; no application dependency changes.
- `src/test/java/io/github/neil1031/dashboard/JobsApiTest.java`: verify both static asset bytes are served without collecting.
- `tests/dashboard.test.mjs`: Node built-in tests for status/result separation, filters, dates, malformed responses and fixture removal.
- `tests/browser.test.mjs`: real Edge renderer with HTTP fixtures; interaction, request counts, errors, text safety and layout assertions.
- `tests/live-browser.test.mjs`: opt-in real packaged-service acceptance, without mocked requests.
- `README.md`: UI semantics, startup and reproducible frontend/browser test instructions.
- `docs/STAGE-2.md`: this plan and acceptance record.

PLAN.md, docs/STAGE-0-1.md, collector, backend model/service/controller and scheduler configuration are unchanged.
Fixtures live only in tests; the JAR's static resource inputs are index.html and dashboard.mjs.

## API / status mapping

| Input | UI behavior |
| --- | --- |
| READY, RUNNING, FAILED, DISABLED, UNKNOWN | Explicit current status badge; current-status filter |
| MISSED | Display/filter only when directly supplied by backend |
| Unknown or absent current enum | UNKNOWN, never success |
| lastRunStatus SUCCESS / FAILED / UNKNOWN | Separate Last run label and drawer field |
| READY + lastRunStatus SUCCESS | Current Ready, Last run Success; contributes only to Last run success summary |
| OK | Render the returned jobs; empty list is a distinct empty state |
| PARTIAL | Render available jobs, errors and unmatchedIncludes; warn that summaries cover only returned jobs |
| NOT_CONFIGURED | No jobs; point to dashboard.scheduler.include, config/application.yml and README |
| ERROR, HTTP 503, unavailable backend, invalid JSON/contract | Explicit error; no jobs, no success counts or fallback |
| Missing/null fields | `—`; null dates do not become epoch or Invalid Date |
| UTC timestamps | Browser local date and time, including the date to avoid implying today's execution |

Summary: Monitored = returned jobs; Last run success/failed = lastRunStatus counts.
Attention = current FAILED / UNKNOWN / MISSED jobs. Collection diagnostics are a separate notice, not added to job counts.
7-day history retains its tab and panel and states that data will be available after Stage 3; no day cells or history API calls.

## Commands / tests run

Environment: Windows, OpenJDK 25.0.2 (Java compilation target 21), Maven Wrapper 3.9.11,
Node 24.19.0, existing Playwright 1.62.1 and installed Microsoft Edge in headless mode.
The host default Node 8 is too old; a preinstalled bundled Node was selected for commands only.
No system PATH change, frontend framework or runtime Node dependency was introduced.

```powershell
git switch main
git pull --ff-only
git merge-base --is-ancestor 30411d880264444ef1e39a869ea4fc0470b2b229 HEAD
git switch -c implement/stage-2

$env:JAVA_HOME = 'C:/Users/qwe74/.jdks/openjdk-25.0.2'
& .\mvnw.cmd -B clean verify

# Selected existing Node / Playwright; substitute your own Node 22+ or use README installation instructions.
$stage2Node = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$env:NODE_PATH = 'C:/Users/qwe74/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'

# Foreground equivalent of the hidden Start-Process used during acceptance:
& "$env:JAVA_HOME/bin/java.exe" -jar target/local-dashboard-0.1.0.jar --server.port=18082 --spring.config.additional-location=file:config/application.example.yml

# Second shell, same Node/Playwright environment:
$env:DASHBOARD_LIVE_URL = 'http://127.0.0.1:18082'
& $stage2Node --test tests/dashboard.test.mjs tests/browser.test.mjs tests/live-browser.test.mjs
git diff --check
```

Verification results:

- Maven: **31 passed, zero failures/errors/skips**, including actual PowerShell fixture processes and exact static asset bytes.
- Node/Edge: **20 passed, zero failures/skips**: 4 mapping/source tests, 15 HTTP-fixture browser tests, 1 real-service browser test.
- Browser cases include initial loading and 15 repeated clicks while collecting; initial unavailable backend and 503;
  OK/PARTIAL/NOT_CONFIGURED empty collections; one job; 25 jobs; all requested statuses; explicit-only MISSED;
  READY + SUCCESS / UNKNOWN; long Unicode names; missing fields; null dates; injected-looking strings rendered literally;
  successful snapshot followed by network/503/ERROR/invalid response failure and successful recovery.
- Keyboard filters, tab arrow navigation, Close / Escape, modal Tab containment and focus return are exercised.
- Automated horizontal-overflow assertions at 1280/820/375/320px; drawer overflow assertion at narrow sizes.
- Captured images were actually opened and visually inspected: live desktop, live mobile, partial/error states,
  long-name 320px list and drawer. Existing palette, rounded cards, layout, tabs and status differentiation are retained.

One initial live-test failure was in the test receipt assertion (`request.url` stored as text but called as a function).
Corrected that assertion and reran it successfully. Self-QA also found omitted optional values rendered blank;
corrected the element helper and added a browser regression asserting `—` for every omitted detail field.
A test launched immediately after restarting the JAR exposed a startup race; the live test now waits up to
15 seconds for the static page before browser navigation. Readiness probes never call the collector API.

## Live evidence

The packaged JAR served both HTML and JavaScript successfully to Edge, bound only to `127.0.0.1:18082`.
Final browser receipt: **2026-09-21 11:15:49 +08:00**. Summary at that snapshot: 5 monitored,
3 last-run successes, 1 last-run failure, 1 current-status attention job; these are not today's execution counts.
The browser test captures the response requested by the UI itself, compares every visible job and drawer,
and records exactly **two GET /api/jobs requests** across initial load and Refresh, with a newer collectedAt.
Opening all five drawers produces **zero additional API requests**. No page JavaScript errors occurred.

An independent read using Get-ScheduledTask / Get-ScheduledTaskInfo compared all five returned tasks' state,
enabled flag, unsigned result, last-run time and next-run time to the captured API response: **5/5 matched**.
The observed states included FAILED, DISABLED, READY and RUNNING. UNKNOWN / PARTIAL / collector failures were
verified with controlled HTTP fixtures, not by altering real tasks. No tasks were created, edited, started or stopped.

Ignored local evidence (not committed; may contain host-specific task metadata):

- `.tools/stage-2-build.log`, `.tools/stage-2-ui-tests.log`: command output.
- `target/stage-2/live-ui.json`: captured browser response, refreshed response, requests and browser errors.
- `target/stage-2/live-scheduler-comparison.json`: independent scheduler comparison.
- `target/stage-2/live-desktop.png`, `live-mobile.png`, `partial-desktop.png`, `collector-error.png`,
  `large-desktop.png`, `narrow-list.png`, `narrow-drawer.png`: visual evidence.

## Gate result

**PASSED — Stage 2 only.**

| Gate | Evidence |
| --- | --- |
| 1. Initial load uses real /api/jobs | Packaged-service browser test, captured request/response and live screenshots |
| 2. No runtime mock scheduler data | Source assertion, diff inspection, no static job/history rows; no fixture fallback |
| 3. Refresh gets new data | Controlled response changes status/time; live collectedAt advances |
| 4. Failed/Ready/Running/Disabled/Unknown render correctly | Browser status/filter cases; live available states |
| 5. Last result separate from current status | Mapping and browser assertions, real READY/SUCCESS rows |
| 6. PARTIAL shows jobs + warnings | HTTP fixture with permission diagnostic, unmatched include and retained row |
| 7. NOT_CONFIGURED empty state | Browser asserts configuration key/path and zero rows |
| 8. Backend errors cannot show fake success | Initial-error and prior-success-to-error tests assert zero rows and `—` counts |
| 9. Drawer reuses list Job | Request accounting while opening every live drawer; exactly one initial collection |
| 10. No fake 7-day history | Unavailable message, no history day cells or requests |
| 11. Desktop / narrow usable | Real renderer interaction/overflow assertions and inspected screenshots |
| 12. Tests pass | 31 backend + 20 frontend/browser/live checks |

## Known limitations

- **Verified:** this Windows host, the packaged service, real configured tasks, Edge desktop/narrow rendering and the listed fixture cases.
- **Not verified:** Firefox/Safari, physical mobile device, screen-reader speech output, fresh-machine setup or JDK 21 runtime.
- Collection is an on-demand snapshot, not an atomic scheduler transaction. Tasks may change naturally between reads.
- Refresh suppression applies within one page; several open dashboard tabs can still each request collection.
- Native browser network failures are surfaced; an outstanding request remains refreshing until fetch resolves/rejects.
  The existing collector timeout bounds its PowerShell work, not all possible network failures.
- History, reliable MISSED detection and application-level success are unavailable in this stage.
  Existing task failure results are displayed, not investigated or repaired.

## Follow-up recommendations

Update PLAN.md's Stage 2 wording in a separately reviewed documentation change: current scheduler overview,
last-run summaries, and explicit-only MISSED support; reliable execution-window/MISSED detection belongs to Stage 4.
If multiple dashboard tabs become common, assess server-side request coalescing separately.

## Next stage

Stage 3 should persist execution history in SQLite, use stable run identity to avoid duplicate observations,
and populate the existing 7-day history view. Verify restarts, repeated collection, multiple daily runs,
never-run/disabled tasks and timezone boundaries. **Stage 3 is not implemented here.**
