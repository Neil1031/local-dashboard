# Taiwan Performance Consumer v1 — implementation / Self-QA

## Authority and frozen identities

- Sol implementation: isolated `implement/dashboard-tw-performance-v1` in `F:/AI workspace/local-dashboard-tw-performance-v1`.
- Dashboard baseline and initial implementation parent: `1322040f0e6859ae3efc36f1dd971c0ee3b3cc4c`.
- Taiwan source contract: `bc9026b70dd3039813e76b69979d8170a3743d78` in `F:/AI workspace/taiwan-volume-watch-main`.
- Contract inspected directly: `schema/tw-observed-performance-v1.schema.json`, `stock_hunter/tw_observed_performance_export.py` and the fixed exporter entry point.
- Installed Dashboard identity remains `d1e6a5a55edee12c455cc52be26196640ecedb2c`; this checkout is not the installation.
- Formal-read allowance **0**; formal compatibility **NOT_CONSUMED**. No formal source CLI, API, database, saved business payload, or fallback invocation.

## Plan / Stage / Gate

- Goal: consume source-owned per-candidate Taiwan observed-return evidence in a separate subview of the existing Performance page.
- Scope: bounded transport, closed projection, four-parameter API, development configuration, source coordinator, bilingual presentation and synthetic verification.
- Dependencies: the accepted Taiwan source schema/version, existing bounded process runner and the Taiwan Stocks two-slot gate.
- Gate / Done when: closed contract and source semantics preserved, source isolation/races/paging/locale verified, relevant existing regressions and ordinary full checks pass, exact candidate delivered for independent management review.
- Self-QA is implementation evidence. It grants no independent PASS, merge, deployment, launch, formal-read, or next-Stage authority.

## Transport / API / configuration

- New `TaiwanPerformanceAdapter`, `TwPerformanceProjection`, `TwPerformanceController`; GET `/api/tw/performance`.
- Only startDate/endDate/limit/offset accepted. Unknown, duplicate or empty parameters and invalid values produce HTTP400 before a child is started. Responses use no-store.
- Mandatory real inclusive dates, start<=end, maximum366days; limit1..50(default20), offset0..10000(default0).
- New development key `dashboard.sources.taiwan.performance-cli-path`. Empty in both development defaults and example; comment identifies source-relative `tools/export_tw_observed_performance.py` and requires a trusted absolute deployed path. Existing seven/eight-argument Taiwan configuration callers retain defaults.
- Fixed argv: configured Python (py.exe adds -3.11), -B, configured exact CLI, --db configured database, list, --start-date, --end-date, --limit, --offset. No shell, output-dir, fallback, discovery or help call.
- Same Stocks-owned two-slot semaphore is shared with Stocks/Reports/History. Existing BoundedSourceProcess supplies timeout1..30s, stdout1MiB, stderr64KiB, cleanup and interrupt handling.
- READY/EMPTY require exit0; PARTIAL/UNAVAILABLE/ERROR require exit2. Other exits, malformed/duplicate/trailing JSON, unsupported contracts and limit failures return bounded public failure codes without private paths/stderr.

## Preserved source contract and meaning

- Closed source allowlists validate version, query, identity, state, paging, numeric/null types, semantics and complete provenance; unknown/private fields reject rather than render.
- Exact item identity `tw-candidate:<targetDate>:<runId>:<symbol>`. Source order is retained without sorting or deduplication. Distinct same-day runs survive; no gap or MISSED rows.
- Ordered horizons1/3/5/10/20 preserve source expectedDate/close/returnPercent/state/reasonCode/dueAt/provenance. Dates, market sessions, clocks and returns are never recalculated.
- Invalid reference can coexist with a visible horizon close and provenance while observed return remains null.
- Source evidence uses current saved official unadjusted close, conservative13:33Taipei availability and `crossPageSnapshot=false` / `historicalPIT=false`.
- Reference close is not execution/entry; observed return is not realized P&L. Positive is not BUY success and negative is not SELL. Source anomaly score is not investment score. Null is not zero, NOT_YET_DUE is not failure and PRICE_UNAVAILABLE is not flat return. No aggregates, win/loss statistics, positions, sizing or recommendations are added.
- total=null, hasMore, nextOffset and the offset ceiling remain source-owned.

## UI integration

