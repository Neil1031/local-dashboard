# Bounded canonical correction — existing Port 43871 Stage

**READY_FOR_FIRST_REVIEW.** This addresses the [Manager's consistency finding](https://github.com/Neil1031/local-dashboard/pull/3#issuecomment-5908494121) on reviewed head `d9283efb34e3cf04812c9b495f216e9dc5863181`. The Manager found no blocking runtime/identity defect; this correction does not constitute final approval. Management independently verifies the correction and exact final SHA before returning to Manager.

Correction source: `f317ac87c5dccb374529aaddd00c723746aee760`. The subsequent evidence commit only records this result. Same dedicated worktree, branch `fix/dashboard-port-43871-current-main`, PR #3 and two visible Sol Works; no new Work, subagent, escalation or next Stage.

## Corrected current state

The `product-projects` row's limitation/remaining fields, Known Limitations and Remaining Work now state that Release 1A-1 passed independent first review and Manager Review, merged into main `9e3c8cb`, and remains **not deployed**. PARTIAL remains appropriate because full Projects views, aggregation and the nine-page shell remain unfinished. Remaining work is that later complete scope, rather than completing the already passed Release 1A-1 review. The Evidence Links current-source note no longer describes already merged documentation as pending review.

Historical **Design Changes and Change Log are byte-identical** to the pre-correction working source; their intentionally earlier review states were not rewritten. All 33 feature IDs/order/statuses and counts remain unchanged. The generated prototype sample was regenerated only through the existing generator.

## Fresh candidate and source parity

Actual `scripts/package-windows.ps1` ran in the dedicated worktree with build/candidate LOCALAPPDATA and LOCAL_DASHBOARD_HOME isolated before children. The old candidate was preserved under the worktree's own `dist/LocalDashboard.previous-5484e9df2ba84020864bcded7cc49193`. This differs from the real desktop shortcut target in the primary checkout. No installed app-image or shortcut was replaced.

| Identity | Prior candidate | Corrected candidate |
| --- | --- | --- |
| Raw working/packaged canonical SHA-256 | `60b86ed7219bd9ed4dc2426e1c53f446a43fbfe397a3f7d8983fbeda516c7ffc` | `4cf6e25cfd652db57a8e9417b4b580855705b9eddf5d2f65e3715cc6883918ae` |
| dashboard.jar SHA-256 | `f9ef1b5b2afc9d6913b08bfae8b3fa4eba026fdfa8cdf789c078a4852538a6e0` | `4cc8fc717057d0e1fb2dc79d3df54bbfef8da1874f7b47a1d5946411d8d3c68d` |
| launcher.jar SHA-256 | `3e02ca2d60b10b6627e4bb429f4021821e66cb1ee3b8bbf6bf80f25d1f4d6ec3` | `ccb8777ec28d615831d0807f27c21bdf603830ae023d95c61292cd3aaf6cb29d` |

The EXE hash remains `a56efe7eee546dd261b86d708cde597c307c5fe471946640eba35373a0dccb59`. Jar archive hashes change after rebuilding; every launcher `.class` byte matches the earlier candidate. Runtime/config/UI/source code is unchanged by this correction.

Maven copies **raw working-tree bytes** into the JAR; candidate HTTP serves those bytes. Their canonical digest is `4cf6e25…`. Git's LF blob and the existing generator's LF-normalized digest are **`0345bbd445e3689f5c3444203d13a8475ac5fe848ea3bcd118d7a1838c0f889c`**. Normalizing working CRLF to LF exactly equals the correction commit's Git blob. The generated sample header records that normalized digest, not the raw packaged digest. No generator, attributes or runtime behavior was changed to alter line endings.

## Actual verification

- Existing generator regeneration and `--check`: PASS; source/sample parity, 33 IDs and counts unchanged.
- `node --test tests/projects.test.mjs`: **4 passed**, zero failures/skips.
- Supported packaging inherently ran Maven clean verify: **184 passed**, zero failures/errors/skips; packaged validator PASS. No unrelated Node/prototype suite or negative process scenarios were rerun.
- Packaged canonical/index/modules equal final working source byte-for-byte; Git/LF parity separately verified. No claim that the previous candidate hash represents this corrected snapshot.
- Fresh actual EXE at 43871 with empty monitoring/Runner and fully isolated mutable paths: readiness/browser dispatch, focused Projects browser and real Safe Stop/port/PID cleanup PASS.
- `tests/port43871-browser-smoke.mjs` with `PORT_QA_CORRECTION=1`: **1280/375/320** checks exact DOM IDs/statuses/counts/provenance and actual `product-projects` limitation/remaining text matching corrected canonical content. PARTIAL, reviewed/merged/undeployed state and later complete scope are explicitly asserted. [Actual rendered correction screenshot](evidence/port43871-correction-projects.png) was visually inspected.
- `git diff --check`: PASS.

The first focused adapter attempt failed on environment-key case before starting any candidate. The corrected adapter uses `os.environ` and an independent final-run directory. The successful run emitted a host CLIXML progress rendering warning; a captured read-only reproduction confirmed progress-only streams, exit 0 and no listener. Browser/product/cleanup assertions and the final verification receipt passed. This required no product change or extra negative-process run.

## Protection, Google Doc and review boundary

A new correction baseline/checkpoints were retained separately under ignored `.tools/port43871-correction`; the first round's baseline/evidence/candidate hashes were not overwritten. Before/package/final snapshots cover 6,991 known installed/state/shortcut files, seven related task definitions/execution snapshots and four external project Git snapshots. **Zero file/definition/execution/Git drift** in this correction; final 43871/8080 listeners absent. The first round's separately recorded external 17:00 task-state drift remains historical, not erased or restated as absent. External project coverage is Git, not their DB/receipt contents.

Existing Google Doc was read only. Its current Release 1A-1 introduction, Stage 11, Release 1 and Projects source wording already agree with the corrected Git state; no write was needed. Revision before/after remains `ANLCKQnn8csRkT40tDlEWib9CIxZpFqKuPg4fkjBdpdly7iM3v9KeNhNhkagDU5u0DUAxBFU2DJfI8BGMt0GnV91B-_iC2Z80ltkx4IgVNc`. Its previously recorded engineering source `3e07659…` is its inspected earlier snapshot; it was not rewritten solely to record this new Git source SHA.

[Sanitized correction evidence](evidence/port43871-canonical-correction.json) contains old/new hashes, parity, history preservation, actual tests, bounded protection and no-write Doc result. Original JSON/Doc receipt/screenshot remain unchanged. Commit/push and confirmed exact-SHA handoff go to management, then Manager. No self-approval, main merge, deployment, shortcut replacement, formal Scheduler/Runner/receipt/DB action or next Stage.
