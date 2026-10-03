# Dashboard TW Reports v1 consumer integration

## Authorization / Plan

Existing `[Dashboard] Sol 實作` implements the Manager-authorized consumer Stage from Dashboard main `d69ff5ab10d637335b9bf9e0c558bd07aa267883`; Taiwan canonical contract main is `95071c2b9383a8d143dcfd107edd2d1050130462`. Worktree: `F:\AI workspace\local-dashboard-tw-reports-v1`, branch `implement/dashboard-tw-reports-v1`. The direct owner authorization is the 33-section “START DASHBOARD — TW REPORTS V1 CONSUMER INTEGRATION ONLY” attached in the existing management Work. No new Work/subagent.

Goal: replace TW Daily / TW Weekly Reports placeholders with bounded source-owned consumers, alongside unchanged US Insider Reports.

Stages / gates:

1. Backend config / shared Taiwan gate / separate adapter and projection / no-store APIs. Gate: synthetic consumed-field, process, query and Stage 2 regression tests.
2. Reports UI / independent All source sections / dedicated Taiwan dialog. Gate: synthetic browser, mobile, keyboard, safe Markdown and newest matching response tests; existing US Reports regression.
3. Full Maven clean verify, ordinary Node/browser regression, generator check and diff check. Static installed-source preflight before the sole authorized formal compatibility set.
4. Exactly one non-installed Dashboard consumer set: Daily LIST limit1/offset0, its returned exact DETAIL if present; Weekly LIST limit1/offset0, its returned exact DETAIL if present. No retries, other pages/dates, direct independent source CLI or Stage 2 exporter call. Before/after protected inventories and consumed marker accompany replayable captures.
5. Commit/push/draft PR, freeze exact candidate and clean worktree, handoff to existing management for independent review; stop.

Done when: Daily/Weekly/All are functional and bounded; valid exit2 PARTIAL survives; FAILED remains weekly business status; null/UNKNOWN/0 and source identities remain exact; safe Markdown/keyboard/mobile/races pass; US Reports and TW Stocks regressions/full gates pass; sole compatibility set and protected invariance are captured; exact candidate is pushed/clean; canonical docs/Google Docs, installed programs/config/data/tasks and next Stage remain untouched.

## Consumed architecture / contract

Taiwan source-owned `tw-reports-v1` → `TaiwanReportsAdapter` → separate `TwReportsProjection` → no-store APIs → `ui/tw-reports.mjs` coordinated by existing Reports navigation. No direct Taiwan SQLite/weekly/latest/journal read or report reconstruction in the product. `ReportProjection` and US revision semantics are not changed.

`dashboard.sources.taiwan.reports-cli-path` is explicit, default empty. The existing `cli-path` still names Stage 2 `export_tw_readonly.py`. Existing enabled/python/database/output/timeout settings are reused. No installed config delta in this Stage. `py.exe` retains fixed `-3.11`; `-B` plus the existing transport's Python bytecode environment prevents source bytecode writes.

No shell; fixed `list --type daily|weekly --limit N --offset N` / `get --report-id exact-id`. The existing Taiwan Stocks semaphore owns the shared two-slot source budget. `BoundedSourceProcess` mechanics are reused unchanged; Reports stdout 1 MiB, stderr 64 KiB, timeout 1..30 seconds. READY/EMPTY require exit0; PARTIAL/UNAVAILABLE/ERROR require exit2. JSON/version/state/exit contradictions safely fail; stderr stays private.

- `GET /api/reports/tw?type=daily|weekly&limit=20&offset=0`: limit 1..100, offset 0..10000.
- `GET /api/reports/tw/detail?reportId=<exact-source-id>`.
- Unknown/repeated/empty/malformed query values return HTTP400 `INVALID_TW_REPORTS_QUERY` before invocation. All responses are `Cache-Control: no-store`.

