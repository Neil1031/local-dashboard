# Port 43871 — current-main integration and isolated candidate acceptance

**READY_FOR_FIRST_REVIEW.** Implementation and bounded Self-QA are complete. This is not independent review approval, Manager approval, a main merge or installed deployment. The management Work is `[Dashboard] 管理與初審`; implementation is `[Dashboard] Sol 實作`, both GPT-6.1 Sol/high under the owner's later instruction. No new Work/subagent was created.

**Later bounded correction:** Manager requested only stale current-state canonical wording to be corrected. The [canonical correction receipt](PORT-43871-CANONICAL-CORRECTION.md) records source `f317ac8`, a fresh supported isolated package, revised raw canonical/artifact hashes and focused browser wording parity. The original evidence below describes the prior `3e07659` candidate; its hashes, Doc receipt and screenshot remain preserved as that earlier snapshot. The correction still requires management verification and Manager review; it is not a new Stage or deployment.

## Plan / Stage / Gate

| Stage | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| 1 | Inspect accepted main, original port delta, actual shortcut/state boundaries | Read-only refs, source, installed target | Clean main `9e3c8cb`; dedicated worktree; exact baseline retained | Before hashes, successful listener query, source ancestry |
| 2 | Integrate 43871 and close existing-instance reuse gap | Original source `96fd763` and existing identity probe | No fallback/LAN; identity before browser; preserve Projects and Stop semantics | Launcher/Stop tests and full build |
| 3 | Package and exercise isolated candidate | Dedicated dist; child-scoped LOCALAPPDATA/HOME; empty monitoring/Runner | Real 43871 start/reuse/refusal/Stop/restart; protected installation unchanged | Runtime probes, real EXE, actual static bytes/browser, checkpoint diffs |
| 4 | Record sanitized evidence, synchronize existing Google Doc, new PR and handoff | Engineering source commit; native revision guard | Reviewable artifacts and confirmed delivery to management | Generator/diff check, native readback, final protection inventory |

## Source integration

