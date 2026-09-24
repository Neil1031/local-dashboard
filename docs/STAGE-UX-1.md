# Stage UX-1: Job metadata and grouping

## Plan and gates

| Stage | Scope | Dependency | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| 0 | Sync `main`, check clean tree, create `implement/dashboard-ux-metadata` | Remote access | Branch starts from current `origin/main` | Verify base SHA and status |
| 1 | Versioned UI metadata and safe fallback | Existing scheduler job names | Known jobs resolve; unknown jobs retain raw names | Test exact and dated names, IDs unchanged |
| 2 | Today / History grouping, drawer details, legacy switch | Stage 1 | Market/order, dependencies, reverse links, hidden defaults work | Browser tests for filters, drawer, history, XSS and request count |
| 3 | Regression and publication | Stages 1–2 | Node, Playwright and Maven pass; commit and push | Inspect diff, remote SHA and clean status |

## Architecture and schema

`dashboard.mjs` contains `jobMetadata`, a version-controlled, static map keyed by the raw Windows task name. No metadata is written to Task Scheduler or the database. The API response and collector are unchanged. Multiple tasks with the same raw name in different Scheduler folders share display metadata but keep their distinct original IDs and paths.

Each entry has `displayName`, `market` (`台股`, `美股`, or `其他`), Chinese `description`, numeric `order`, `dependsOn`, `legacy`, and `hidden`. `dependsOn` entries contain a `task` plus a `kind`:

- `data`: existing data must be present; optional `note` states the actual requirement. It does not imply the upstream task must run immediately before this task.
- `orderOnly`: display sequence only, not a hard execution dependency.
- `external`: prerequisite outside the Dashboard job list.

The `AIStockHunter-Accumulation-Check-*` metadata matches only names with a `YYYY-MM-DD` suffix. A nonmatching or unknown task uses its raw name, appears under `其他`, and remains visible. Known `hidden` legacy jobs are excluded from Today and History rows until the user enables **顯示舊版／停用排程**. Summary counts continue to describe the full scheduler snapshot. The switch affects only the local view and never enables or disables a schedule.

Jobs are grouped by `台股`, `美股`, then `其他`, and sorted by `order` within a market. Jobs with no metadata retain their incoming order. The drawer derives downstream tasks from `dependsOn` among the current view's job inventory. All metadata and raw API text are inserted with `textContent`, so task names and descriptions are not interpreted as HTML.

## Default jobs

| Raw name | Market | Order | Dependency | Hidden |
| --- | --- | ---: | --- | --- |
| `AIStockHunter-UnexplainedVolume-Daily` | 台股 | 10 | None | No |
| `AIStockHunter-Accumulation-Check-*` | 台股 | 20 | Date's Daily data | No |
| `AIStockHunter-Accumulation-Weekly-Check` | 台股 | 30 | This week's Daily data | No |
| `AIStockHunter-UnexplainedVolume-HealthCheck` | 台股 | 90 | None | Yes |
| `AIStockHunter-UnexplainedVolume-V2-Weekly` | 台股 | 100 | None | Yes |
| `InsiderTracker-Market` | 美股 | 10 | None | No |
| `InsiderTracker-SyncImport` | 美股 | 20 | External AI report produced and committed to Git | No |
| `InsiderTracker-SEC` | 美股 | 30 | SyncImport display order only; shared pipeline lock | No |

This stage does not modify the runner, MISSED logic, Task Scheduler configuration, or raw Scheduler descriptions. Date-task folding and dependency diagrams remain UX-2; editable metadata settings remain UX-3.