Public envelope: contractVersion1, sourceContractVersion `tw-reports-v1`, source `taiwan-reports`, dataState, observedAt, generatedAt, warnings, reportType, fixed provenance; list `items`/`page`, detail `report`. Source summaries and structured facts are explicit allowlists. Consumed snake_case fields normalize to camelCase; status-count enum keys retain their exact names. Unknown raw fields are not exposed. Known counts/flags/IDs/ranges/bindings are checked for contradictions without replacing unknown facts or computing business results. Saved candidate counts/totals/truncation and exported counts/truncation remain distinct. Nullable savedTruncated remains null even when counts are known. Weekly 164 saved responsibilities versus 100 exported rows requires source PARTIAL/ITEMS_TRUNCATED.

Absolute local path tokens in Markdown fail safely; ordinary “Market / readiness”, literal HTML and link/image syntax remain untrusted presentation. The existing safe renderer uses DOM text, no innerHTML/executable HTML/images/links. Structured facts are machine truth; source Markdown is presentation only.

All has three independent source sections, states and pagination. A failing/slow source does not erase the others. Daily/Weekly use a dedicated dialog without fake revision metadata. Request revisions and browser abort prevent stale presentation after tab/page/detail/leave; explicit Refresh starts a newest request, while redundant ordinary pending loads deduplicate. Browser abort does not prove source process cancellation.

## Limits / protected scope

Observations are not recommendations; candidates are not buy signals; source anomaly score is not an investment score. WARMING_UP plus 0 candidates does not mean no anomaly. SUCCESS does not mean market completeness, PARTIAL is not SUCCESS, UNKNOWN is not NO, null is not 0. Daily and Weekly are independent authorities. No atomic cross-source/PIT snapshot or complete-history claim; reports are saved evidence, not live market state.

No Data & Evidence, Taiwan history/range/Performance/recommendations/paper trading/backtests, US Ticker Detail Performance or legacy report.py integration. No source writer/provider/scanner/notification, installed start/stop, config/shortcut/Task/Runner/receipt/DB mutation, deployment, merge, Design Sync or next Stage.

Only this Stage document is added during implementation. Canonical design/contracts/As-Built/Design Space/README, generated sample and Google Docs wait for later Manager-approved Design Sync. All 33 IDs/status counts remain unchanged; product-tw/product-reports stay PARTIAL.

## Self-QA / evidence

Synthetic fixtures were produced by the actual canonical source exporter over a newly created OS TEMP database/output, validated against its closed schema; no formal data path was supplied. Six captured fixtures cover Daily/Weekly list/detail, WARMING_UP/zero/null and 164/100 responsibility truncation. Origin receipt, process/browser logs, visuals and protection/capture evidence are stored privately under `.tools/tw-reports/` and will be frozen with the final handoff packet.

Full verification and sole formal compatibility results are recorded below after execution.

## Executed results — 2026-10-03

- Targeted backend: 36 PASS / 0 failures / 0 errors / 0 skips (new Reports14, existing Stocks12 and US Reports10). Actual child processes cover exit0/2, stdout/stderr ceilings, UTF-8/JSON errors, timeout, interruption/cleanup and shared Stocks/Reports concurrency.
- Targeted frontend: 24 PASS / 0 skips, including existing US report body/hash/current revision paging and safe Markdown assertions.
- Full Maven clean verify: 273 PASS / 0 failures / 0 errors / 0 skips; real isolated Spring resource/browser checks included.
- Ordinary full Node/browser campaign: 160 total / 156 PASS / 4 existing opt-in skips / 0 failures. No new skips or weakened assertions.
- Existing generator --check: PASS, 33 features; git diff --check PASS. Canonical design and generated sample unchanged.
- 1280/375/320 browser checks cover three independent sources, bounded Daily/Weekly paging, WARMING_UP zero/null, saved FAILED, 164/100 responsibilities, safe DOM Markdown, keyboard Tab/Space/Enter/Escape/focus return, no horizontal page/dialog overflow and source/page/detail/leave/Refresh races. Six private detail screenshots captured; Daily320 and Weekly1280 were personally visually inspected.

Windows test environment: existing SysWOW64 cmd entry for the unmodified Maven wrapper, JDK25, Surefire forkCount0 with explicit test/classes classpath and bundled Node/Playwright. The ordinary concurrent Node campaign writes target evidence; the first parallel Maven clean attempt failed to delete that directory. After Node completed, serial unmodified Maven clean verify passed. No system/registry/wrapper/pom changes. Initial parser privacy regex errors were corrected and all final gates rerun before formal use. Isolated ignored test-only Python dependencies supported actual-source TEMP fixture schema validation; product/source dependency files unchanged.

