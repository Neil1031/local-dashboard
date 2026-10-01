# Release 2A — US Stocks · report Signals

Status: **COMPLETE / MERGED**. [Manager PASS](https://github.com/Neil1031/local-dashboard/pull/7#issuecomment-5923738052) accepted exact head `4d9e92facd89390cd37fef1ef66b9e4982c44427`; explicit no-ff merge `479a767989d17ba65200ae4ea83ed1f73ff0b4ba` completed Git closeout. Installed app was not updated. The implementation / Self-QA record below is retained as submitted; later SEC work belongs to [Release 2B](STAGE-RELEASE-2B.md).

## Plan and implemented boundary

- Goal: browse actual Insider report assessments in US Stocks → Signals, with source evidence and uncertainty visible.
- Scope: one fixed reports-only process adapter, one bounded Dashboard endpoint and an independent `ui/us-signals.mjs` page. Existing Shell/Overview/Automations/Settings/Projects stay intact; dashboard.mjs is 952 lines.
- Dependencies: the existing trusted Insider CLI and existing schema-2 database. Source `signals/model.py`, `signals/reader.py`, `storage/db.py` and CLI were read before mapping; their bytes are identical between inspected local `22d69c3ccf2bd9d5f725c6a03deea871f0daf9a2` and fetched remote `d8221904c58e355f1d0a70f782d646d2b14a7069`. The latter adds only a report document; the source checkout was not pulled or edited.
- Gate: strict contract v1 / reports acceptance, real process tests, actual formal-source readonly smoke, null/quality/privacy semantics, keyboard/mobile regression, final JAR resource parity, canonical generator and existing Chinese Doc readback.
- Done when: exact implementation SHA/PR and verification packet are delivered to management for independent review. Passing Self-QA does not authorize merge/deployment.

## Configuration and API

See the implemented [contract](DASHBOARD-DATA-CONTRACTS.md#release-2a-implemented-reports-slice). Configuration is `dashboard.sources.insider`: disabled by default, owner-configured absolute CLI/DB paths, timeout 1..30 seconds (default 10). No local private path is committed. Invalid/missing configuration stays UNAVAILABLE.

The actual command is executable + argument list: `--db <configured-db> list-signals --source reports --limit <1..100> --offset <0..1000000>` and optional bounded exact `--ticker`. No shell, arbitrary arguments, DB initialization/migration, journal changes or pipeline. Two concurrent process slots, 2 MiB stdout / 64 KiB stderr, concurrent drains and timeout cleanup bound the operation; Python UTF-8 and no-bytecode settings support the installed Windows CLI. Stderr/paths are not logged or passed to ordinary API/UI.

`GET /api/us/signals` uses a Dashboard-owned v1 envelope: READY / EMPTY / UNAVAILABLE / ERROR, items/page/observedAt/sources/warnings. Unknown source/version fails closed; malformed/oversized output is ERROR. `observedAt` is the adapter attempt; successful source `lastObservedAt` exists only for READY/EMPTY, otherwise null. Record quality flags do not make transport fail. No freshness/STALE policy is invented.

Event date is transaction date, distinct from metadata report date and discovery time/basis. Both scores retain `imported_ai_report` and UI says **Imported AI report**. Listed buyer count means supplied array length, not a certified population; nullable amount/scores remain null/—. Positive reasons/risks, buyer facts, flags, document ID/hash/source type and first/last source observations remain available in detail. Location/raw excerpt/arbitrary metadata and suggested actions/position recommendations are excluded. All external text is rendered with textContent; native dialog supports keyboard open, focus containment and Escape/focus return. Each source read is a transaction snapshot; pagination across requests is current-state browsing, not PIT research.

## Verification

- Final normal Maven verify: **191 tests, 0 failures/errors/skips**. `PROJECTS_NODE`/`NODE_PATH` enabled the existing real Spring resource/browser test rather than leaving its first-run opt-in skip. Exact new module/static/canonical resources were served over real loopback HTTP.
- Final frontend suite: **67 passed, 0 failed; 4 existing opt-in live/package tests skipped because URLs were not supplied**. Seven new Signals unit/browser cases cover contract/page/source/origin validation, nulls, safe HTML text, 1280/375/320 cards and modal overflow, exact ticker, 50+1 pagination, EMPTY/UNAVAILABLE/ERROR, loading, newer-query precedence and navigation cancellation. Existing Shell/Overview/Automations/Settings/Projects regressions passed.
- Actual subprocess coverage: normal UTF-8 output, stdout flood, stderr flood, nonzero exit with sensitive diagnostics, timeout, malformed JSON, invalid UTF-8, duplicate keys and trailing JSON. Every owned fixture process exited; no fixture DB content changed. Unsupported giant integer versions/pages/record IDs, query bounds and source/filter mismatches fail closed.
- **Formal source smoke succeeded**: actual packaged Spring JAR → fixed adapter → existing installed Insider CLI → existing formal schema-2 DB. One limit-50/offset-0 read returned READY, contract 1, **22 records**, hasMore=false/nextOffset=null, including non-ASCII record text. Source header was not WAL. Before/after main DB bytes/SHA256/mtime matched; no WAL/SHM/journal sidecars existed before or after. The isolated JAR child exited. This proves the current report read path, not complete source ingestion, scoring quality, PIT or strategy validity. [Sanitized evidence](evidence/release2a/formal-source-smoke.json).
- Supported Chrome extension: actual pixels at 1280/375/320; document client/scroll width matched **1265/1265, 360/360, 305/305**, including Windows scrollbar. Safe literal HTML, null scores/amount, distinct dates, quality/provenance, Enter/Space detail, Escape/focus return and long hash wrapping verified. Console warning/error list empty. The management Work separately inspected these widths/states and existing pages; that preliminary evidence does not replace its exact-SHA review.
- Final source/JAR/HTTP exact bytes match for index, dashboard, all five page/parser modules and canonical Project Design. [Parity evidence](evidence/release2a/final-jar-parity.json). Isolated final JAR uses empty Scheduler/Runner configuration, disabled Insider source and isolated Dashboard data/metadata; the real-source smoke used separate temporary Dashboard data.
- Generator normal regeneration / --check, canonical 33-ID comparison, Git diff check and privacy audit passed. Only product-us changes status in this Stage; no other status changes or history-row rewrites.

## Canonical and Chinese Doc

Counts: DONE 19, PARTIAL 4, BACKEND_READY 3, DESIGNED 4, NOT_STARTED 2, BLOCKED 1; other states zero. `product-us` is PARTIAL for this reports slice; shell/overview/projects remain PARTIAL. Remaining SEC/Ticker/Performance/Reports/TW/Evidence/aggregation gates stay explicit. Current Release 1B wording now reflects merged main `654fc84`; historical rows remain intact. Sample is regenerated by the existing generator.

The existing [Chinese Google Doc](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit) was updated in place using the google-docs skill: 12 targeted paragraphs, **769 paragraphs / 76 headings / one t.0 tab retained**, no paragraph/text style changes, unchanged unrelated text. Native readback and the management Work's independent readback agree. No new Doc/Chinese Markdown duplicate or sharing operation. [Native readback evidence](evidence/release2a/google-doc-readback.json); visual Google Doc QA is not claimed.

## Findings fixed and limits

During implementation/management preliminary inspection: replaced truncating integer comparisons with exact bounded comparisons; failed-source lastObservedAt remains null; source label separates attempt time from successful observation; every request owns its AbortController/timer/query; Python output encoding is explicit. Documentation no longer says all external adapters are absent. No remaining implementation blocker was found in Self-QA; independent exact-SHA management review remains pending.

No SEC production integration, performance-summary, report revisions, AIStockHunter/TW, Overview signal counts, trading/recommendations, MISSED, production schema, installed image/shortcut/runtime, Task definition, Runner configuration/receipt or next Stage operation. No changes to the Insider repository or formal DB. Only isolated owned QA processes are cleaned up after management inspection.

Screenshots are explicit synthetic QA fixtures: [1280 Signals](evidence/release2a/chrome-signals-1280.jpg), [375 Signals](evidence/release2a/chrome-signals-375.jpg), [320 Signals](evidence/release2a/chrome-signals-320.jpg), [375 detail](evidence/release2a/chrome-detail-375.jpg).
