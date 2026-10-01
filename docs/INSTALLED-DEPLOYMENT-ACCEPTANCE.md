# Installed desktop deployment acceptance

## Current cumulative deployment — owner final policy

**READY_FOR_MANAGER_REVIEW — CUMULATIVE_DEPLOYMENT_COMPLETED. Final state: STOPPED.**

Release 1B / 2A / 2B are merged at engineering main `4acd5684b9b5b1381591900f48f7cf7f4f51f302`. The cumulative image was built from committed package source `1b07309582c544072fae29c3b6667d66fac79194`; its five preparatory documentation/sample changes do not change runtime behavior. All 225 installed files and 37 directories match that exact package. No rebuild or repackage followed the swap.

The independent backup `20261001-cumulative-4acd568` contains the complete previous installed image (221 files / 37 directories), external Dashboard home (6,763 files / 105 directories), and two actual shortcuts: 6,986 files, verified before installation by hashes, sizes, timestamps and directories, including hidden files and empty directories. The backup remains retained. The whole previous image also remains at `dist/LocalDashboard.previous-cumulative-20261001-4acd568` and still matches its baseline.

The image was replaced in place. The only config delta adds the approved `dashboard.sources.insider` block with enabled source, trusted absolute CLI/DB locations and timeout 10 seconds; all original bytes and unrelated settings remain. Config SHA-256 changed from `b767c45cb9a36c1876018ce2b3fc2463c387e283825cfde86473d00dbdefe93e` to `463a3028d7f7045f9957ad8bdd8c2966346f2e95915ff3138e1d3f4e74ba1575`. No Task definition, Runner config, receipt, shortcut or source-data mutation was performed by this deployment.

The original run state was STOPPED. Earlier owner startup is historical. At the final no-HTTP identity check on 2026-10-01T06:29:31Z, no matching Dashboard process or 43871 listener remained and `server.pid` was absent. It was already stopped, so no duplicate Stop or new Start was invoked; this checkpoint does not attribute the earlier stop actor.

The owner's final direct instruction removes post-install runtime, HTTP, API, browser/UI, DB and Safe Stop acceptance gates. Actual installed visual QA was **not performed and is not required**. Earlier installed API/readonly DB observations remain private historical evidence, not completion gates or a claim of full installed QA PASS. No known destructive data/config issue was found in the evidence already collected. Future owner-reported problems follow the agreed fix-forward policy.

Pre-install validation remains: normal Maven verify 198 tests, zero failures/errors/skips; frontend 74 passed, zero failed, four existing opt-in URL-dependent skips; normal Windows packaging validation and 10 source/JAR resource comparisons passed. Release 2B isolated browser QA and isolated real-source smoke remain development evidence. No tests or packaging were repeated for this closeout.

The [compact cumulative receipt](evidence/cumulative-installed-deployment.json) records exact installed hashes, backup/config/swap identity, final STOPPED and native Google Doc readback. Six current-state paragraphs in the existing Chinese Google Doc were synchronized with revision guarding; all 769 paragraphs, 76 headings, one tab, native styles, links and lists were preserved, with 763 paragraphs untouched. No sharing operation or document PDF/browser visual QA occurred. PR #4 history below is retained separately. This operational evidence awaits management review; no merge or next Stage is included.

## Historical PR #4 operational acceptance

**READY_FOR_MANAGER_REVIEW — DEPLOYMENT_SUCCEEDED. Final state: STOPPED.**

The installed desktop image now matches the exact reviewed package from PR #4. Actual installed startup, DB migration, Today / History / Projects, and matching Safe Stop passed on 2026-09-30. This report records operational acceptance; independent management review remains pending.

### Identity and retained backup

