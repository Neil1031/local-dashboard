# Local Dashboard — Product Design Space

Status: **Product Design Space approved; Release 1A-1 and 43871 integrated, installed acceptance closed; Release 1B merged at 654fc84; Release 2A reports Signals merged at 479a767; Release 2B SEC Transactions partial passed Manager Review and merged at 4acd568; installed state is established separately by deployment evidence**. Original design baseline: `dcfbd033110aca0d3f2250c4f7fd0faa560bb863`; Projects pilot baseline: `085757affe2c2dc0c1de45663395e418ad702e3e`. The static prototype remains **SAMPLE / PROTOTYPE DATA**. See [Release 1B evidence](STAGE-RELEASE-1B.md), [Release 2A evidence](STAGE-RELEASE-2A.md) and [installed acceptance](INSTALLED-DEPLOYMENT-ACCEPTANCE.md).

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
| Automations · Today | Workflow and grouped jobs; status, last/next run, short Runner indicator, legacy folding. | Existing Today UI and `/api/jobs`. | DONE (Release 1B relocation merged at 654fc84; installed state established separately) |
| Automations · History | Observed executions and seven-day grid; preserve source identity and failed execution. 7D exists; 30D/90D are design only and need bounded pagination/query. | `/api/history`, SQLite observed history, existing UI. | DONE (30D/90D NOT_STARTED) |
| Automations · Schedule | Job detail: current version, first/last observed, timezone, enabled state, exact triggers, previous versions, observation gaps. A gap is uncertainty, never evidence of a missed run. | Stage A SQLite schedule snapshots exist without a public UI/API. | BACKEND_READY |
| Automations · Evidence | Execution row links Scheduler observation, Runner receipt/coverage and candidate occurrence. Show `CORRELATED`, `AMBIGUOUS`, `UNSUPPORTED` and reason; retain unmatched records. | Runner UI exists; Stage B correlation is shadow only and has no production endpoint. | BACKEND_READY (correlation visualization DESIGNED) |
| US Stocks · Signals | Roadmap includes card/table toggle and broader filters. Release 2A implements reports-only cards, exact ticker, bounded pagination/detail, separate report/event dates, scores marked Imported AI report, listed buyers/nullable amount, discovery basis, quality flags and sanitized provenance. | Fixed read-only Insider `list-signals --source reports` v1 adapter; real-source smoke 22 records. SEC partial is implemented by Release 2B; performance/aggregation remain separate gates. | PARTIAL |
| US Stocks · SEC Transactions | Release 2B separate cards/detail, exact ticker/pagination, all owners, code/type, nullable shares/insider execution price/amount/ownership/10b5-1, candidate/review flags, footnotes, distinct dates and sanitized provenance. | Fixed read-only `list-signals --source sec` v1. Partial facts only: P/candidate not certified, 4/A not reconciled, source-position identity not immutable business identity; no collapse or report joins. | PARTIAL |
| US Stocks · Ticker Detail | Release 2C required exact ticker presents Reports Signals and SEC Transactions in separate sections, reusing cards/details with source-specific states, pagination, dates and provenance. No cross-source linkage, join, dedupe or combined score. | Dashboard-owned aggregate of the two existing read-only operations; merged main 44823ab and cumulatively deployed at bce84c4. Ticker Detail has no Performance section; the independent Release 3A Performance v1 page is approved/PARTIAL, merged at d69ff5ab and production deployed. | PARTIAL |
| TW Stocks · Daily Scan | Run result, covered date, classification, anomaly measures, source coverage, warning/partial state; summary is distinct from per-ticker findings. | Current TW Stocks v1 uses Taiwan Volume Watch source-owned tw-daily-accumulation-v1 through fixed TaiwanStocksAdapter; merged/deployed at bce84c4. Historical AIStockHunter export proposal remains unimplemented. | PARTIAL |
| TW Stocks · Accumulation | Scope/start date, completed/incomplete days, source-level statuses and observed signals. Show `PARTIAL`, `WARMING_UP`, unknown explicitly. | Deployed TW Stocks v1 reads saved source scope/readiness/baseline/mapping/completeness and independent Weekly Check; preserves PARTIAL/WARMING_UP/UNKNOWN/null, no private DB/journal reads or maturity calculation. | PARTIAL |
| TW Stocks · Candidates | Only candidates the source explicitly labels; show score provenance and eligibility. Do not treat legacy `candidate_signal` as current daily accumulation output. | Deployed TW Stocks v1 consumes only source-saved observation candidates/watchlist; no current master/private joins, anomaly score is not an investment score. Broader Taiwan roadmap remains unfinished. | PARTIAL |
| Performance | Horizon tabs 1D/1W/1M/3M/6M, summary by score bucket/source and signal detail timeline. Win rate/average return when observed; upside, adverse, drawdown and time-to metrics only with qualifying source records. Pending horizon is —, not 0%. | Approved first current active Insider AI-report consumer via fixed read-performance-summary/list-performance/get-performance v1, source main231638f2. Implementation96b15c8 approved; merged main d69ff5ab and production deployed. Stored states/missingSessions/null/zero/snapshot presence remain separate; Taiwan/SEC/PIT/portfolio/broader analytics incomplete. Old performance-summary remains forbidden. | PARTIAL |
| Reports | Release 2D All/US Insider: exact-date list, supported counts/warnings/hash, faithful safe DOM Markdown detail and independent revision metadata paging. All has independent US Insider/TW Daily/TW Weekly sections; TW Reports v1 implementation93ae8859 approved, integrated/deployed at main7a2f9c45. | Insider fixed list-reports/get-report v1 on cdacf865 remains; Taiwan fixed tw-reports-v1 LIST/DETAIL via TaiwanReportsAdapter/TwReportsProjection uses distinct reports-cli-path and shared Taiwan Semaphore2. Current US retained counts and body/hash history only; current may be outside page or MISSING; no historical ticker/score membership, PIT or semantic diff. 2D merged main40f5aec and cumulatively deployed at bce84c4. | PARTIAL |
| Data & Evidence | Taiwan first evidence slice: independent source cards, Daily snapshot/readiness/completeness/responsibility, Weekly Check and Daily/Weekly LIST. Exact identities/times/warnings, null vs zero; no aggregate score. | Implementation04f67e9c approved; existing adapters/APIs/parsers reused. Schedule Versions/Correlation/Runner aggregation remain incomplete; integration/deployment pending authorized gates. | PARTIAL |
| Settings | Existing display name, market, description, order, hidden, dependencies and reset. Future source path, availability, schema/version and read-only state; refresh/default view/appearance are preferences, not pipeline triggers. | Job display settings DONE. New preference/config UI is design only. | DONE / DESIGNED |

