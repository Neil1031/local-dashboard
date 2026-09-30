# Local Dashboard — Product Design Space

Status: **Product Design Space approved; Release 1A-1 and 43871 integrated, installed acceptance closed; Release 1B Product Shell / operations Overview implemented in development, awaiting management review; not merged or deployed**. Original design baseline: `dcfbd033110aca0d3f2250c4f7fd0faa560bb863`; Projects pilot baseline: `085757affe2c2dc0c1de45663395e418ad702e3e`. The static prototype remains **SAMPLE / PROTOTYPE DATA**; the Release 1B operations UI uses existing Dashboard APIs. See [Release 1B evidence](STAGE-RELEASE-1B.md) and [installed acceptance](INSTALLED-DEPLOYMENT-ACCEPTANCE.md).

## Product definition and decisions

Local Dashboard is the local control center for investment research data and automation. It answers three separate questions: **Operations** — is the system working; **Research Data** — what was collected; **Evidence** — why is a status shown. It observes and diagnoses. It does not run pipelines, trade, alter source data, or infer an execution from missing evidence.

The approved eight-page direction is extended to **nine primary pages** for the Projects pilot. `Automations` owns the existing Today/History experience; `Data & Evidence` is the cross-source diagnostic destination. Schedule and execution evidence are also reachable inside Automations, where a user investigates a job. That deliberate overlap is one shared view/model, not two independent contracts.

```text
Overview
Projects          Landing · project detail: Overview · Features · Architecture · Problems · Changes · Remaining
Automations       Today · History · Schedule · Evidence
US Stocks         Signals · SEC Transactions · Ticker Detail
TW Stocks         Daily Scan · Accumulation · Candidates
Performance       Summary · Signal Detail
Reports           All · US Insider · TW Daily · TW Weekly
Data & Evidence   Data Sources · Schedule Versions · Correlation · Runner
Settings          Job Display · Data Sources · Refresh · Default View · Appearance
```

At desktop width, use a persistent side navigation, page header, compact summary cards, filter bar and a detail panel. At 375/320 px, use a compact top header and horizontally scrollable primary navigation; content stacks, tables scroll within their own region, and detail is a full-width panel. A persistent data-mode label distinguishes prototype samples from live production data.

### Projects — one design source per repository

Every managed project owns **its own** `docs/PROJECT-DESIGN.md` in its own repository, with a stable `project_id`, parseable versioned metadata, feature status matrix, major issues, changes and remaining work. That file is the project's **Single Project Design Source of Truth**. Dashboard is a **viewer / aggregator only**: it must not separately maintain another project status list or infer completion percentages. An absent, unreadable, stale or unsupported source stays explicitly unavailable; it must not become zero progress or a fabricated status.

The static pilot uses only Local Dashboard's [PROJECT-DESIGN.md](PROJECT-DESIGN.md). `design/prototype/generate-project-design.mjs` derives its committed browser sample from that document; `--check` rejects drift. Status counts on the card and Features view are calculated from the same parsed feature rows. Release 1A-1 copies the sole canonical Markdown into one fixed build resource, parsed in the browser using the same v1 parser as the generator. It displays source/version/read time/raw-byte digest and historical baseline explicitly as a build snapshot, not a live Git reader. Full detail views and cross-project aggregation remain later work; the static pilot remains SAMPLE.

Future onboarding requires at least a stable ID and `docs/PROJECT-DESIGN.md` in the **source repository**. Candidate IDs include `local-dashboard`, `insider-signal-tracker` and `ai-stock-hunter`; only the first is onboarded in this pilot. Onboarding the others requires their own design/review stage and does not authorize writing to those repositories here. Projects detail has Overview, Features, Architecture, Problems, Changes and Remaining views; Architecture and Changes need legible visual treatments, and every feature can expose purpose, mechanism, limitation and remaining work.

## Screen specification

The status wording in this screen specification records the approved **page design gate**, including mixed backend/data/UI readiness at that time. It is not a second maintained project feature inventory. For current per-feature status and counts, read [PROJECT-DESIGN.md](PROJECT-DESIGN.md).