- Approved engineering source: `4c762ff4ad1cca569da4e4546f7ef3440045664e`.
- Accepted snapshot: `1db387f9ee1411d5a2984ba282f7e51ca93a4afb`; approved merged main: `38092190f0e44bd32317dba66b1a6e70afd550ff` (PR #4).
- Installed image: `F:\AI workspace\local-dashboard\dist\LocalDashboard`. All 221 files and 37 directories match the reviewed candidate; full manifest SHA-256: `706a6df045c9c07dc2a90a7b534cc3a4f50c09ea9e474d27f6a7ebed0d424b73`.
- Complete independent backup retained at `F:\AI workspace\local-dashboard-deployment-backups\20260930-pr4-38092190`: entire old image, entire external home, both actual desktop shortcuts, manifests, and readonly DB baseline. Full file/hash/directory readback passed, including hidden files and empty directories. Old image: 225 files / 37 directories; external home: 6,764 files / 105 directories.
- The complete old image also remains at `dist\LocalDashboard.previous-deploy-20260930-pr4`. No candidate rebuild, repackaging, or accepted source modification occurred.

### Actual installed acceptance

| Check | Observed result |
| --- | --- |
| Startup | Exact installed EXE, installed working directory, actual external home; server PID 34628 using the installed bundled Java and exact dashboard JAR/config URI |
| Listener / readiness | Sole loopback `127.0.0.1:43871` listener owned by that server; HTTP 200 with exact `local-dashboard:ready:v1`; no 8080 listener |
| Browser dispatch | Launcher log recorded `BROWSER_DISPATCHED`; supported Chrome extension subsequently opened and tested the real installed page |
| Today | Real five-job snapshot, collection OK; Failed filter showed two jobs and excluded three; actual detail opened and Escape closed it |
| History | Seven local days, 9/24–9/30; actual observed execution cell opened its stored detail. Separate readonly History API query returned all 18 original run IDs |
| Projects | Real installed canonical resource, 33 exact stable IDs/statuses; counts and provenance match packaged parser output; reload updated read time; Launcher DONE and Projects PARTIAL |
| Safe Stop | One exact installed EXE `--stop --quiet` invocation, exit 0; twice confirmed PID 34628 identity, then matching Windows forced fallback because normal termination was unsupported; EXITED and PID_CLEANUP recorded |
| Final state | No Dashboard process, no 43871/8080 listener, actual `server.pid` removed; original STOPPED state restored |

Visual inspection covered Today, History table/detail, and Projects card/counts/provenance. The browser used real APIs; no fixture routing or simulated collector was inserted. No warning/error console entries were captured during these interactions. Literal shortcut clicking was not required: both actual shortcut hashes, target, arguments, working directory and icon wiring match the baseline.

### Migration and data preservation

Readonly SQLite checks used `mode=ro` / `query_only`; the final stopped DB has `integrity_check = ok`, schema v2, 6 jobs, 22 job_run records, 5 schedule_version records and 15 schedule_observation records. All original six job IDs and 18 run IDs remain, with their original important fields preserved; four new observations were added normally by the application.

Original rows are **not byte-identical**: five jobs have updated `last_seen_at`; one existing run has updated `last_observed_at` and normal `raw_result` enrichment. All original raw keys/values remain, with only `MultipleInstances`, `RunOnlyIfIdle`, `RunOnlyIfNetworkAvailable`, and `WakeToRun` added. No manual SQL writes or DB restore occurred.

### Protected state and limits

The full external-home manifest comparison changed only the DB, three ordinary product logs and removal of `server.pid`. All other entries match the pre-deployment backup. Application config, formal Runner config and receipt files are unchanged; both configured formal receipt roots remain absent. Seven relevant Scheduled Task definition XML hashes and both desktop shortcut hashes/wiring match. Task execution state is ambient information, not used as evidence that definitions were unchanged.

No Scheduler task or Runner execution was triggered. Scheduler Success / result 0 remains Scheduler evidence and does not prove application business success. Production MISSED, full nine-page shell and cross-project aggregation remain outside this acceptance; Projects remains PARTIAL. No next Stage or PR merge is included.

Earlier assumed human startup was invalidated by the owner's correction. Earlier platform/browser refusals were not product failures. After the owner installed the Chrome extension and explicitly requested retry, supported Chrome verification succeeded. Old-JAR/v2 compatibility and automatic rollback were excluded by the owner's fix-forward strategy; complete backups and the previous image remain retained.

### Evidence and document update

- [Sanitized acceptance results and exact hashes](evidence/installed-deployment-acceptance.json).
- [Existing Google Doc native readback receipt](evidence/installed-deployment-google-doc-readback.json).
- [Existing Chinese Google Doc](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit): one operational update to P00298; 768 other paragraphs, all 76 headings, styles, links, lists, tab topology and sharing preserved. An initial encoding-affected request made no text change; the corrected guarded request changed exactly one occurrence and passed complete native readback. No Doc PDF/browser visual QA is claimed.

Private manifests, readonly DB snapshots, logs, API payloads, and Chrome screenshots remain in the local deployment operations directory. They are excluded from Git; management receives their local pointers for review.
