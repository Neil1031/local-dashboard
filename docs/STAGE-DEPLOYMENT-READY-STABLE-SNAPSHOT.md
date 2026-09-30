# Deployment-ready stable source/package snapshot

Status: **READY_FOR_FIRST_REVIEW**. This is a bounded source/package evidence stage; installation acceptance belongs to a separately authorized deployment. No merge or desktop deployment was performed.

Manager authorization: [PR 3 closeout and this stage](https://github.com/Neil1031/local-dashboard/pull/3#issuecomment-5909392235).

- Approved main baseline: `eba10039d19eb23157c7bd02925800712faef4a6`.
- Frozen engineering source: `4c762ff4ad1cca569da4e4546f7ef3440045664e`.
- Branch: `docs/dashboard-deployment-ready-snapshot`.
- Dedicated worktree: `F:\AI workspace\local-dashboard-deployment-ready-snapshot`.
- Final review head is the subsequent evidence-only commit, reported by exact SHA in the PR and handoff. The engineering source was frozen before packaging; evidence commits do not alter packaged source.

## Plan / Stage / Gate / Self-QA

| Stage | Goal and scope | Dependencies / gate / done when | Result |
| --- | --- | --- | --- |
| Stable source | Correct current-state wording in canonical, README, As-Built and Windows docs | Approved main; preserve history, feature IDs/order/statuses/counts and runtime source | PASS |
| Generated snapshot | Regenerate through the existing generator | `--check`; full parsed canonical model equals generated model; historical sections unchanged | PASS |
| Fresh candidate | Supported Windows packaging in the dedicated worktree | Both mutable namespaces isolated before the first child; empty monitoring/Runner; Maven and packaged smoke checks pass | PASS, 184 tests, no failure/error/skip |
| Focused product QA | Actual candidate EXE and Projects at 1280/375/320 | Raw packaged canonical/UI/module bytes, 33 IDs/statuses/counts, stable wording, provenance, no overflow/errors; actual Safe Stop cleanup | PASS |
| Native Doc / protection | Targeted Google Doc correction and bounded installed-state evidence | Revision guard, native readback, unchanged structure/styles/history/sharing; immutable baseline plus resume/package/final comparisons | PASS |
| Review handoff | New PR against main and exact remote head | Management independently reviews the final diff/evidence before Manager acceptance | Pending independent review; no self-approval |

## Stable wording and preserved scope

Port 43871 passed independent first review and Manager Review and was merged at `eba1003`. Launcher/Safe Stop's source target is 43871. Repository/package approval does not establish the currently installed desktop version; separate deployment evidence must verify it. These statements remain valid before and after installation.

The current canonical introduction and Launcher row no longer refer to a candidate awaiting this review. Projects retains `PARTIAL`, its accepted minimal viewer and the pending full views/aggregation/nine-page shell. As-Built's stale R1A1 capability row and heading are corrected. Windows upgrade wording requires identifying the installed version and using its matching Safe Stop, rather than assuming an 8080 instance exists. There is no Service, installer or updater.

Canonical Design Changes and Change Log are byte-identical in the Git LF representation. Historical Stage documents, prior test records, old evidence and screenshots remain unchanged. The canonical's historical baseline/design date and all feature IDs/order/statuses remain unchanged: DONE 19, PARTIAL 1, BACKEND_READY 3, DESIGNED 7, NOT_STARTED 2, BLOCKED 1; all other statuses 0.

## Fresh package identity and byte parity

The supported `scripts/package-windows.ps1` path ran clean verify, jpackage and its packaged-runtime validator. `LOCALAPPDATA` and `LOCAL_DASHBOARD_HOME` were isolated before its first child, with empty Scheduler selection and Runner configuration/mapping. The validator used its own isolated probe. The real desktop image path was never a packaging destination.

| Candidate file | SHA-256 |
| --- | --- |
| `LocalDashboard.exe` | `a56efe7eee546dd261b86d708cde597c307c5fe471946640eba35373a0dccb59` |
| `app/launcher.jar` | `122e03345c4718aaea5cd317fe1190ead7aae2a9bf0851d9a7bee2deae96e161` |
| `app/dashboard.jar` | `2a9bd046ac6674566233671a0333e087b8041897a0e892f1621a1e58bdbb89d4` |

Raw working/package canonical SHA-256: `bffdae6c76d01981e9d22b19b09fc474f205c1d847d89102c6e32665332a75e7`.

Git LF/generator canonical SHA-256: `f53134092e0094517c583e513bd0b811f7a20f75246e2443b2f50e561c01ba2a`.

Maven copies raw working bytes; Git and the generator normalize CRLF to LF. These are distinct digest domains. The complete generated model equals the parsed canonical, and the source matches the frozen Git blob after normalization. Packaged Windows README/Safe Stop companion documents also equal their source bytes.

The retained, accepted 43871 candidate's archive hashes were checked against its prior receipt and its worktree tree equals approved main. Direct logical-entry comparison shows launcher.jar's 15 entries unchanged, including 11 classes; dashboard.jar has 227 entries with only `BOOT-INF/classes/static/project-design/PROJECT-DESIGN.md` changed, and all 176 runtime classes unchanged. Archive container hashes changed on rebuild; they are not evidence of a runtime change.

The actual candidate EXE started at 43871, confirmed readiness and browser dispatch, returned NOT_CONFIGURED with empty monitoring, and passed focused DOM/resource checks at all three widths. Its matching EXE Safe Stop released the port and removed its isolated PID. Six new card screenshots were visually inspected; prior screenshots were not overwritten. Parser/loader 4 tests, generator `--check`, full model/history/runtime gate and `git diff --check` passed. The earlier negative process matrix and Node 50/prototype 7 suites were not rerun in this documentation stage.

## Google Doc

The [existing Chinese design document](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit) contained stale current review/install wording. A file-backed trusted read found no protected controls; a fresh native revision check confirmed the same baseline after the user-requested pause. One requiredRevisionId-guarded native batch replaced eight unique paragraphs: 3/165/298/316/484/502/521/690, with one occurrence each.

Native readback verifies 769 paragraphs, 761 other paragraphs unchanged, 24 H1 / 76 headings, fixed Stage/Release order, paragraph/text/link styles, topology and sharing preserved. The historical candidate test counts and unexplained 17:00 external drift paragraph are unchanged. No duplicate document/Chinese Markdown or sharing change was created. Google Doc visual QA was not performed; verification is native readback.

Before/after revisions and the sanitized preservation receipt are in [native Doc evidence](evidence/deployment-ready-google-doc-readback.json).

## Installed-state protection and limits

One immutable before inventory and separate resume/package/final comparisons cover 6,991 files across the installed image, formal LocalDashboard state and two real shortcuts; seven related task definitions/execution snapshots; and four external project Git states. All four drift categories were 0 at every checkpoint. Both 43871 and 8080 had no listener at before/checkpoints/final; no real legacy instance was stopped. The user-requested pause is included in the resume comparison rather than silently replacing the baseline.

Formal Runner config's hash matches the before inventory. Its configured primary/fallback absolute roots are inside the protected home and contained zero baseline files; both roots were absent at the package/final checks. The initial inventory recorded files, not empty directory-entry existence, so it does not prove the roots were absent at that earlier instant. External Git parity does not prove external production DB/receipt coverage.

No installed image/shortcut replacement, migration, formal Scheduler/Runner/receipt/DB operation, new Projects capability, installer/updater/Service or next stage occurred. Private config, production DB/logs, credentials and app-image binaries remain outside the PR. The approved source parent and retained accepted candidate remain available; actual installed-image rollback requires separate deployment authorization/evidence.

## Findings and fixes

The Windows upgrade sentence was stabilized before engineering freeze. A new model comparison initially differed only because parser metadata intentionally has a null prototype; the gate now compares the complete serialized data model on both sides. Draft Doc output's cp950 encoding error was resolved with UTF-8 output; no native write occurred during the pause.

Supported packaging initially encountered Windows wrapper/Surefire CreateProcess 740 from the existing cmd.exe RUNASADMIN setting, then Maven-home access under the restricted execution account. The approved tool execution with process-local cache/compatibility variables passed the unchanged supported packaging path. No registry/system setting, runtime code, pom or test-skipping policy was changed. Failure logs remain local and are not successful test evidence.

Complete sanitized receipt: [deployment-ready-snapshot.json](evidence/deployment-ready-snapshot.json). New focused QA: `tests/deployment-ready-model.mjs`, `tests/deployment-ready-projects-smoke.mjs`. No unresolved implementation blocker; independent review and installation acceptance are separate remaining gates.
