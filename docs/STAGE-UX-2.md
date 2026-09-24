# Stage UX-2: Workflow view and dated task folding

## Plan and gates

| Stage | Goal and scope | Dependency | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| 0 | Confirm clean `main` at `8048c8e4` and create `implement/dashboard-ux-workflow` | UX-1 merged | No work on `main`; Scheduler definitions inventoried | Git status and read-only XML hashes |
| 1 | Fold valid `Accumulation-Check-YYYY-MM-DD` jobs in Today and History | Existing raw IDs and history API | Latest date visible; older jobs expandable; every execution remains under its raw job | Node and browser date/identity tests |
| 2 | Add Today workflow, legacy wording, and list counts | UX-1 metadata | `data`, `external`, and `orderOnly` are visibly distinct; statuses remain API values | Browser interactions, filters, request counts, narrow layout |
| 3 | Regress, package, and publish review branch | Stages 1–2 | Node, browser, Maven, packaged browser and integrity checks pass | Diff check, remote SHA, clean tree, Scheduler hash comparison |

## Architecture

All presentation logic stays in `dashboard.mjs` and `index.html`. `datedTaskDate` validates the actual calendar date, and `foldDatedJobs` groups the existing job objects without changing IDs or API data. When multiple raw jobs have the latest date, all of them remain visible. The group is inserted at the existing UX-1 order position. Unrecognized or invalid suffixes remain ordinary jobs under `其他`.

Today hides older dates until the user expands them. History uses separate table rows for every raw job, including history-only jobs, and retains each row's day cells and execution drawer. Expanding either view sends no request. A single dated job has no folding control.

The workflow is an overview built from the current `/api/jobs` snapshot. Its buttons open the same current-job drawer. It shows the latest dated job as the representative date and reads status directly from that job. Text alongside each node names the metadata relationship: `→ 資料前置`, `⇢ 外部前置`, or `⋯ 僅顯示順序，非硬依賴`. Weekly and the dated check each refer to Daily data; no Check-to-Weekly dependency is invented. Market is identified as independently tracking existing signals. Known downstream names are presented as possible data impact, without changing any downstream status.

`Monitored` remains the full API snapshot count. The Today list also reports currently visible raw job rows, legacy-hidden jobs, jobs excluded by the current status filter, and older dated jobs folded out of sight. These four values partition the monitored total. The legacy switch says **顯示舊版排程**; a disabled job without hidden metadata remains visible.

The controls are native buttons with `aria-expanded`; the groups have headings and the workflow uses text and symbols, not color alone. Drawer focus return is shared with the original list. The workflow, folding, filters, and drawer only reuse cached data from the one `/api/jobs` call; History still loads `/api/history` once per range or after a successful refresh.

This stage does not change API contracts, Scheduler definitions, Runner, MISSED, receipts, or editable metadata.

## Review evidence (2026-09-24)

- Node and Edge browser suite: 37 passed; the UX-2 case checks three dated jobs, status filtering, workflow labels, raw History IDs and drawer focus, one request per initial view, and 320/375px layouts.
- Maven `clean verify` on Java 24: 133 passed, 0 failures; the packaged Spring Boot JAR was built.
- Packaged live Edge acceptance: Today and History tests both passed against five currently installed Dashboard tasks and an isolated Dashboard SQLite database. The live inventory has no dated check task, so dated folding is verified by the browser fixture rather than a current live task.
- Scheduler XML inventory: all seven Dashboard-related definitions matched before and after. Across 231 installed tasks, one Windows `RefreshCache` definition changed during the run (`EXTERNAL_DRIFT_OBSERVED`); the cause was not established and no Scheduled Task was run or modified by this stage.
