# Release 2C — US Stocks · Ticker Detail

Base: `e0aa592b4db3c57c1cdf4bf429e7b082ca7a8641`. Branch: `implement/dashboard-release2c`. Owner scope: [Manager authorization](https://github.com/Neil1031/local-dashboard/pull/9#issuecomment-5926392238). Development implementation and verification are complete; exact final SHA is supplied in the PR/handoff packet. Independent management review remains the stopping gate. No merge, installed deployment or next Stage.

## Delivered behavior

US Stocks has Signals, SEC Transactions and Ticker Detail. The new view requires one bounded exact ticker (trim/uppercase), displays the two sources separately and optionally opens from either source's `View ticker` button carrying only ticker. The composite API and its complete 16-case state table are in [Data Contracts](DASHBOARD-DATA-CONTRACTS.md#release-2c-implemented-ticker-detail-aggregate).

The two existing fixed adapter reads run sequentially without changing shared process behavior. Full source envelopes preserve report/SEC IDs, dates, version/observation, null facts, provenance and warnings. One failed/malformed source becomes its own safe ERROR/UNAVAILABLE while the valid other remains visible. Independent pagination changes only that source offset; counts describe loaded/current-page rows, never total population. No all-pages loading, join, dedupe, identity inference, combined scores/recommendations or PIT claim.

Report score origins and reasons/risks remain Imported AI report. SEC still has no scores; P/candidate is unverified, non-P/derivative rows remain visible, amendments remain unreconciled/uncollapsed, execution price is not a strategy entry price, and transaction/filing/accepted/discovery times stay distinct. Performance remains **DESIGNED / 尚未接入唯讀來源**; no performance-summary, external DB access, Reports/revision reader or invented performance values.

Dedicated `ui/us-ticker-detail.mjs` reuses narrow source card/dialog helpers. `dashboard.mjs` and `InsiderSignalsAdapter.java` are unchanged. Newest ticker wins, leaving subpage/main page cancels stale rendering and closes dialogs; the 75-second composite client deadline covers two existing bounded operations. Browser abort does not promise cancellation of server work.

## Verification

| Check | Actual result |
| --- | --- |
| Normal Maven verify | 219 tests; 0 failures/errors/skips; build success |
| Complete frontend suite | 100 pass, 0 fail, 4 opt-in packaged-environment tests skipped (104 total) |
| New ticker browser checks | 6 pass, including 1280/375/320, Tab/visible focus, Space/Enter, Escape/focus return, source paging, malformed/failure states, races and navigation cancellation |
| Static prototype regression | 7 pass, all nine pages/Projects and keyboard at 1280/375/320 |
| Generator/canonical | Generator `--check` passes; all 33 IDs/statuses and counts unchanged; other 32 feature rows unchanged; product-us remains PARTIAL |
| Isolated JAR composite | Synthetic executable fixture only: READY, independent paging, malformed SEC -> PARTIAL retaining reports; fixed reports/sec calls, no-store, source/JAR/HTTP asset and canonical bytes exact; owned process exited |
| Management independent UI | Chrome fixture at 1280/375/320; no page overflow, 320 dialog fits, Tab/Space/Escape/focus return, Reports next offset 50/one row while SEC stays offset 0/50 rows |

The four skipped frontend tests require explicitly configured packaged/live endpoints: bootstrap Chinese aliases, actual list/refresh, persisted History, and packaged Settings. No installed endpoint was supplied in this Stage. Existing normal fixture/browser and Maven isolated HTTP regressions passed for Shell, Overview, Automations Today/History, Settings, Projects, Signals and SEC.

Management's additional manual fixture failure-state switch was blocked by Chrome (`net::ERR_BLOCKED_BY_CLIENT`); it was not retried through another surface. This manual action remains not verified; deterministic/backend/browser failure-state coverage passed. Manager preview was closed and its owned listener released. Sol's unused duplicate preview was also stopped by matching PID/path/command/creation identity; its listener released.

One initial focus assertion used programmatic focus after mouse input; the test was corrected to actual keyboard Tab before checking focus visibility. The first isolated JAR fixture failed because .NET JavaScriptSerializer returned ArrayList, not object[]; the fake source now consumes IEnumerable. Product/shared adapter code was not changed to accommodate either test issue.

## Documents and evidence

Canonical product-us wording, README, As-Built, Design Space and Data Contracts are current; status counts and historical rows stay intact. Prototype sample is generated, not hand-edited. Existing [Chinese Google Doc](https://docs.google.com/document/d/1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs/edit) is updated in place with a revision guard, including current summary/navigation/Release 2 status and one explicit Ticker Detail paragraph. No duplicate Doc or Chinese Markdown was created. Native readback/preservation results are recorded in the compact receipt.

Evidence: [verification receipt](evidence/release2c/verification.json), [isolated JAR receipt](evidence/release2c/isolated-jar-smoke.json), [1280](evidence/release2c/ticker-1280.png), [375](evidence/release2c/ticker-375.png), [320](evidence/release2c/ticker-320.png). Screenshots are management's explicitly synthetic fixture view, not installed/formal-source evidence.

Reproduce preview with `node tests/release2c-preview.mjs` from this checkout; it prints a random loopback `QA_FIXTURE` URL. Open `/#us`, choose Ticker Detail, enter `QA0`. Dependencies/browser test setup follow the existing README. This script is test-only and is never bundled. Reproduce isolated smoke with `python scripts/verify-us-ticker-detail-smoke.py --java <JDK-java> --jar target/local-dashboard-0.1.0.jar --csc <Framework-csc> --output <receipt.json>` after Maven verify; it owns only its new TEMP server/home/DB and synthetic source process.

## Remaining limits and stop

Source-separated ticker aggregate only. Formal source reads were already proved in Releases 2A/2B and were not repeated. No Insider repo/DB, installed app/config/shortcuts, Scheduler definitions, Runner config/receipts, previous package images/backups or real listeners were operated on. Broader Performance/Reports/TW/analytics, 4/A reconciliation and PIT remain separate work. Exact SHA review and HANDOFF_DELIVERED are required before the final manager gate; merge/deploy/next Stage require separate authority.