| Page | Main question and composition | Current basis / gap | Status |
| --- | --- | --- | --- |
| Overview | In five seconds: automation, US/TW freshness and new findings, attention, next run. Pipeline timeline, today's US/TW findings, source freshness, recent reports. Each section names its source and observation time. | Existing jobs/history/Runner can fill operations; cross-project normalized feeds and source-health aggregation need backend. Counts cannot be inferred from Scheduler success. | DESIGNED |
| Projects | What is each project for, what is done, what changed, and what remains? Landing uses status counts without a completion percentage; detail has six views. | Static pilot remains SAMPLE; Release 1A-1 production entry reads only this project's canonical build snapshot, with features/counts/error/retry. No other project onboarding. | PARTIAL (minimal slice reviewed / merged; installed acceptance closed); full Projects/aggregation pending |
| Automations · Today | Workflow and grouped jobs; status, last/next run, short Runner indicator, legacy folding. | Existing Today UI and `/api/jobs`. | DONE (Release 1B relocation implemented; stage review pending) |
| Automations · History | Observed executions and seven-day grid; preserve source identity and failed execution. 7D exists; 30D/90D are design only and need bounded pagination/query. | `/api/history`, SQLite observed history, existing UI. | DONE (30D/90D NOT_STARTED) |
| Automations · Schedule | Job detail: current version, first/last observed, timezone, enabled state, exact triggers, previous versions, observation gaps. A gap is uncertainty, never evidence of a missed run. | Stage A SQLite schedule snapshots exist without a public UI/API. | BACKEND_READY |
| Automations · Evidence | Execution row links Scheduler observation, Runner receipt/coverage and candidate occurrence. Show `CORRELATED`, `AMBIGUOUS`, `UNSUPPORTED` and reason; retain unmatched records. | Runner UI exists; Stage B correlation is shadow only and has no production endpoint. | BACKEND_READY (correlation visualization DESIGNED) |
| US Stocks · Signals | Card/table toggle, source/status filters, search, ticker, report/event date, scores and origin, buyers/amount only when source supplies them, discovered time/basis, warnings, performance or —. | Insider Tracker `list-signals` v1 is read-only JSON; aggregation/detail and performance joins need an adapter. | DATA_READY / DESIGNED |
| US Stocks · SEC Transactions | Issuer, insider, code/type, shares, price, amount, filing date/form, review flags; detail shows transaction, filing, owner and source metadata. Keep amendments and unresolved 4/4A reconciliation visible. | Source SQLite records exist; normalized signal feed is not a transaction-list contract. | DATA_READY / DESIGNED |
| US Stocks · Ticker Detail | One ticker's signals, transactions, report references and performance, with separate dates and provenance. No cross-source identity inference. | Needs read-only aggregate API and pagination. | DESIGNED |
| TW Stocks · Daily Scan | Run result, covered date, classification, anomaly measures, source coverage, warning/partial state; summary is distinct from per-ticker findings. | AIStockHunter DB/run artifacts exist; no stable Dashboard-facing contract found. | DATA_READY / DESIGNED |
| TW Stocks · Accumulation | Scope/start date, completed/incomplete days, source-level statuses and observed signals. Show `PARTIAL`, `WARMING_UP`, unknown explicitly. | Daily accumulation results/sources and weekly-check output exist. | DATA_READY / DESIGNED |
| TW Stocks · Candidates | Only candidates the source explicitly labels; show score provenance and eligibility. Do not treat legacy `candidate_signal` as current daily accumulation output. | Existing `unexplained_volume_signal`; contract and semantics must be exported. | DATA_READY / DESIGNED |
| Performance | Horizon tabs 1D/1W/1M/3M/6M, summary by score bucket/source and signal detail timeline. Win rate/average return when observed; upside, adverse, drawdown and time-to metrics only with qualifying source records. Pending horizon is —, not 0%. | `signal_performance` and snapshots exist. Current `performance-summary` initializes DB; it is not an approved read-only Dashboard interface. | DATA_READY / DESIGNED |
| Reports | All/US Insider/TW Daily/TW Weekly; date, type, count when known, import state, warnings, revision; detail rendered as sanitized Markdown, metadata and revision history. Show score/ticker diff only after a source-supported comparison. | Insider `ai_report`/`report_revision`/Markdown and AIStockHunter formal outputs exist; read-only report contracts missing. | DATA_READY / DESIGNED |
| Data & Evidence | Source health, schedule versions, correlation and Runner panels; link back to the affected job/data view. State exact observation/coverage times and version. | Runner diagnostics DONE; schedule/correlation repositories BACKEND_READY; external source health DESIGNED. | DESIGNED |
| Settings | Existing display name, market, description, order, hidden, dependencies and reset. Future source path, availability, schema/version and read-only state; refresh/default view/appearance are preferences, not pipeline triggers. | Job display settings DONE. New preference/config UI is design only. | DONE / DESIGNED |

