# Release 2D — Reports · US Insider

Status: **READY_FOR_MANAGER_REVIEW**. Development and Self-QA completed on 2026-10-01; independent exact-SHA review remains the delivery gate. No merge or installed deployment. Dashboard base `44823aba93f7035c4b4cc7f1e3175067660d29c4`; Insider source main `cdacf8653fa4dce2fee857e57ffdf447f3d04efe`. [Owner/Manager authorization](https://github.com/Neil1031/local-dashboard/pull/10#issuecomment-5928970649).

## Plan, Stage and Gate

| Stage | Goal / scope / dependency | Gate / done when / Self-QA |
| --- | --- | --- |
| A | Reports All/US Insider list and detail over source-owned v1; TW Daily/Weekly not connected | Fixed no-shell commands, strict version/field/query mapping, exact body, truthful current/revision limits; backend/process tests |
| B | Development/pre-install verification and one minimal formal pair | Full regressions, 1280/375/320 keyboard/safe Markdown/races; isolated JAR/static parity; DB/sidecars unchanged and no formal body persisted |
| C | Canonical, existing Chinese Doc, compact evidence, commit/draft PR and handoff | Exactly33 IDs; only Reports status changes; preserve31 other feature rows/history; revision-guarded native Doc verification; management receipt and independent review |

## Implemented behavior

`GET /api/reports/us-insider`: optional exact canonical date YYYY-MM-DD, default limit20/range1..100 and offset0..1,000,000. `GET /api/reports/us-insider/detail`: required exact reportDate, revisionLimit20/range1..100 and revisionOffset0..1,000,000. Real calendar dates/year0001..9999 only; no trim. Invalid input is no-store400 `INVALID_REPORTS_QUERY` before source reads. Successful/failure envelopes are no-store contractVersion1 with READY/EMPTY/UNAVAILABLE/ERROR, observedAt, source/version/observation, warnings and independent page/revisionPage.

The existing private operation enum adds only fixed list-reports/get-report. Configuration, shared Semaphore2, no-shell ProcessBuilder, max2MiB stdout/64KiB stderr, max30s timeout, strict UTF-8/JSON duplicate/trailing rejection and owned child cleanup remain. No generic public command, SQL, external SQLite opening, ingestion, init/migration or WAL bypass. Normal detail uses exactly one get. On generic nonzero get only, exact-date list(limit1) distinguishes missingness without parsing stderr. [Full API/process mapping](DASHBOARD-DATA-CONTRACTS.md#release-2d-implemented-reports--us-insider).

List allowlists all supported summary fields; no rawMarkdown/source_file/path/config/stderr. Parse warnings remain strict text with explicit warning when existing privacy policy redacts local paths. Detail retains exact source rawMarkdown, including Unicode/HTML-looking text/backslash paths, without redaction or truncation. Output limits reject the entire oversized response. Safe DOM Markdown supports headings, paragraphs, lists, fenced/inline code; unsupported HTML/images/link syntax is literal, no innerHTML/anchors/framework. Large bodies above4000 lines use complete plain text rather than excessive DOM nodes.

All means currently connected sources, presently **US Insider only**. TW Daily/Weekly say DESIGNED/not connected and make no API calls. Current signal counts are currently retained rows/active subset, not ticker membership of a historical body. Revision metadata is body/hash/first-observation history; current can be outside requested page, MISSING/null is valid, A→B→A returns to retained A, not a switch timeline. No hash recomputation, old-body semantic diff, historical ticker/score reconstruction or per-signal PIT. Separate pages are current observations, not snapshot tokens.

## Verification

- Normal Maven verify: **229 tests, zero failures/errors/skips**. Focused new Reports plus Signals/SEC/Ticker checks:41 pass. New10 backend tests cover fixed args, query/version/source/identity/count/null/warning/paging/current semantics, exact body, invalid UTF-8/JSON/output bounds, timeouts, shared slots/cleanup and unknown-report behavior.
- Full frontend: **113 pass, zero fail, four existing opt-in packaged/live tests skipped** (117 total). The four require explicit endpoint environment and are not claimed as passes. Reports adds5 contract/date tests and8 browser tests; all pass. Existing Signals/SEC/Ticker/Shell/Overview/Automations/Settings/Projects regressions pass.
- Actual browser1280/375/320: no document/dialog horizontal overflow, real Tab traversal reaches date trigger, Space/Enter opens native dialog, visible focus, Escape returns focus. Literal script/img/javascript link/emoji/path text creates no unsafe nodes or execution. Independent list/revision paging, current outside page, MISSING, exact filter/TW no reads, states, stale clearing/newer wins/leave cancellation and full large body fallback pass.
- Sol visually inspected [1280](evidence/release2d/reports-1280.png), [375](evidence/release2d/reports-375.png), [320](evidence/release2d/reports-320.png), [375 detail](evidence/release2d/report-detail-375.png). All are synthetic fixtures. Management separately checked actual Chrome keyboard/mobile/literals/revision semantics; its default-control style finding was fixed by reusing existing control styles and independently rechecked.
- Prototype7 pass; generator --check and git diff --check pass. Synthetic real JAR verifies fixed list/get, exact body, current outside page, independent revision paging and bounded missing-report preflight. All source/JAR/HTTP static modules and final canonical bytes match. [Isolated receipt](evidence/release2d/isolated-jar-smoke.json).

## One actual formal read-only pair

Exactly one isolated packaged Dashboard list(limit1,offset0) and selected get(revisionLimit1,offset0) returned READY. Selected report date2026-09-30, warnings0, currently retained signals5/active5, revisions1, currentMATCHED. List hasMore=true/nextOffset1; revision hasMore=false/nextOffsetnull; contract/source version1. Formal body stayed only in memory, never written to evidence/log/Git.

DB bytes138,809,344, SHA256`0154596b08de5720349fc3764c3dbe3a72d32b2ecd87c66b91ed609e324bafef` and mtime identical before/after; WAL/SHM/journal absent both times, non-WAL header. Owned isolated child exited. [Sanitized receipt](evidence/release2d/formal-source-smoke.json).

After this pair, only documentation/canonical/generator content changed; Reports backend/process/query code did not change. Final package logs say **Nothing to compile** and final source/JAR/HTTP parity is verified. The original formal JAR hash is recorded in its receipt but its original archive was not retained; **no original-formal-to-final archive byte comparison is claimed**. Formal pair was not repeated for UI/docs fixes. [Build continuity and limits](evidence/release2d/build-continuity.json).

This proves the current Reports read path only, not source completeness, historical ticker/score membership, investment validity, semantic differences or installed acceptance.

## Canonical and existing Chinese Doc

All33 IDs retained. Only `product-reports` DESIGNED→PARTIAL; `product-us` remainsPARTIAL with normal current2C wording updated to merged main44823ab. Other31 feature rows are unchanged. Counts:DONE19/PARTIAL5/BACKEND_READY3/DESIGNED3/NOT_STARTED2/BLOCKED1. Existing Design Changes/Change Log rows preserved; one2D Change Log row added, sample only from generator. `product-shell` row retains the original Release1B four-destination limitation; adjacent current-state note identifies Reports nowPARTIAL/three remainingDESIGNED without changing the protected31 rows. [Canonical check](evidence/release2d/canonical.json).

Existing [Chinese Google Doc](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit) updated in place using google-docs trusted read, required revision and native readback. Eleven target paragraphs changed; **770 paragraphs/76 headings/one tab** preserved, other759 paragraphs exactly unchanged including native structure/styles/links/lists. No new Doc/tab/paragraph/sharing or duplicate Chinese Markdown. Management independently rechecked the same native preservation. Visual Google Doc QA is not claimed. [Readback receipt](evidence/release2d/google-doc-readback.json).

## Findings, protection and remaining gate

Resolved management findings: exact untrusted body instead of safe-text rewriting; explicit warning redaction notice; consistent existing controls; current Reports/three-destination documentation. A test regex initially rejected an extra paragraph blank line; fixed assertion, not product behavior. Canonical note placement initially violated the existing parser's table-only section; moved before Feature Matrix and reran parser/generator/parity.

No Insider repository/DB changes, import/SEC ingestion, journal/schema changes, Scheduler/Runner/receipts operations, MISSED, Performance/TW/AIStockHunter/Overview report metrics, recommendations/ranking/trading, installed deployment/QA, shortcut edits, merge or next Stage. Only owned isolated preview/test processes are stopped.

Commit/draft PR and exact packet are delivered to existing `[Dashboard] 管理與初審` for HANDOFF_DELIVERED and independent exact-SHA review. Self-QA and receipt do not constitute Manager Review PASS or authorize merge/deployment. [Verification packet](evidence/release2d/verification.json).