- Accepted Release 1A-1 main: `9e3c8cbf159e5d29ecd3ce19d1fb287797949101`. PR [#2](https://github.com/Neil1031/local-dashboard/pull/2) passed independent first review and Manager Review, merged with history preserved; deployment was not performed.
- Old port source: `96fd763d1281f1d3461e862c5b59b79a5e05445e`, based on `22af205509f2a25ce287053a120cd6a82784a8ee`. Only that one commit was absent from accepted main. Its 16-file delta was inspected before integration.
- Branch `fix/dashboard-port-43871-current-main`, dedicated worktree `F:\AI workspace\local-dashboard-port-43871-current-main`. Explicit `--no-ff` merge `9ec09d875105117a4315c601350a75a7c38e7d6d` has accepted main and old port commit as its two parents. No conflicts, wholesale old-file replacement or patch-only ancestry claim.
- Original port branch and UX-backlog worktree remain untouched. The new branch has a separate PR; closed PR #2 is not reused. Primary checkout remains on accepted main.
- `docs/evidence/dashboard-port-43871.json` and `PortChangeSmoke.java` came from the original commit. Their September 22 observations/133 tests are historical evidence, not this Stage's acceptance.

## Resulting behavior

Spring's default and packaged Start/Stop use `127.0.0.1:43871`. The packaged launcher has no automatic port fallback and YAML cannot expose LAN/change its port. Existing direct-JAR explicit `--server.port` override remains available; package-validation's ephemeral direct-JAR service is a distinct test service.

Before reusing a ready listener, Start now requires a well-formed two-line PID/start record, exact live process start, this image's bundled Java/JAR, exact six-token command, the specified data home's existing `config/application.yml`, a sole loopback listener owned by that PID and the exact no-redirect/no-proxy readiness response. It rechecks record/liveness/start and Windows identity before browser dispatch. Cold starts apply the same final gate. Probe errors fail closed. A mismatched existing service is never terminated by Start. Failure cleanup retains only a child created by that invocation.

Safe Stop retains its existing full policy and rechecks before termination/force. Windows `destroy()` can itself be forcible; this is not a guarantee of Spring graceful shutdown. No unrelated process, descendants, browser or Scheduled Task is stopped.

## Isolation and protected-state evidence

Actual desktop Start/Stop shortcuts point to the primary checkout's app-image. Candidate packaging ran only in the dedicated worktree; its repo-relative `dist/LocalDashboard` differs from that installed target. No shortcut installer or installation replacement ran.

Every candidate child receives its own **process-scoped** LOCALAPPDATA and LOCAL_DASHBOARD_HOME. History DB/config/logs are under the isolated home; metadata, lock and PID are under the isolated LOCALAPPDATA/LocalDashboard. Paths are resolved/checked before launch. No global/user environment is changed. Monitoring include/exclude and Runner mappings are empty; Runner config-path is empty. No formal receipt root or Runner config is read by candidate monitoring. Browser unrelated API routes use explicit test fixtures.

The packaging validator now sets both environment paths **before its first child**, restores them in `finally`, and cleans up via the retained child process handle. The legacy launcher/bootstrap/Safe Stop acceptance scripts were inspected and not executed unchanged: they lack full LOCALAPPDATA isolation, require formal task/history and some install true desktop shortcuts. This Stage uses the small existing-adapter-based `verify-port43871-candidate.py`, `Port43871Probe.java` and `port43871-protection.ps1` instead.

The bounded protection inventory covers **6,991 files** in the known installed app-image, real Dashboard state (including config/DB/lock/PID/Runner state), and two desktop shortcuts; **7 related Scheduler definitions/execution states**; and **4 related external project Git HEAD/status snapshots**. Initial inventory, package/live/final comparisons and full details remain ignored locally; public summaries/hashes contain no private config contents, databases, credentials or raw production logs. This is not a whole-machine or every-external-data-file audit.

- Package checkpoint: zero file, definition, execution-state and external-project Git drift.
- Live checkpoint: zero file, definition and external-project Git drift; 43871/8080 listeners absent after cleanup.
- One related task execution state changed from its earlier snapshot to a 17:00 run, consistent with the previously recorded next-run time. Record as `EXTERNAL_DRIFT_OBSERVED`, actor/cause `UNKNOWN`; no Scheduler execution/mutation request was made by this Stage. Do not call execution states unchanged or attribute causation from timing alone. Detailed delta stays private.
- Final checkpoint and candidate/installed hash evidence are in [sanitized JSON](evidence/port43871-current-main.json). Preserve the baseline; do not replace it with the after-state.

Read-only parsing of the unchanged formal Runner config confirms both configured absolute primary/fallback roots are inside the protected Dashboard state boundary. The baseline has zero files under either root; both directories are currently absent. Before-directory-entry existence was not separately recorded, so this is file/inventory coverage, not a retroactive claim of baseline directory absence. The four external project snapshots cover Git only, not their DB/receipt contents. Final task state is Ready with the later 17:00 execution/result retained; actor/cause remain unknown.

## Current verification

Runtime: bundled Node 24.19.0, JDK 24.0.2, Maven Wrapper 3.9.11, bundled Playwright/Edge headless, bundled Python. No dependency installation. The following commands ran in the dedicated worktree with explicit bundled runtime paths; log files are ignored under `.tools/port43871/`.

| Gate / command | Actual result |
| --- | --- |
| `package-windows.ps1 -JdkHome <JDK24>`; `PROJECTS_NODE` + `NODE_PATH` set | Maven clean verify **184 passed, zero failures/errors/skips**, including real Spring resource/browser tests; app-image built |
| Packaging's isolated direct-JAR validator and actual EXE `--stop --quiet` no-op | PASS; bundled runtime, readiness, empty config, isolated SQLite and no bootstrap from Stop |
| `node --test tests/projects.test.mjs tests/dashboard.test.mjs tests/history.test.mjs tests/projects-browser.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs tests/settings-browser.test.mjs` | **50 passed, zero failures/skips** |
| Generator regenerate then `--check`; `node --test design/prototype/check.mjs` with ignored screenshot directory | Source matches, **7 passed, zero failures/skips** |
| `python scripts/verify-port43871-candidate.py`; `PORT_QA_JDK`, `PORT_QA_NODE`, `NODE_PATH` set | Final isolated runtime gates PASS, real EXE cold/duplicate/restart/browser dispatch; full verified cleanup |
| Focused `tests/port43871-browser-smoke.mjs` against the running candidate | Static index/modules/canonical bytes equal working-tree sources; DOM exact 33 IDs/statuses, every status count and provenance; no overflow/errors at 1280/375/320 |
| Actual screenshot inspection | [Projects candidate screenshot](evidence/port43871-projects.png) visually inspected; genuine browser render with unrelated APIs fixture-routed |
| `git diff --check` | PASS |

Actual live negative gates preserve their owned unrelated fixture and the candidate: port occupied by a service returning matching readiness; wrong/missing PID; exact PID but wrong start; wrong config home; wrong image executable/JAR; same executable with wrong JAR; exact Java/JAR/config but an extra command token. Both actual Start code and real packaged Stop were checked where applicable; config/image/JAR probes directly exercise the packaged product identity method. Wrong readiness, unavailable identity, termination rechecks and forced-path identity changes are additionally covered by existing policy tests, not claimed as every possible live OS failure.

Positive Start/reuse/restart and Stop use the actual packaged EXE. Negative Start invokes the same packaged `WindowsLauncher.main` using bundled Java with `java.awt.headless=true` so an unattended error dialog cannot hang the test; it does not claim negative EXE GUI testing. Config/image/JAR adapter probes directly call the packaged identity gate. The validator explicitly retains each created server's native Process.Handle before cleanup.

Safe Stop releases 43871, removes the candidate PID and preserves isolated config, metadata and marker hashes. SQLite integrity is `ok` and confirmed history remains empty with empty monitoring, including restart. Actual EXE OS browser dispatch succeeds with URI 43871; headless browser verifies the rendered candidate. This does not claim reading the default browser's address bar or a production GUI acceptance.

### Self-QA corrections and evidence limits

- Initial execution-state comparison serialized parsed ISO dates differently; comparison now uses UTC instants. Original detail remains local. This formatting discrepancy is distinct from the later real 17:00 task-state drift.
- First negative wrong-config adapter rejected its own environment guard before reaching product identity. The adapter now sets that child's HOME to the alternative valid isolated home; the corrected run reaches `confirmReadyInstance` and records its refusal. Separate same-executable/wrong-JAR and extra-command cases were added. Earlier run is retained as `candidate-run1`, not used to claim that missing gate.
- First screenshot contained too much header. Focused browser QA now scrolls the actual Projects viewer and checks rendered IDs/statuses/counts/provenance before capturing; no screenshot editing or fabricated data was used.
- The full Maven/Node/prototype suites were not rerun merely for later evidence/documentation edits. The affected live negative gates and stronger browser assertions were rerun against unchanged packaged runtime bytes.

## Documentation, review and stop boundary

33 feature IDs and all status counts remain unchanged: 19 DONE, 1 PARTIAL, 3 BACKEND_READY, 7 DESIGNED, 2 NOT_STARTED, 1 BLOCKED; the other four statuses remain zero. `product-projects` stays PARTIAL. Full Projects/aggregation and the nine-page product remain pending in fixed locations. Canonical design, As-Built, README and launcher/Stop current explanations were updated; historical 8080 acceptance records and unrelated 18080/18081 services remain historical. Active references in code/tests/current docs use 43871; a deliberate 8080 wrong-port rejection test remains.

The existing Chinese Google Doc is edited in place through a native, revision-guarded connector; exact engineering source SHA, revision/readback and structure/sharing preservation are recorded in [GOOGLE-DOCS.md](GOOGLE-DOCS.md). No new Doc, Chinese Markdown duplicate, chapter move, permission change or automatic sync is introduced.

Synchronization is verified against engineering commit `3e076590f7d6a2e6d35a0e9083c353c39b0770ae`. Subsequent changes only record synchronization/final evidence; frozen canonical/generated sample and candidate runtime bytes remain unchanged. Final protection checkpoint has zero file/definition/external-project Git drift, one externally changed task execution record, and no 43871/8080 listener.

Deliver a new PR and exact final SHA to the management Work; only confirmed direct tool delivery becomes HANDOFF_DELIVERED. Management performs independent first review and routes to Manager. No self-review PASS, main merge, installed upgrade, old-8080 shutdown/migration, Scheduler/Runner production action, installer/Service/auto-start/firewall or next Release is authorized by this Stage.
