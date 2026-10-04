# Taiwan History / Range Consumer v1 — implementation only

Authority: existing Dashboard Manager / Sol pair, owner-authorized implementation handed to Sol.
Baseline: exact main b384abfe2b46d5957f95eb77c8a0a709c6c2540a.
Worktree: F:/AI workspace/local-dashboard-tw-history-range-v1.
Branch: implement/dashboard-tw-history-range-v1.
Status: READY_FOR_MANAGER_REVIEW; implementation Self-QA is separate from independent approval.

## Plan / Stage / Gate / Done when / Self-QA

- Goal: inspect bounded source-owned saved Daily Observation history inside the existing TW Stocks page.
- Scope: fixed History LIST adapter/projection/controller, explicit configuration, TW subpages, bilingual resources, tests and this Stage file.
- Dependencies: deployed source-owned tw-history-range-v1 contract, shared Taiwan process gate and shared UI i18n resources.
- Gate: targeted synthetic tests, full ordinary Node/browser regression, Maven clean verify, generator --check, diff check and exact-SHA independent review.
- Done when: strict bounded API and usable History subpage work, same-day identities and null/state/order semantics remain truthful, frozen replay is labeled honestly, protected surfaces are unchanged, clean pushed branch / draft PR / complete management handoff.
- Self-QA: synthetic fixtures and retained original frozen Stage 5 capture only. No source CLI, formal DB / SQL / source API read, installed QA or new formal allowance.
- Exclusions: canonical Design Sync / README / AGENTS / owner Google Docs, merge, deployment, installed runtime, source-project changes, Tasks / Runner / receipts / DB mutations, Taiwan Performance, investment or next Stage.

## API / configuration / transport

GET /api/tw/history?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=20&offset=0.
Only these four parameters are accepted; unknown, duplicate or empty parameters return HTTP400 before source invocation. Both dates are required, strict real calendar dates from year0001, inclusive, start<=end and at most366days. limit1..50 defaults20; offset0..10000 defaults0. All HTTP results are no-store.

TaiwanHistoryAdapter invokes the explicit dashboard.sources.taiwan.history-cli-path (export_tw_history.py), separately from Stocks / Reports paths. Fixed argv is Python [-3.11 for py.exe] -B <history CLI> --db <existing DB> list --start-date <start> --end-date <end> --limit <limit> --offset <offset>. There is no output directory, shell, arbitrary operation, DETAIL or source schema/file interpretation. Default source remains disabled and the new path defaults empty; no installed configuration is changed.

The adapter reuses TaiwanStocksAdapter's existing Semaphore2 and BoundedSourceProcess (unchanged product transport):1MiB stdout,64KiB stderr, configured1..30seconds, strict UTF-8 / duplicate JSON / trailing-token rejection, actual child cleanup and safe fixed reason codes. Exit0 binds READY/EMPTY; exit2 binds PARTIAL/UNAVAILABLE/ERROR. Explicit canonical constructor binding preserves the original seven-argument synthetic fixture constructor and the new eight-field Spring record binding.

TwHistoryProjection maps a consumed-field allowlist to Dashboard envelope contractVersion1 / sourceContractVersion tw-history-range-v1 / source taiwan-history. Fixed Dashboard provenance is SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS; the source does not claim an additional provenance field. Query requestedStartDate/requestedEndDate must exactly match. Valid source scope may survive UNAVAILABLE or ERROR. Input ERROR query/scope/page null is safe; Dashboard keeps its own requested query. EMPTY may retain RANGE_START_BEFORE_SOURCE_SCOPE with exit0.

All selected items preserve source order, observationId, targetDate, runId, aware finishedAt, savedStatus, classificationStatus, strategyStatus, candidateCount, saved total/truncation, SUCCESS/PARTIAL/FAILED source counts, nullable readiness, both TWSE/TPEX summaries, allowlisted projectionWarnings and exact tw-reports-v1 Daily detailRef. Known identity/page/count contradictions fail closed; private extra fields are omitted. No candidate identities, source payload/body or private path is exposed.

Page preserves limit/offset/returned/hasMore/nextOffset/total=null. nextOffset uses offset+limit. At the10000ceiling, hasMore=true and nextOffset=null are retained with PAGINATION_OFFSET_LIMIT; the browser disables Next. Pagination is independent current source inventory, not an atomic/PIT snapshot or stable population.

## UI / state / locale / absence

The existing TW Stocks primary navigation now contains Current observation and History / Range subpages. Current retains its exact-date/latest flow and first-load cache. History defaults to the last seven UTC calendar dates; required date controls can query any bounded valid range. Only entering History first loads it; merely viewing Current adds no History call. Refresh reads only the current History page; Previous/Next load only the requested page. Successful return navigation uses held data, with no polling or automatic extra pages.

Each observation independently displays its date, RunID, saved business state, classification/readiness, saved finishedAt, candidate count, saved candidate total/truncation, source status counts, saved readiness counts/reason, TWSE/TPEX completeness and exact Daily report identity. This is identity display only, with no automatic Reports DETAIL read. Same-day runs are neither joined nor deduped. No date-gap rows or Scheduler/calendar conclusions are created.

READY / PARTIAL / EMPTY / UNAVAILABLE / ERROR remain separate from saved business SUCCESS / PARTIAL / FAILED. Null is UNKNOWN rather than0, unknown completeness is not NO, and WARMING_UP+0 explicitly does not mean no anomaly. No observation for a date proves none of missed run, failure, holiday, zero candidates or no anomaly. No performance, return, profit, trading or backtest semantics are added.

