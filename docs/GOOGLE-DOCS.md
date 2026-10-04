# Project design: owner reading entrypoint

## Read the Chinese design

[Local Dashboard｜固定設計藍圖與實作進度（中文版）](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit)

This existing Google Doc is the project owner's Traditional Chinese reading edition. It contains a fixed plan, completion marks, intended design, current mechanisms and remaining work. The link does not grant Google Drive access or change the document's sharing permissions.

Cross-project workflow, Git and deployment defaults: [PERSONAL-PROJECT-GOVERNANCE.md](PERSONAL-PROJECT-GOVERNANCE.md). This document remains the detailed Local Dashboard authority for Google Doc / Living Design policy.

Owner update, 2026-10-05: [Owner Doc Lightweight Sync Policy](PERSONAL-PROJECT-GOVERNANCE.md#74-owner-doc-lightweight-sync-policy) governs editing roles and synchronization cadence. Sol submits `DOC_CHANGE_REQUEST` and never edits Owner Docs; Management handles evidence-backed status/short identity updates and approved content comments. Comment creation/readback is verified; Works use that route without repeated capability tests. Actual failure returns `OWNER_DOC_CONTENT_SYNC_PENDING` / `OWNER_DOC_MANAGER_EDIT_REQUIRED`; full body sync is separately authorized `OWNER_DOC_BATCH_SYNC`. Historical reconciliation evidence below is unchanged.

## Engineering sources

- [PROJECT-DESIGN.md](PROJECT-DESIGN.md): maintained project design and stable feature IDs.
- [DASHBOARD-AS-BUILT-ARCHITECTURE.md](DASHBOARD-AS-BUILT-ARCHITECTURE.md): implementation explanations and evidence boundaries.
- [DASHBOARD-DESIGN-SPACE.md](DASHBOARD-DESIGN-SPACE.md): product direction, prototype and release plan.
- [DASHBOARD-DATA-CONTRACTS.md](DASHBOARD-DATA-CONTRACTS.md): source adapters and data contracts.

The engineering snapshot inspected for this reconciliation is `4c6fddf5890551f35865b907f1ac15f977d0c722` on remote `main`. It includes the reviewed Projects pilot commit `0c27d08bae79e927a4e434f424dc96cc037cd780`. The Google Doc retains the earlier design inventory baseline `085757affe2c2dc0c1de45663395e418ad702e3e` as history and now identifies this current reconciliation snapshot separately. This documentation comparison does not establish a new deployment, rerun historical acceptance tests, or change the engineering design's historical review metadata.

## Fixed reader headings and canonical references

Google Doc Stage labels are a reading outline. In particular, reader Stages 6–11 are not replacements for historical repository Stage names. The table is navigation only: implementation status, limitations and acceptance evidence remain in the linked canonical feature matrix and Stage documents. No feature ID or historical Stage was renamed.

| Google Doc reader location | Existing repository Stage / design source | Stable feature IDs / original requirement |
| --- | --- | --- |
| IV — Stage 0/1: Baseline / Collector | [Stage 0/1](STAGE-0-1.md) | `auto-collector` |
| V — Stage 2: Today / Workflow | [Stage 2](STAGE-2.md), [UX-1](STAGE-UX-1.md), [UX-2](STAGE-UX-2.md) | `auto-today`, `auto-workflow`, `auto-grouping`, `auto-folding` |
| VI — Stage 3: Observed History | [Stage 3A](STAGE-3A.md), [Stage 3B](STAGE-3B.md) | `auto-history` |
| VII — Stage 4: MISSED research | [Stage 4 research](STAGE-4-RESEARCH.md), [event research](STAGE-4-EVENT-RESEARCH.md), [readiness](STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md) | `schedule-availability`, `schedule-shadow-missed`, `schedule-prod-missed` |
| VIII — Stage 5: Runner Core | [Stage 5A](STAGE-5A.md), [5B](STAGE-5B.md), [5B-R](STAGE-5B-R.md), [retry](STAGE-5B-RETRY.md), [identity fix](STAGE-5B-RETRY-IDENTITY-FIX.md) | `runner-core`, `runner-receipts`, `runner-fallback` |
| IX — reader Stage 6: Launcher | [Windows Launcher](WINDOWS-LAUNCHER.md), [Safe Stop](WINDOWS-SAFE-STOP.md) | `desktop-launcher`, `desktop-browser`, `desktop-stop`, `desktop-runtime`, `desktop-bootstrap` |
| X — reader Stage 7: Metadata / Settings | [UX-1](STAGE-UX-1.md), [UX-2](STAGE-UX-2.md), [UX-3](STAGE-UX-3.md) | `auto-metadata`, `auto-settings`, `auto-folding` |
| XI — reader Stage 8: Runner Evidence | [Receipt UI](STAGE-RUNNER-RECEIPTS-UI.md), [coverage diagnostics](STAGE-RUNNER-COVERAGE-DIAGNOSTICS.md) | `runner-ui`, `runner-coverage`, `runner-diagnostics` |
| XII — reader Stage 9: Schedule | [Schedule semantics](STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md), [Snapshot History / Stage A](STAGE-SCHEDULE-SNAPSHOT-HISTORY.md) | `schedule-snapshot`, `schedule-version` |
| XIII — reader Stage 10: Correlation | [Occurrence Correlation / Stage B](STAGE-OCCURRENCE-CORRELATION.md) | `schedule-correlation` |
| XIV — reader Stage 11: Product / Projects | [Design Space](DASHBOARD-DESIGN-SPACE.md), [Data Contracts](DASHBOARD-DATA-CONTRACTS.md), [Project Design](PROJECT-DESIGN.md) | `product-shell`, `product-overview`, `product-projects`, `product-us`, `product-tw`, `product-performance`, `product-reports`, `product-evidence` |
| XV–XX — Releases 1–5 / external sources | Existing [release roadmap](DASHBOARD-DESIGN-SPACE.md#release-roadmap-and-gates) and [source contracts](DASHBOARD-DATA-CONTRACTS.md) | Follow the corresponding canonical IDs above; no release reassignment |
| XI — retained original logs requirement | [PLAN Stage 6 — Logs and Error Detail](../PLAN.md#stage-6--logs-and-error-detail) | No complete matching stable feature ID yet; `runner-ui` covers receipts, not real Latest output |
| VI — retained original reliability requirement | [PLAN Stage 7 — 30-Day Reliability View](../PLAN.md#stage-7--30-day-reliability-view) | No complete matching stable feature ID yet; `auto-history` covers observed seven-day History, not reliability metrics |

The original logs requirement remains pending: real bounded Latest output with source attribution, missing/locked/large/Unicode handling, and a separately reviewed safe output source. Runner receipts redact stdout/stderr text; current result summaries do not complete that requirement. The PLAN's latest-output endpoint and 200-line / 64-KB limits are suggestions, not an accepted API contract.

The original reliability requirement remains pending: success rate, failed/missed counts, average duration, last failure and a 7/30-day toggle. Reliable history is a dependency; Scheduler duration is currently null and production MISSED remains blocked. A bounded history API supporting up to 31 days is not evidence that this view exists. These requirements retain their original PLAN names and are not assigned a new Release here.

## Reconciliation outcome and review boundaries

The live Google Doc was edited in place through the supported Google Drive Docs connector, guarded by its revision ID and verified by native readback. All 24 top-level reader headings retain their text and order; existing links, the `t.0` / `Tab 1` topology and sharing remain preserved. The symbols are text in this Doc; the trusted read found no protected controls. The work changes explanations and navigation, not product acceptance.

- Clarified normalized current status, the six editable metadata fields versus versioned legacy defaults, actual Runner coverage/config states, research early/catch-up rules and the absence of production Schedule UI/API.
- Kept Runner Core implementation separate from formal task migration evidence. Stage 5B launch/path failure and retry identity-fix attempt 2 child exit 1 are distinct historical failures with rollback; neither is a new run in this task.
- Marked blanket **all formal jobs use Runner**, **Installer** and **Windows Service** as proposals requiring Manager review. Incremental low-risk Runner rollout is an established PLAN Stage 5 intent; blanket rollout is unconfirmed. Tray, auto-start and updater remain established later roadmap items.
- Preserved original planned logs and reliability requirements with dependencies, and replaced the repeated checkboxes in reader chapter XXIII with navigation back to canonical chapters/features.

Google Doc sync source: `4c6fddf5890551f35865b907f1ac15f977d0c722` plus the scoped documentation changes in this PR. Revision evidence is recorded in the PR completion/review report. Connector content, style, link and topology checks do not constitute PDF/browser visual inspection or fresh runtime/deployment acceptance.

## Documentation policy — owner decision, 2026-09-30

1. Keep one maintained engineering project design in Git. English is allowed; there is no requirement to translate existing engineering material merely to make it English.
2. The owner-facing Chinese edition lives in the linked Google Doc. Do not create or require a separately maintained `PROJECT-DESIGN.zh-TW.md`. Existing historical Chinese Markdown must not be deleted or rewritten without an explicitly scoped change.
3. Keep plan chapters, existing feature IDs and planned work in fixed locations. Completion changes the checkbox/status in place; it does not move a feature into an "already done" chapter. Retain unfinished and deferred designs, including how they are intended to work.
4. For each feature, distinguish intended behavior, implemented behavior, validation evidence, limitations and remaining work. Explain data acquisition, storage, decisions and error handling; a progress list alone is not a design document.
5. Change scope only for an explicit new need, a demonstrated infeasibility or a reviewed design decision. Record the reason, affected IDs and before/after behavior. Do not silently renumber historical Stages to match reading-section numbers.
6. Engineering files and evidence remain the implementation reference. The Google Doc is a reading projection, not an independent completion ledger. A reader label is not automatically a repository Stage or feature ID.
7. A feature stage reports whether the Git engineering design requires updates; Sol requests Owner Doc changes through `DOC_CHANGE_REQUEST`, without writing the Doc. Management follows the shared lightweight policy rather than doing per-Stage full body sync. Preserve unfinished checkboxes until the applicable acceptance evidence exists. A prototype, a passed unit test and verified deployment are different states.
8. For authorized Owner Doc updates, record the source commit or state that content synchronization is pending. Actual comment failure requires `OWNER_DOC_CONTENT_SYNC_PENDING` / `OWNER_DOC_MANAGER_EDIT_REQUIRED`; legacy `GOOGLE_DOC_SYNC_PENDING` remains historical evidence, not permission for body-writing fallback. This index does not implement automatic Git-to-Docs or Docs-to-Git synchronization.
9. Do not change Google Doc permissions just to make a link work. Do not publish private source data, local credentials, raw receipts or production databases in documentation.

## Current follow-up

- [x] Record the verified Chinese Google Doc link in this repository's documentation branch.
- [x] Record the new policy: engineering design in Git, Chinese reading edition in Google Docs only.
- [x] Add navigation from the Google Doc's fixed reader headings to existing repository Stage names and stable feature IDs without moving completed features.
- [x] Apply the documentation policy in this reconciliation and record actual connector synchronization evidence; final acceptance remains with the Manager after independent lead review.

This is a documentation-only index. It does not authorize Release 1, source integration, Runner migration, Scheduler operations, production MISSED, or a merge to `main`.

## Release 1A-1 synchronization — 2026-09-30

The existing Doc was updated in place for the authorized minimal Local Dashboard Projects Viewer. Engineering source commit: `76f38277d290c2040710becd6beec8dca5ef46d7` (implementation `45a4969c735273a3f0425a77bde0c4069b95e6ce` plus As-Built consistency correction). The subsequent Git commit only records synchronization/evidence; it does not change that engineering snapshot. Final handoff SHA is reported in the PR and direct Astra delivery, avoiding a self-referential SHA.

- Before revision: `ANLCKQl6uZrsSB3SMlTA_d9V0OcUfT3CKhL-2vyJhn16SIYBoh2leNC2p4m93j3HcIsL-MpjbxJ0BH9RYkojBcxIUbEaXt8UriCM3n656XI`.
- Intermediate revision after first 13 edits: `ANLCKQmHSHP11zd4gO8J96_21f_m0QjxGqzm8cdFbXao_XtGVNjrq4vK37O3nLIMVB3r8mfSRJafC1QQLWRzc7x_7ShVySEDvmeW-nXjI_E`.
- Final revision after two Astra consistency corrections: `ANLCKQmLruTA9zHeHK0rYWIJgLg0y9lz054UBRnO6W6T35sEmtU6EVl3w0uI8dykfUt8BMpcmcxAy0fAXBQs4kCRt4RMRr4CbpksGG2-RyI`.
- Initial read used the checked-in Google Docs trusted-read bridge 3.6 with its supported `fileIO` injection for Windows. Connector responses passed programmatically through the checked-in trusted detector/normalizer into ignored local files; no model reconstruction of rich JSON. Manifest complete, no protected controls/warnings.
- Fifteen uniquely matched native paragraph replacements in two guarded batches, scoped to `t.0`, guarded by `requiredRevisionId`; each reported exactly one occurrence. Updated introduction/source SHA, fixed Stage 11 and Release 1 paragraphs/checklist items, actual build-snapshot/parser/error behavior, 33 IDs/only PARTIAL status transition, test evidence and target/current port distinction. Full nine-page and aggregation plans remain incomplete in their fixed locations. Astra also identified two stale current-state statements in the Today/History explanation and Projects source mapping; both now distinguish the minimal canonical build-snapshot entry from the independent prototype and external sources.
- Native readback verified all 15 intended edits and unchanged remaining paragraphs, **24 H1 headings/text/order**, **769 paragraphs**, `t.0 / Tab 1` topology/order, named styles, paragraph/text styles and links. Drive metadata readback confirms unchanged parent/sharing; no permission update was made.
- Formal port target is decided **43871**, while this stage keeps the **8080** program baseline without migration or installed-package acceptance. The Doc accurately marks the minimal implementation as awaiting Astra/Manager review and not deployed.

Local evidence: `.tools/projects-r1a1-doc/before/manifest.json` and `.tools/projects-r1a1-doc/readback-verification.json`. Native content/style/topology verification is complete; no PDF or browser visual inspection of the Doc is claimed. No new Doc, Chinese Markdown companion, stage renumbering or automatic synchronization was introduced.

## Port 43871 current-main integration synchronization — 2026-09-30

Release 1A-1 subsequently passed independent first review and Manager Review and merged at `9e3c8cbf159e5d29ecd3ce19d1fb287797949101` (PR #2); it remains undeployed. The earlier pre-review synchronization record above is historical. This later Stage implements the decided 43871 target and verifies an isolated candidate, without replacing the installed app-image/shortcuts. Management is now `[Dashboard] 管理與初審`, same thread; both existing Works use GPT-6.1 Sol/high under the later owner instruction. The new candidate still requires independent first review and Manager Review.

Engineering source: `3e076590f7d6a2e6d35a0e9083c353c39b0770ae`, following the ancestry-preserving port merge `9ec09d875105117a4315c601350a75a7c38e7d6d`. The subsequent sync/evidence commit records these observations without a self-referential source SHA or change to packaged runtime/canonical design bytes.

- Trusted-read bridge 3.6 ran before writing with supported Windows `fileIO`, complete immutable files and no protected controls/warnings. Before revision: `ANLCKQmLruTA9zHeHK0rYWIJgLg0y9lz054UBRnO6W6T35sEmtU6EVl3w0uI8dykfUt8BMpcmcxAy0fAXBQs4kCRt4RMRr4CbpksGG2-RyI`.
- Ten unique replacements in the existing `t.0` tab, one guarded batch using `requiredRevisionId`; each native reply reports exactly one occurrence. Scoped to source/approval/merge/deployment distinction, existing Stage 6 launcher identity/43871 candidate verification, Stage 11 and Release 1 minimal Viewer state, and source mapping. No chapter/checklist relocation or scope/status promotion.
- After revision: `ANLCKQlc1Xt-onbALcpqw9UXpVkl8H2oQzecDTDEcPp1u9douihqy6NLCY8h3Ihm4jpCmx-nTq6iQ_7L4yUB_AogSwygaHPWA5XudHL77tY`.
- Full native readback verified all ten exact edits and **759 unchanged other paragraphs**, **769 total paragraphs**, **24 H1/all 76 headings with identical text/order**, `t.0 / Tab 1` topology, paragraph/text styles, links, named styles and sharing/parent metadata. No sharing mutation was made. [Sanitized readback receipt](evidence/port43871-google-doc-readback.json).
- The Doc distinguishes actual packaged EXE positive Start/Stop from packaged-main headless negative tests and unit wrong-readiness tests. It records the one external task-state drift as actor/cause unknown, rather than claiming execution states unchanged. Formal files/definitions, installed package and shortcut targets remain protected.

Ignored local artifacts: `.tools/port43871-doc/before/manifest.json`, `after-document.json`, `readback-verification.json`. Native structure/content checks do not claim PDF/browser visual inspection of the Doc or installed deployment. No new document, Chinese Markdown companion, permission change or automatic sync.

Management's independent consistency check identified one wording issue in the Safe Stop checklist: Start's expected-home config-file check must not be attributed to Stop. A second guarded batch changed that one paragraph, explicitly preserving Stop's existing absolute config-URI/command-shape policy without comparing the current HOME. Final revision: `ANLCKQnn8csRkT40tDlEWib9CIxZpFqKuPg4fkjBdpdly7iM3v9KeNhNhkagDU5u0DUAxBFU2DJfI8BGMt0GnV91B-_iC2Z80ltkx4IgVNc`. Final native readback repeats the full content/style/topology/sharing comparison against the initial baseline: ten unique paragraphs changed through eleven single-occurrence replacement operations in two guarded batches; 759 other paragraphs remain unchanged. Final local receipts are `after-correction-document.json` and `readback-verification-final.json`; the public receipt above records this final revision. No runtime/canonical design or packaged bytes changed for this correction.

## Canonical wording correction — read-only reconciliation

The Manager subsequently requested stale Release 1A-1 review wording in Git's packaged canonical design to be corrected. [Bounded correction](PORT-43871-CANONICAL-CORRECTION.md), Git source `f317ac87c5dccb374529aaddd00c723746aee760`, fixes those current statements and refreshes the isolated candidate. Existing Google Doc current paragraphs already say reviewed/merged/undeployed and retain PARTIAL/full Projects pending scope. Native read before/after confirms the same final revision above; **no Doc write was needed or performed**. The Doc's earlier source SHA remains the source of its inspected prior snapshot; no revision churn was introduced merely for the new Git SHA. [Correction evidence](evidence/port43871-canonical-correction.json) records this no-write result separately from the original synchronization.