### Sole formal consumer compatibility set

PASS through real non-installed Spring candidate, random loopback port, TEMP Dashboard history DB, Inspector/US source disabled, default empty Scheduler include and empty Runner config. Exclusive CREATE_NEW consumed marker prevents another set. Audited actual Reports adapter captures fixed argv, source stdout/exit and normalized Dashboard HTTP responses. Four source invocations only; no retries, extra page/date, direct independent CLI, Stage 2 exporter, browser autofetch, provider/scanner/writer/notification or installed start/stop. Candidate PID alone was stopped after capture.

| Operation | Preserved dataState | Source exit | Dashboard response SHA256 | Raw source stdout SHA256 |
|---|---|---|---|---|
| daily-list | READY | 0 | a111cee89c2d0a1249d3beda07609ebd3f7e6cfa1a532087fc102ca6acb4fb63 | 22e6f7fbc0d1cb9534b271706054d2767e9fb3b76fb44f096b0ed13606c23d0d |
| daily-detail | PARTIAL | 2 | 1582258600c939b67bb983e5caa555ce4315c98f56354f9b8b9ae25c366b5693 | 5d7b93c31b2c9d14d11530f3b2cdfdc5cbcc6d0cbd688bd15092c4af14bd88e2 |
| weekly-list | READY | 0 | 41074790ccb1fcc4dfa19b95a28ec94a35719f04a255541b2d95e77031d33f90 | 935d5791def65e7892dce704af123424bdbef61104084417d37eb56d86f5bc29 |
| weekly-detail | PARTIAL | 2 | 16ac0f38ba9927fa012f840f378e1f9f034341cfeea5d95dd45e123ee1f7c83f | 46553fa154a1787fc0bc36cf5c5ad9f7be1a8fd5fdb7a940b804126e22885e7a |

Daily exact returned ID: tw-daily:2026-10-02:f93460ffdd3d4ec6a60ce1244ce30d0f. Detail PARTIAL, saved business PARTIAL, WARMING_UP, candidateCount0; saved readiness warmingSymbols1082 / INSUFFICIENT_HISTORY1082, pendingCandidateNews null. No claim of no anomaly.

Weekly exact returned ID: tw-weekly:2026-10-02:510f722b6bcd40c09cee9393594be39e. Detail PARTIAL, saved FAILED, five days (FAILED4 / SKIPPED_NON_TRADING_DAY1), problems5, pending total164 / exported100, unfinished0; pointerState NOT_INSPECTED, dailyBinding INDEPENDENT. Truncation/unknown warnings preserved.

All four raw source responses validated against the canonical closed schema / FormatChecker and matched source exit/dataState/warnings to the Dashboard projection. This confirms consumer compatibility only: not natural schedule execution, market completeness, complete history or investment validity. This new Dashboard set does not repeat/extend the previously consumed Stage 4 source formal set.

### Protected invariance

Before/after exact equality PASS: 112 installed Taiwan runtime assets (all manifest raw SHA/size matched), 705 tracked/untracked source file hashes/metadata and source Git state, source config, full data/output metadata, eight opaque formal DB/lock/sidecar-family/journal/immutable weekly/latest file hashes, Task XML/state and source process/listener observations, Python executable identity, canonical source/Dashboard main refs, 225 installed Dashboard image files, 6763 private home files including config/history/Runner receipts, and both actual shortcuts. Formal opaque evidence reads were hash/metadata only, not SQL/business queries. Runtime Stage 4 three assets match canonical Git blobs; canonical physical CRLF bytes are not confused with deployed LF identity.

Canonical engineering docs/README/generated sample stayed byte/content unchanged; Google Docs received no operations. Installed external config remains exact original f5786331c8b62994f8ca0d2231057d2bbbeab694a379ff8aa410726f44885b7f, with no reports-cli-path delta. No deployment/Design Sync/merge/next Stage.

Final exact commit/PR and private evidence hashes are in the frozen management handoff packet rather than a self-referential commit field here. Sol stops after HANDOFF_DELIVERED for management independent review.