- `ui/tw-performance.mjs` wraps the unchanged US Performance module in an explicit US Insider / Taiwan source coordinator. Existing US summary/list/detail behavior remains.
- Taiwan reads lazily only when selected. Refresh and Previous/Next request one bounded page. No polling or cross-source aggregation.
- Loaded range/page/data survive subview or primary navigation. Latest matching request wins; leaving cancels/suppresses pending responses. Taiwan interactions make no US source requests.
- Both shared locale resources include matching new keys/placeholders. Locale changes translate held nodes only; no refetch/reset, range/page/focus preserved. Raw IDs, timestamps and source codes remain visible.
- Static fixture-server allowlist and real Spring resource-chain test include the new module; Maven's existing ui/*.mjs resource pattern already includes it.
- Shared Performance subtitle now describes both separated sources. Canonical Project Design, generated sample, README, Owner Docs and notification table are unchanged.

## Bounded Luna work and Sol integration

- gpt-6-luna / high: configuration and backward-compatible binding tests (four assigned paths).
- Same bounded worker: synthetic Java adapter/controller/process tests and one synthetic JSON resource (three assigned new paths).
- gpt-6-luna / high: frozen source constants and self-contained synthetic factories (one assigned new path), then Node parser tests (one assigned new path).
- No Luna architecture, formal reads, deployment, acceptance, commits or new persistent Work. Sol owns the projection/UI, reviews assigned diffs, verifies the JSON fixture exactly matches the factory, adds pagination/no-recomputation cases, and executes integrated checks.
- Luna's backend helper used an older default Node for its local check; Sol independently compared its JSON against the factory using the bundled runtime and obtained exact equality.

## Verification and protection

- Full ordinary Node/browser: **257 tests;253 passed,4 opt-in formal/live tests skipped,0 failures**. Live/replay opt-in environment variables were cleared.
- Full Maven **clean verify:302 tests;0 failures,0 errors,0 skipped; BUILD SUCCESS**. Standard isolated build artifacts only; no app-image/deployment package produced.
- Focused integration before the full run:33 Node/browser checks and16 Java checks passed. After the final screenshot-only test addition, the3 width cases passed again.
- Real synthetic Edge browser at1280/375/320: lazy/source isolation, keyboard operation, no document overflow, null/zero/negative/state/provenance, paging, query bounds, cache/reentry, races and locale/focus preservation passed. Twelve full/top screenshots (en/zh-TW) were captured outside Git; all six final viewport images and representative full-page images were visually inspected.
- Generator --check:33features matched. Exact baseline Project Design/sample bytes and all33ordered IDs/statuses stay unchanged:19DONE /8PARTIAL /3BACKEND_READY /2NOT_STARTED /1BLOCKED; product-tw and product-performance remain PARTIAL.
-232 protected file hashes match before/after:225 installed files, application.yml, runner.json, two shortcuts and three deployed Taiwan source files. Seven related Scheduled Task XML definitions match exactly. Configured receipt/fallback roots remain absent.
- Dashboard primary main and Taiwan canonical worktrees remain clean. Formal DB/business payloads were neither read nor hashed; business-data byte parity is not claimed. No stage-owned formal source/data/Task/Runner/receipt/installation/process writes.
- Canonical design, generated sample, README, historical Stage evidence, Owner Docs and notification table were not changed.
- Local evidence directory: `C:/Users/qwe74/AppData/Local/Temp/dashboard-tw-performance-consumer-v1-1791120198236` (plan, synthetic test logs, screenshot set, protection/task captures and handoff packet). Evidence contains synthetic observations only.
- F1 focused follow-up: corrected the owner-specific nonexistent CLI example to an empty value with source-relative entry-point guidance. Only the example and this Stage wording change; executable code, tests and default application.yml remain byte-identical to candidate ce330a2614e660d132fb216ca17c300432e83a7b. Generator/diff checks and protection parity rechecked; no full campaign rerun.
- Limits: formal compatibility remains **NOT_CONSUMED**; this is source-schema/synthetic consumer QA, not installed acceptance or independent management review.

## Delivery / stop boundary

Candidate exact SHA, branch and PR are supplied in the external handoff packet to the existing [Dashboard] 管理與初審. This document remains the sole new Stage document.

Stop at **READY_FOR_MANAGER_REVIEW — DASHBOARD TAIWAN PERFORMANCE CONSUMER V1 IMPLEMENTATION**. No merge, installed launch/QA, packaging for deployment, deployment/process migration/stop, Scheduler/Task/Runner/receipt changes, source runtime/data changes, Owner Docs/notifications updates or next Stage.
