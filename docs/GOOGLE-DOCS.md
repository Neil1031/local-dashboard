# Project design: owner reading entrypoint

## Read the Chinese design

[Local Dashboard｜固定設計藍圖與實作進度（中文版）](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit)

This existing Google Doc is the project owner's Traditional Chinese reading edition. It contains a fixed plan, completion marks, intended design, current mechanisms and remaining work. The link does not grant Google Drive access or change the document's sharing permissions.

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
7. A feature stage must report whether the engineering design and Google Doc require updates. Preserve unfinished checkboxes until the stated implementation and acceptance criteria are met. A prototype, a passed unit test and verified deployment are different states.
8. When the Google Doc is updated, record the source commit or clearly state that synchronization is pending. This index does not implement automatic Git-to-Docs or Docs-to-Git synchronization. If the editing capability is unavailable, report `GOOGLE_DOC_SYNC_PENDING` rather than claim synchronization.
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
- After revision: `ANLCKQmHSHP11zd4gO8J96_21f_m0QjxGqzm8cdFbXao_XtGVNjrq4vK37O3nLIMVB3r8mfSRJafC1QQLWRzc7x_7ShVySEDvmeW-nXjI_E`.
- Initial read used the checked-in Google Docs trusted-read bridge 3.6 with its supported `fileIO` injection for Windows. Connector responses passed programmatically through the checked-in trusted detector/normalizer into ignored local files; no model reconstruction of rich JSON. Manifest complete, no protected controls/warnings.
- Thirteen uniquely matched native paragraph replacements, scoped to `t.0`, guarded by `requiredRevisionId`; each reported exactly one occurrence. Updated introduction/source SHA, fixed Stage 11 and Release 1 paragraphs/checklist items, actual build-snapshot/parser/error behavior, 33 IDs/only PARTIAL status transition, test evidence and target/current port distinction. Full nine-page and aggregation plans remain incomplete in their fixed locations.
- Native readback verified all 13 intended edits and unchanged remaining paragraphs, **24 H1 headings/text/order**, **769 paragraphs**, `t.0 / Tab 1` topology/order, named styles, paragraph/text styles and links. Drive metadata readback confirms unchanged parent/sharing; no permission update was made.
- Formal port target is decided **43871**, while this stage keeps the **8080** program baseline without migration or installed-package acceptance. The Doc accurately marks the minimal implementation as awaiting Astra/Manager review and not deployed.

Local evidence: `.tools/projects-r1a1-doc/before/manifest.json` and `.tools/projects-r1a1-doc/readback-verification.json`. Native content/style/topology verification is complete; no PDF or browser visual inspection of the Doc is claimed. No new Doc, Chinese Markdown companion, stage renumbering or automatic synchronization was introduced.