Merged Release 1B implements only the operations slice: full collected-job counts, future Scheduler next runs, recent seven-day observed executions and Runner coverage. Release 2A reports Signals is merged; Release 2B adds a separate SEC Transactions partial slice; Reports retains Release 2D US Insider and adds approved TW Daily/TW Weekly independent consumers; TW Stocks v1 is a deployed PARTIAL source-owned Taiwan consumer; Performance v1 is approved PARTIAL merged at d69ff5ab and production deployed; Taiwan Data & Evidence first slice is approved PARTIAL; broader aggregation remains incomplete. The following wireframe is the broader roadmap.

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
             ├ InsiderTrackerSource (fixed Signals/SEC/Reports and Performance v1 reads)
             ├ TaiwanStocksAdapter / TaiwanReportsAdapter (source-owned tw-daily-accumulation-v1 / tw-reports-v1; shared Semaphore2)
             └ AIStockHunterSource (historical future export proposal, not current TW source)
```

The UI never opens external SQLite or interprets raw Scheduler CIM/Markdown. Controllers translate HTTP and compose responses; source-specific parsing/SQL belongs inside adapters. Adapter boundaries include timeout, schema/version negotiation, provenance, partial result and missing-source behavior. Only trusted full Scheduler path and trusted Runner mapping may relate a native Runner job ID to canonical Dashboard job ID. Keep raw IDs in evidence, never compare namespaces directly. A source adapter must not initialize/migrate external databases or create journal sidecars. External reads are bounded, read-only and never launch pipelines.

For Insider Tracker, **choose Option A, its existing `list-signals` normalized JSON CLI**, for the first signals slice: it is already versioned, query-only, `mode=ro`, paginated and decouples Dashboard from many tables. Invoke with fixed arguments, safe path handling, process timeout and captured JSON; do not use a shell. Current implemented reads use no-store and no adapter cache; no polling or implicit reread of completed Performance views. Windows process startup and Python deployment are costs to measure. **Option B**, a Dashboard read-only SQLite adapter, offers lower query latency but couples to migrations and must enforce `mode=ro`/`query_only`/no sidecars. Use it only for fields absent from v1 after a separate source contract decision. **Option C**, a future local API, has the cleanest runtime boundary but adds a service/deployment; defer. Existing `performance-summary` is not safe to call on the formal DB because its CLI opens a normal connection and calls `initialize`; Release 3A now consumes its separately approved source-owned Performance v1 read-only CLI; retain the old writer command prohibition.

For AIStockHunter, existing DB tables and JSON/Markdown run artifacts are implementation outputs, not a stable cross-project contract. A file adapter avoids DB coupling but `latest` pointers and report structures need atomic/versioned semantics. Direct SQLite is fast but tightly tied to private schemas and mode/sidecar policy. That historical inventory did not establish a CLI export. Current TW Stocks v1 instead consumes the separately approved Taiwan Volume Watch tw-daily-accumulation-v1; it does not implement this old AIStockHunter proposal. **Recommend a new read-only, versioned normalized JSON export in the source project as a future separate stage**; Dashboard can consume that bounded output through an adapter. No source project change is in this stage.

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

Manager Review can verify: revised nine-page sitemap and Projects pilot with six detail views, source-owned Project Design model, actual source-contract inventory, normalized models in `DASHBOARD-DATA-CONTRACTS.md`, architecture, shared states/components, completion matrix, roadmap, refactor thresholds, static desktop/mobile/keyboard prototype, unchanged production entrypoints and clean Git state. The original design stage stopped at design review. Release 1B has completed Git closeout. Release 2A is merged at 479a767. Release 2B is merged at 4acd568; cumulative deployment closed at e0aa592 under owner final no-post-install-QA policy. Release 2C is merged main44823ab, Release 2D main40f5aec and TW Stocks v1 mainbce84c4; all are included in the authorized bce84c4 cumulative deployment. Performance v1 implementation96b15c8 is Manager approved, PARTIAL, merged main d69ff5ab and production deployed; see STAGE-RELEASE-3A-PERFORMANCE.md. Historical development/deployment evidence remains separate.

TW Reports consolidated Design Sync preserves all33 IDs/statuses, product-tw/product-reports PARTIAL. Daily/Weekly independent authorities, READY/EMPTY exit0 and PARTIAL/UNAVAILABLE/ERROR exit2, saved Weekly FAILED business status, null/UNKNOWN/WARMING_UP/anomaly-score semantics and no combined timeline/total/PIT remain explicit. Existing captures only; formal reads0. History/Range consumer is approved; Taiwan Performance, Data & Evidence and broader research analytics remain separately gated. [Current TW Reports architecture/contract](DASHBOARD-DATA-CONTRACTS.md#tw-reports-v1-implemented-consumer); [approved Stage evidence](STAGE-TW-REPORTS-V1.md).


## Taiwan Data & Evidence v1 and next Stage order

Taiwan Data & Evidence v1 實作 `04f67e9c41085b7ff196b50eac1ca331251cb2d7`、Design Sync `243870a5`、main `c269fe720678a045bef9bf328df84bd4dd32b211` 整合與前次正式部署均已完成；此為既有 closeout 結果，不是本次新增 formal observation或自然使用驗收。只將 `product-evidence` DESIGNED→PARTIAL，33 stable IDs 與其他32 statuses 保留；product-tw／product-reports／product-performance 仍 PARTIAL。Taiwan-only 第一切片不是整個跨來源 Evidence 完成，Schedule Versions／Correlation／Runner aggregation 仍未接入。

Taiwan Volume Watch source-owned `tw-daily-accumulation-v1`／`tw-reports-v1` → 既有 `TaiwanStocksAdapter`／`TwStocksProjection` 與 `TaiwanReportsAdapter`／`TwReportsProjection` → 既有 normalized Dashboard APIs → `ui/evidence.mjs`（重用 `readTwStocks`／`readTwReports`）→ Data & Evidence Taiwan v1。沒有新 source contract／backend adapter／projection，不直讀 Taiwan SQLite／file／private schema；沒有新的 Dashboard persistence／backend cache，沒有 report DETAIL fetch、aggregate health／trust／investment score 或 cross-source atomic／PIT interpretation。

Wave 1：`GET /api/tw/stocks`；只有 fetch＋JSON body 實際 settled 後，Wave 2 才並行讀 `GET /api/reports/tw?type=daily&limit=1&offset=0` 與 `GET /api/reports/tw?type=weekly&limit=1&offset=0`。Evidence-owned unresolved Taiwan browser request 最大2；single drain loop、generation matching 與 newest refresh coalescing，Refresh 立即作廢舊 presentation，等舊 reads 實際 drain 再處理 newest generation（即使忽略 abort）。離頁阻止 stale render／pending cache，已完成 view 返回可重用 browser completed cache；無 polling。此 browser-local presentation cache 不是新增 backend persistence/cache；AbortController 不保證 server／source child process universal cancellation，也不宣稱跨其他頁面／clients 的全域 budget。

COHERENT != SUCCESS；PARTIAL != SUCCESS；UNKNOWN != NO；null != 0；WARMING_UP＋0 candidates != no anomaly；candidate != buy；source anomaly score != investment score。Weekly FAILED 是保存的週檢業務狀態，不抹除 Daily availability。latest attempt != latest finalized；Daily observation identity != Daily report identity != Weekly report identity。bounded LIST first item 不代表 complete historical latest，除非 source contract 明確建立該語意。三張來源卡片保留獨立 dataState／contract／observedAt／generatedAt／selected ID／warnings；envelope 與 item warnings／times 分開。Daily query／snapshot／scope、attempt／finalized、completeness／readiness／responsibility 與 Weekly Check 分開，missing facts 不補成零；LIST problemCount 不代替完整 DETAIL，細節由 Reports 頁負責。

本輪沒有新的 formal Taiwan compatibility read。只可重用 frozen normalized captures：Stocks observed `2026-10-02T17:04:23.118012500Z`、selected `2026-10-02`、run `e801318d154a46c88f03858a9b60044c`、PARTIAL；Daily LIST observed `2026-10-03T12:17:45.674272100Z`、READY、`tw-daily:2026-10-02:f93460ffdd3d4ec6a60ce1244ce30d0f`；Weekly LIST observed `2026-10-03T12:17:46.080439900Z`、READY／saved FAILED、`tw-weekly:2026-10-02:510f722b6bcd40c09cee9393594be39e`。Replay 仍標為 SAVED_TEST_EVIDENCE，原始 bytes／時間／狀態／ID 不改，不稱新 observations 或 installed acceptance。

Localization / i18n v1 已完成實作核准、Design Sync、main95f025dc1c0675e056cc78db1061c25078b66f6e整合及部署，最後STOPPED；不將安裝身分當自然使用驗收。本次Taiwan History / Range consumer已核准，下一Taiwan Performance NOT STARTED；33 IDs／status counts不改。

This is a roadmap decision, not authorization to start a new Stage or a fake completed localization feature. [Evidence Stage](STAGE-TW-DATA-EVIDENCE-V1.md).

## Localization / i18n v1 as-built presentation contract

Localization / i18n v1 實作 `f960723ddcdeec925ef2e8b40035cd28ac74bae1` 已獲 Manager 核准，Design Sync、main `95f025dc1c0675e056cc78db1061c25078b66f6e` 整合與完整套件部署均已完成，部署後 STOPPED。既有 operational packet／Owner Doc 保存安裝身分。Localization 不新增 feature ID；33 stable IDs／status counts 保持 DONE 19、PARTIAL 8、BACKEND_READY 3、NOT_STARTED 2、BLOCKED 1，其餘 0。本次 Taiwan History / Range consumer e52a4be 已核准；下一 Stage Taiwan Performance NOT STARTED。

共享 flat resource flow 為 `ui/i18n.mjs` → `ui/locale-zh-TW.mjs`／`ui/locale-en.mjs` → 九個既有 owner-facing UI 區域。i18n原切片每語系1,066keys；本次History新增26keys後現行1,092keys，exact key／named placeholder parity；預設 zh-TW，替代 en。偏好僅存 browser localStorage `local-dashboard.locale.v1`；缺值／無效值／read failure 使用 in-memory zh-TW，write failure 安全退回 zh-TW。沒有 backend locale state、application.yml locale setting、DB locale state或外部翻譯服務。

Dashboard-owned chrome、固定表單／提示／狀態／aria-label／placeholder 使用共享文字層；source-owned report Markdown、company/security names、AI free-text、configured job/display metadata、canonical Project Design body、IDs、hashes、timestamps與provenance保留原值。Known machine codes 可顯示在地化解釋並保留 exact raw code；unknown future codes 仍 raw。翻譯只用 textContent／allowlisted text attributes，不插入 translation HTML。

語系切換只更新 held presentation，保留當前 page／subpage、filters、pagination、open dialogs／details、focus及已載入資料；不 navigate、reload、show/load/refresh、refetch、restart server或改 query／business semantics。Project Design parser／來源內容與 source identity、null／UNKNOWN／PARTIAL等語意保持不變。

部署後每個新增 Dashboard-owned owner-facing UI string 必須使用 common i18n layer；新 key 在同一修改加入 zh-TW／en及相同 named placeholders，UI 修改執行 parity／coverage及相關 browser regression。持久規則見 root `AGENTS.md`。歷史參考 `chore/i18n-seed` 保持 `15e9c5c807ffc11e9039c6c60a68c4373f350a58`；不 merge／rebase／cherry-pick，production canonical是兩份 reviewed `ui/locale-*.mjs`，不是 seed。


## Taiwan History / Range v1 implemented consumer

Taiwan History / Range consumer v1 已獲 Manager 核准 exact e52a4beae0ef20662e7b115a8e65d0c6aa6c25dd。來源 tw-history-range-v1 已於 Taiwan canonical main13e9f313a1754576e8b5d509e54e530b8764ac6b 完成115-asset overlay部署；本次只消費版本化契約，不解讀 private SQLite／source files。現有 TW Stocks 新增目前觀察／歷史・範圍子頁，不增主要入口。no-store GET /api/tw/history 只收 startDate／endDate／limit／offset；strict real dates、inclusive<=366days、limit1..50(default20)、offset0..10000(default0)，unknown／duplicate／empty params HTTP400 before invocation。

TaiwanHistoryAdapter → TwHistoryProjection → TwHistoryController → ui/tw-history.mjs，explicit dashboard.sources.taiwan.history-cli-path 指向固定 export_tw_history.py LIST；與 Stocks／Reports 共用 Taiwan Semaphore2。source ordering及同日每個RunID保留，savedStatus與dataState分開，null!=0、UNKNOWN!=NO、WARMING_UP+0不是無異常。保留TWSE／TPEX readiness/completeness/warnings與exactDaily reportId，不自動DETAIL。page.total=null、hasMore／nextOffset原樣、offset ceiling禁用不可呼叫Next；不補gap-date，不推missing／holiday／MISSED／no anomaly，不聲稱跨頁atomic／PIT。

History首次入頁才讀，Refresh／Previous／Next只指定一頁、無polling；latestmatching response wins，離開阻擋stale。新增26shared zh-TW／en keys，現行每locale1,092keys與placeholder parity；locale只held-text更新，range／offset／data／focus不變、不refetch。正式來源讀取0，僅原Stage5frozen2654bytes/hash38c0ad31…精確limit2/offset0重播，原時間與兩筆同日身分保持；不是新formal／installed acceptance。33IDs／status counts19DONE／8PARTIAL／3BACKEND_READY／2NOT_STARTED／1BLOCKED保持，product-tw仍PARTIAL。Taiwan Performance NOT STARTED，broader analytics／portfolio／trading／backtest不在本次。

本次 consolidated Design Sync完成；接續已授權 explicit no-ff Git integration與完整Dashboard package部署。Git文件於DS snapshot不預填未知merge／installedSHA；完成後exactimage／backup／configdelta history-cli-path／STOPPED身分由operationalpacket與既有Owner Doc確認。安裝後不啟動或QA。詳見[History Stage](STAGE-TW-HISTORY-RANGE-CONSUMER-V1.md)。