Release 1B implements only the operations slice: full collected-job counts, future Scheduler next runs, recent seven-day observed executions and Runner coverage. Five external-data destinations remain DESIGNED / not connected. The following wireframe is the broader roadmap.

### Overview wireframe

```text
Local Dashboard                            Last observed / refresh …
[Automation] [US Signals] [TW Signals] [Attention]
Today's pipeline: Market data → SyncImport → SEC → TW Scan → next TW Scan
Today's findings: US | TW                  [source + observed-at on each]
Data freshness: SEC | Market prices | AI Reports | TW scan
Recent reports: type | date | import/warning/revision
```

The first card uses observed job results, not promised data quality. Signal cards require source feed observations; until integrated they show `UNAVAILABLE` with an explanation, rather than zero. The attention count includes explicit warnings/errors, and cannot silently include a speculative `MISSED`.

### Screen behavior and empty/error states

All pages share `LOADING`, `READY`, `EMPTY`, `PARTIAL`, `STALE`, `UNAVAILABLE`, `ERROR`. `EMPTY` means a successful complete query returned no records. `PARTIAL` means records exist but coverage or parsing is incomplete. `STALE` requires an explicit expected-refresh policy and a known clock; an old timestamp alone is not an error. `UNAVAILABLE` includes missing path, version mismatch or source permission. `ERROR` includes a failed read. Automation job status (`READY`, `RUNNING`, `FAILED`, `DISABLED`, `UNKNOWN`, historical `MISSED`) is a different field and never replaces data state. Current production must not generate new `MISSED`.

Every list gets a common search/filter row, result count, loading/empty/error treatment, source badges and stable keyboard focus. Detail panels have an accessible heading, close control and Escape handling. Tables use meaningful headers; mobile overflow stays within the table container. A shared freshness component shows `source`, `lastObservedAt`, `expectedRefresh`, `freshnessState`, `warning`, and the distinction between successful task execution and complete data.

## Current completion inventory

The **maintained feature status matrix** now lives in [PROJECT-DESIGN.md](PROJECT-DESIGN.md). Its feature IDs, one-status-per-feature vocabulary, remaining work and evidence links are the source for the Projects pilot's counts and expanded feature cards. This Design Space keeps the approved screen direction and architecture decisions; it no longer maintains a competing completion list. Historical Stage documents remain review evidence, and [As-Built](DASHBOARD-AS-BUILT-ARCHITECTURE.md) explains the currently merged runtime.

## Architecture and integration decisions

```text
Plain JS views → Dashboard API / versioned normalized responses
                         │
             Dashboard service + adapters
             ├ SchedulerSource (existing collector/repositories)
             ├ RunnerSource (existing receipts/coverage)
             ├ InsiderTrackerSource (read-only normalized JSON first)
             └ AIStockHunterSource (future read-only normalized export)
```

The UI never opens external SQLite or interprets raw Scheduler CIM/Markdown. Controllers translate HTTP and compose responses; source-specific parsing/SQL belongs inside adapters. Adapter boundaries include timeout, schema/version negotiation, provenance, partial result and missing-source behavior. Only trusted full Scheduler path and trusted Runner mapping may relate a native Runner job ID to canonical Dashboard job ID. Keep raw IDs in evidence, never compare namespaces directly. A source adapter must not initialize/migrate external databases or create journal sidecars. External reads are bounded, read-only and never launch pipelines.

For Insider Tracker, **choose Option A, its existing `list-signals` normalized JSON CLI**, for the first signals slice: it is already versioned, query-only, `mode=ro`, paginated and decouples Dashboard from many tables. Invoke with fixed arguments, safe path handling, process timeout and captured JSON; do not use a shell. Cache briefly for UI latency. Windows process startup and Python deployment are costs to measure. **Option B**, a Dashboard read-only SQLite adapter, offers lower query latency but couples to migrations and must enforce `mode=ro`/`query_only`/no sidecars. Use it only for fields absent from v1 after a separate source contract decision. **Option C**, a future local API, has the cleanest runtime boundary but adds a service/deployment; defer. Existing `performance-summary` is not safe to call on the formal DB because its CLI opens a normal connection and calls `initialize`; request a read-only export/API before integration.

