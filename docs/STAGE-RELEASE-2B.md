# Release 2B — US Stocks · SEC Transactions partial slice

Status: **READY_FOR_MANAGER_REVIEW**. Implementation and Self-QA completed on 2026-10-01; exact-SHA independent review remains the delivery gate. No merge or installed deployment. Dashboard base is `479a767989d17ba65200ae4ea83ed1f73ff0b4ba`; Insider source baseline is `d8221904c58e355f1d0a70f782d646d2b14a7069`. [Stage authorization](https://github.com/Neil1031/local-dashboard/pull/7#issuecomment-5923916793).

## Plan, Stage and Gate

- Goal: show actual SEC transaction facts beside the existing reports Signals page without implying certified purchases or completed Form 4/A reconciliation.
- Scope: a fixed SEC operation in the existing bounded process adapter, SEC-specific projection and API, independent SEC UI and a small US Stocks coordinator; current documentation and the existing Chinese Google Doc.
- Dependencies: existing trusted Insider CLI, supported schema-2 source DB and source contract v1. No changes to that repository or DB.
- Gates: strict source/version/type/identity validation; semantic, privacy and process tests; actual responsive/keyboard UI; one formal-source readonly smoke; source/JAR/HTTP parity; canonical generator and native Doc readback.
- Done when: committed branch and PR, exact implementation SHA and this evidence packet are delivered to management, with actual `HANDOFF_DELIVERED`. Self-QA and receipt do not constitute Manager Review PASS or authorize merge/deployment.

## Implemented behavior

`GET /api/us/sec-transactions` uses default limit 50, maximum 100, offset 0..1,000,000 and optional exact ticker (trim/uppercase, 1..16 ASCII alphanumeric/dot/dash, first character alphanumeric). Invalid queries return 400 with `INVALID_SEC_TRANSACTIONS_QUERY`; responses are no-store. The normalized v1 envelope uses READY / EMPTY / UNAVAILABLE / ERROR only. Adapter attempt time and successful source observation are separate; failed observations remain null. Quality flags do not imply transport failure. There is no STALE policy.

The closed source operation constructs executable arguments directly: `--db <configured-db> list-signals --source sec --limit <limit> --offset <offset>` and optional `--ticker`. It reuses existing owner configuration, two shared process slots, 2 MiB stdout / 64 KiB stderr, UTF-8/JSON strict parsing, concurrent drains, timeout and child cleanup. No shell, arbitrary source/arguments, direct external SQLite queries, ingestion or schema/journal changes. Source paths, raw stderr, source URL/location and arbitrary metadata are excluded from the ordinary API/UI.

Only contract v1 / source `sec` / type `insider_transaction` / `sec:` identity is accepted. `SecTransactionProjection` is a separate whitelist for SEC facts. Numeric and nullable boolean facts retain nulls and observed zero. All supplied owners and roles, footnotes, non-P transactions, derivative security type, candidate/review/quality flags and sanitized filing provenance remain visible. SEC source scoring must be null and no scores are projected or displayed. Report identities, report reasons/scores and SEC rows remain separate.

US Stocks has Signals and SEC Transactions navigation; Ticker Detail remains DESIGNED. `ui/us-sec-transactions.mjs` owns SEC transport/cards/detail/filter/pagination; `ui/us-stocks.mjs` only coordinates the two fixed pages. The existing Signals module changes its panel reference only. The main `dashboard.mjs` remains 952 lines. All external text uses textContent; native modal, keyboard activation, Escape and focus return follow Signals behavior. Request revisions and aborts prevent older reads or navigation-away results from replacing current data.

The page explicitly states:

- P code and `candidate_open_market_purchase=true` are **Candidate / 尚未認證**, not certified open-market purchases.
- Form 4/A amendment/correction rows are retained without collapse, deduplication or reconciliation.
- `sec:<accession>:<transaction_index>` is a source-position ID, not an immutable business-event ID.
- Transaction date, filing date, filing accepted time and local discovered time are distinct.
- Insider execution price is the insider's transaction price, not a strategy entry price.
- Pagination is current-state browsing, not PIT research or a complete population count.

Full field/envelope mapping: [Data Contracts](DASHBOARD-DATA-CONTRACTS.md#release-2b-implemented-sec-transactions-partial-slice).

## Self-QA and independent preliminary inspection

- Final normal Maven verify: **198 tests, zero failures/errors/skips**. `PROJECTS_NODE` and `NODE_PATH` enable the existing real Spring HTTP/resource/browser checks. Focused reports/SEC adapter and API tests also passed.
- Full frontend suite: **74 passed, zero failed, four existing opt-in URL-dependent tests skipped** (78 total). Added SEC tests cover contract/source/page/identity, nullable facts/booleans, owners/footnotes, non-P/candidate/derivative/amendment fixtures, ticker/pagination/states, safe text, keyboard/modal, request races and navigation cancellation. Existing Signals, Shell, Overview, Automations, Settings and Projects regressions passed.
- Process coverage includes normal UTF-8, stdout/stderr floods, nonzero exit, timeout, malformed/invalid UTF-8, duplicate keys and trailing JSON. Owned fixture children exited. Big integer contract/page values and malformed SEC metadata fail closed.
- Chrome extension actual visual QA: 1280/375/320 document client/scroll widths **1265/1265, 360/360, 305/305**. Sol inspected desktop/mobile cards and a derivative/amendment fixture modal, nullable facts, literal hostile-looking HTML text, Space activation, Escape/focus return with 3px outline; console warning/error list empty. Management separately inspected all three widths, Enter/Space/Escape, 50+1 pagination, exact ticker, EMPTY/UNAVAILABLE/ERROR, and existing pages. These are synthetic QA fixtures, not screenshots of formal source rows.
- Static prototype checks: **7 passed, zero failed/skipped**; nine pages and Projects detail views at all three widths plus filters/navigation/keyboard.
- Final ten source/JAR/HTTP resources match exactly. Both source-disabled APIs return UNAVAILABLE with no rows and null successful observation in the isolated real JAR. [Final parity](evidence/release2b/final-jar-parity.json).
- Canonical regeneration and --check, 33-ID/status comparison, history preservation and git diff --check passed. [Canonical/test evidence](evidence/release2b/canonical-and-tests.json).
- Only identity-matched owned preview processes were stopped after management inspection; their ports were released. Sol browser viewport reset and tab closed. [Cleanup](evidence/release2b/owned-qa-cleanup.json).

## Actual formal-source readonly smoke

Exactly one packaged Dashboard adapter request used the existing installed Insider CLI and existing formal schema-2 DB, with `--source sec`, limit 50 and offset 0. Result: **READY, 50 records, contract 1, hasMore=true, nextOffset=50**. Naturally present cases: non-P 41, candidate 9, review required 45, quality flags 50, derivative 11. No amendment flag occurred in this page; amendment behavior is covered by synthetic fixtures only. Returned price and amount were non-null for 49 rows; ownership increase was non-null for 29. This preserves nullable source facts rather than replacing missing values with zero.

Before/after DB bytes **138,809,344**, SHA256 `0154596b08de5720349fc3764c3dbe3a72d32b2ecd87c66b91ed609e324bafef` and mtime matched. Source header schema was 2 and non-WAL; WAL/SHM/journal sidecars were absent before and after. The isolated smoke child exited. [Sanitized smoke receipt](evidence/release2b/formal-source-smoke.json).

The final build followed the small canonical document corrections. The original smoke JAR hash `657237e9a70245f9c43e49a2d5fe227a57c8ff762222e538bc45ff29a924d43b` was verified against a retained private local copy. All **220 runtime class/dependency entries** are byte-identical to the final JAR; the only changed archive content is `BOOT-INF/classes/static/project-design/PROJECT-DESIGN.md`. The formal smoke was not repeated. [Runtime parity](evidence/release2b/smoke-final-runtime-parity.json).

This proves the current SEC read path only. Source completeness, 20-filing live validation, Form 4/A reconciliation, certified open-market purchases, investment validity and PIT are **not verified**.

## Canonical and existing Chinese Doc

All **33 IDs and every status remain unchanged**: DONE 19, PARTIAL 4, BACKEND_READY 3, DESIGNED 4, NOT_STARTED 2, BLOCKED 1; other states zero. `product-us` stays PARTIAL. Current Release 2A wording now reflects its completed merge `479a767`; existing Change Log and Design Changes rows are preserved, with one 2026-10-01 Release 2B row appended. The prototype sample is generated only by the existing generator.

The existing [Chinese Google Doc](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit) was updated in place with a required revision guard, using the google-docs skill workflow. Thirteen targeted paragraphs changed; **769 paragraphs / 76 headings / one t.0 tab** remain. The other 756 paragraphs are unchanged; paragraph/text styles, topology, links, lists and native structure are preserved. No new Doc, duplicate Chinese Markdown or sharing operation. Native readback revision is `ANLCKQkwbKTJMSntE8eW5ha67myDGLqvnQh4XbHzOG0UgNkDuLvekt8S2mdm15E_PXDqqFUwXaGcuCj_cT1_kBhU4IXej59v0C8RFPdr4j0`; management also independently read it. Visual Google Doc QA is not claimed. [Readback receipt](evidence/release2b/google-doc-readback.json).

## Findings and remaining gate

Management preliminary code, field mapping, privacy, smoke and UI inspection found no blocking implementation issue. Its document findings were resolved: appended the Release 2B Change Log row, preserved old rows and corrected 來源／獨立 to Traditional Chinese. Final build/generator/parity succeeded afterward. Exact-SHA independent review remains pending at submission; this document does not claim Manager PASS.

No Insider repository/DB edits, ingestion, journal/schema changes, Scheduler/Runner/receipts operations, MISSED, Signals/SEC joins, Ticker Detail, Performance, Reports, TW Stocks, Overview stock metrics, recommendations/trading, installed deployment, shortcut changes or next Stage work.

Synthetic fixture screenshots: [1280](evidence/release2b/chrome-sec-1280.png), [375](evidence/release2b/chrome-sec-375.png), [320](evidence/release2b/chrome-sec-320.png), [375 detail](evidence/release2b/chrome-detail-375.png). [Packet index](evidence/release2b/verification.json).