New owner text uses26 shared bilingual keys with matching placeholders. Null and boolean presentation uses existing common descriptors; source codes / IDs / timestamps remain explicit. Locale switches update held text only, preserving range controls, current offset, rows and focus without fetch/reset/clear. Latest matching request wins; leaving either subpage or primary page suppresses stale completion. Browser race tests deliberately ignore AbortSignal to test the revision guard itself.

## Self-QA / evidence layers

- New Java tests:13 passed, including configuration binding, strict query/date366-vs367/bounds, all source states/scope, same-day runs, null facts, page ceiling, malformed identities/counts, privacy, fixed argv, actual bounded children, three-consumer shared Semaphore2 and interruption cleanup.
- New frontend parser tests:5 passed; History browser tests:9 passed, including actual keyboard/controls, state transitions, one-page requests, zero DETAIL, locale/focus/no-refetch and stale-response suppression.
- Final full ordinary Node/browser:239 tests,235 passed,4 existing opt-in live tests skipped,0failures. Existing TW Stocks / TW Reports / Evidence / i18n regressions included. No formal/live URL supplied.
- Final Maven clean verify:286 tests,0failures/0errors/0skips; BUILD SUCCESS. Generator --check passes33features; git diff --check passes.
- Both zh-TW and English1280/375/320 screenshots were actually captured and inspected: content wraps with no horizontal overflow; long RunID/report identity remains visible. These are synthetic UI fixtures, not installed or new formal observations.
- Initial full Maven found the new record's ambiguous constructor binding (fixed with explicit canonical annotation and regression), plus a pre-existing BoundedSourceProcessTest PID-publication race. A second run confirmed the PID race. Failed logs/reports are retained. That one existing test now waits for complete numeric PID content within its original3second bound; all alive/interruption/join/parent+descendant cleanup assertions remain. Product BoundedSourceProcess is unchanged; no skipped/relaxed assertion. An interrupted run was also retained and never counted as complete.

Private evidence root: C:/Users/qwe74/AppData/Local/Temp/dashboard-tw-history-consumer-v1-1791110000000.
It contains complete final logs, preserved failures/interrupted logs, viewports, original frozen bytes, TEMP replay projection/receipts, protection snapshots and final exact-SHA handoff. Formal payload is never committed as a Git fixture; Git data is synthetic.

Retained frozen capture: C:/Users/qwe74/AppData/Local/Temp/tw-stage5-history-sol-1791088802097/formal-export.json,2654bytes, SHA25638c0ad31f5da731c0b7d8964c19521b69d71a0871b24498fb1a5a2b9247a317a. Original source generatedAt2026-10-04T05:26:23.122785+00:00, original formal execution bbac55b475941ed79b895dd496f332d3d0f4a006 / final source implementation315a14f. Current source canonical13e9f313a1754576e8b5d509e54e530b8764ac6b is read-only.

Frozen replay through the actual bounded adapter using an inert TEMP test-child seam and frontend parser preserves original limit2/offset0, two distinct same-day observations, PARTIAL, full items/page/scope/warnings/generatedAt parity, hasMore=true/nextOffset2/total=null. No second page or altered-date source call. UI20-row pagination acceptance is separate synthetic evidence; original limit2 capture is not relabeled as a live20-row request or final formal invocation. New formal reads0.

## Protection / status / handoff

Before/after opaque hashes match225 installed Dashboard files, external config, both existing shortcuts, Runner receipt-directory ABSENT state and fallback files. Seven AIStockHunter/InsiderTracker Scheduled Task definition hashes match. Source executable/config tracked byte hashes match408 Taiwan canonical,369 installed AIStockHunter and62 Insider files. Primary and source canonical worktrees remain clean. No app launch, desktop package/install publication, Task run/stop, source DB open/migration, Runner/receipt mutation or natural-schedule intervention occurs. Formal DB bytes were not inspected, so this does not claim they cannot change independently.

Only this new Stage file changes documentation. Canonical PROJECT-DESIGN, README, root AGENTS and both owner Google Docs remain untouched. All33 stable IDs and statuses stay DONE19 / PARTIAL8 / BACKEND_READY3 / NOT_STARTED2 / BLOCKED1, others0; product-tw remains PARTIAL. The prototype generator matches the unchanged canonical design. No new primary navigation or feature ID.

Explicit acknowledgement: streamlined-combined-closeout-v1 one-time workflow notice received and understood. This Stage still stops after implementation handoff; existing governance is reused, no new Work/subagent is created, and notice tracking/canonical docs are not changed under this implementation-only scope.

Sol delivers exact SHA / direct parent / branch / draft PR / tests / replay / protection evidence to existing [Dashboard] 管理與初審 with HANDOFF_DELIVERED. Independent final approval, merge, Design Sync, deployment, Taiwan Performance and next Stage remain outside this packet's completion claim.

## Authorized combined closeout

Implementation exacte52a4be passed independent management review and Manager approval. Owner now authorizes material Design Sync directly on e52a4be, no-ff integration with exactmainb384abfe, then isolated exact-merged-main package validation, complete rollback backup, sole history-cli-path config addition, fullimage install and finalSTOPPED. No new formal reads or post-install QA, no status-onlyGitcommit/repackage loop. The original implementation-only boundary above is historical; current closeout adds only these authorized actions. Final merge/package/install/Owner Doc revisions and manifests are recorded outsideGit after actualinstallation. Taiwan Performance NOT STARTED.