For AIStockHunter, existing DB tables and JSON/Markdown run artifacts are implementation outputs, not a stable cross-project contract. A file adapter avoids DB coupling but `latest` pointers and report structures need atomic/versioned semantics. Direct SQLite is fast but tightly tied to private schemas and mode/sidecar policy. A current CLI JSON export is not established by this review. **Recommend a new read-only, versioned normalized JSON export in the source project as a future separate stage**; Dashboard can consume that bounded output through an adapter. No source project change is in this stage.

### Shared UI components

`AppShell`, `PageHeader`, `PrimaryTabs`, `SummaryCard`, `MetricCard`, `DataTable`, `FilterBar`, `SearchBox`, `StatusBadge`, `WarningPanel`, `EmptyState`, `ErrorState`, `LoadingState`, `StaleState`, `DetailDrawer`, `Timeline`, `SourceBadge`, `FreshnessBadge`. Components receive normalized view models and shared state only. Keep Spring Boot, plain JS, CSS and SQLite. A framework change needs measured evidence that module splitting and shared components cannot keep the UI maintainable.

### Security and trust

External integrations are observation only. No source DB writes, Git changes, Scheduler changes, task execution, shell command runner, investment pipeline invocation, cloud deployment or trading. Treat Markdown as untrusted and sanitize before rendering. Paths remain local configuration, never leaked through ordinary UI error text. Filter/limit/pagination must be bounded at the API. Raw provenance stays available in diagnostics; user-facing labels are not identity keys.

## Release roadmap and gates

| Release | Deliverable | Gate before proceeding |
| --- | --- | --- |
| 1 — Product Shell | Navigation, Projects viewer after pilot review, Overview operations slice, Automations split, Stage A Schedule UI, read-only Evidence UI and Dashboard source health | Existing Today/History behavior preserved; source-owned Project Design contract; no new MISSED; keyboard/mobile/accessibility checks; API/view model contract |
| 2 — Investment Data | US signals/SEC transactions/reports and TW daily/accumulation through read-only adapters | Source contract version, provenance, partial/null behavior, formal DB read safety, data freshness evidence |
| 3 — Research Analytics | Performance, ticker detail, score analysis, report revisions | Read-only performance/report contract; observed vs pending horizons; source-supported revision comparison |
| 4 — Reliability | Availability evidence, shadow MISSED, false-positive evaluation, separate production decision | Real machine availability/catch-up provenance and representative shadow evidence; explicit Manager approval before production MISSED |
| 5 — Convenience | Tray, auto-start, updater | Packaging/rollback and security review; no implicit job execution |

Release 1 is intentionally a UI/product slice before further external backend expansion. Each release ends at its evidence gate; later releases are not authorized by this design document.

### Refactor thresholds

* Third occurrence of the same list/filter/empty/detail pattern: extract one shared JS view component before adding the third page.
* Third datasource using the same availability/version/timeout flow: extract a shared source adapter interface and conformance tests before integrating it.
* Second endpoint duplicating pagination/filter response semantics: publish one versioned envelope before a third endpoint.
* First source-specific SQL or external file parsing in a controller: move it to an adapter before merge.
* Before `dashboard.mjs` exceeds 1,200 lines **or** a new page adds 250 lines to it, split shell, API client, shared components and page modules. Existing code already warrants measuring this at Release 1 kickoff.
* If a view needs source-table names or a view-state field has conflicting meaning across two pages, stop and repair the normalized model before continuing.

## Non-goals and review gate

No brokerage/trading or automatic orders, cloud deployment, source DB writes, AI inference inside Dashboard, production MISSED without evidence, large frontend framework migration, arbitrary command runner, notification or retry/remediation in this stage. The prototype's sample data is presentation evidence only.

Manager Review can verify: revised nine-page sitemap and Projects pilot with six detail views, source-owned Project Design model, actual source-contract inventory, normalized models in `DASHBOARD-DATA-CONTRACTS.md`, architecture, shared states/components, completion matrix, roadmap, refactor thresholds, static desktop/mobile/keyboard prototype, unchanged production entrypoints and clean Git state. The original design stage stopped at design review. Release 1B is separately authorized and stops at management review without merge or deployment; its current evidence is in STAGE-RELEASE-1B.md.
