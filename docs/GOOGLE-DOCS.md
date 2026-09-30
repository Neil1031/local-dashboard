# Project design: owner reading entrypoint

## Read the Chinese design

[Local Dashboard｜固定設計藍圖與實作進度（中文版）](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit)

This existing Google Doc is the project owner's Traditional Chinese reading edition. It contains a fixed plan, completion marks, intended design, current mechanisms and remaining work. The link does not grant Google Drive access or change the document's sharing permissions.

## Engineering sources

- [PROJECT-DESIGN.md](PROJECT-DESIGN.md): maintained project design and stable feature IDs.
- [DASHBOARD-AS-BUILT-ARCHITECTURE.md](DASHBOARD-AS-BUILT-ARCHITECTURE.md): implementation explanations and evidence boundaries.
- [DASHBOARD-DESIGN-SPACE.md](DASHBOARD-DESIGN-SPACE.md): product direction, prototype and release plan.
- [DASHBOARD-DATA-CONTRACTS.md](DASHBOARD-DATA-CONTRACTS.md): source adapters and data contracts.

The engineering baseline inspected for this index is `4c6fddf5890551f35865b907f1ac15f977d0c722` on remote `main`. It includes the reviewed Projects pilot commit `0c27d08bae79e927a4e434f424dc96cc037cd780`. The Google Doc still identifies the earlier inspected design baseline `085757affe2c2dc0c1de45663395e418ad702e3e`; adding this index does not claim a new deployment or full content synchronization.

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
- [ ] Reconcile the Google Doc's reader-oriented Stage labels with existing repository Stage names and stable feature IDs without moving completed features.
- [ ] Apply this policy to the next scoped design update and record its actual synchronization result.

This is a documentation-only index. It does not authorize Release 1, source integration, Runner migration, Scheduler operations, production MISSED, or a merge to `main`.
