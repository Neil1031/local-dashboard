# Taiwan Data & Evidence v1 — implementation-only Stage

Baseline: Dashboard main `7a2f9c45968fa970632d8a748492a8c7db50c8e1`;
Taiwan canonical `95071c2b9383a8d143dcfd107edd2d1050130462`.
Branch `implement/dashboard-tw-data-evidence-v1`, dedicated worktree
`F:\AI workspace\local-dashboard-tw-data-evidence-v1`.
Existing management/Sol Works are reused; no subagent/new Work.

## Plan / Stage / Gate

Goal: explain why Taiwan source results have their observed state, through real
normalized evidence, without creating another selection/research page.

Scope:

1. Replace the Evidence placeholder with four distinct areas: Evidence Sources,
   Current Daily Evidence, Completeness/Readiness/Responsibility, Report Evidence.
2. Reuse unchanged `readTwStocks` and `readTwReports`; presentation only follows
   their validation. Add `ui/evidence.mjs`, shell wiring, safe internal navigation,
   compact cards/native diagnostic details, responsive and keyboard behavior.
3. Implement one generation-controlled drain queue: Stocks fetch **and JSON body**
   settle first, then independent Daily/Weekly LIST calls run concurrently.
4. Exercise meaningful pure/browser/race/privacy cases, existing Taiwan/shell
   regressions, ordinary full Node/browser and full Maven clean verify; use only
   synthetic fixtures and byte-exact previously saved captures.
5. Commit/push an exact candidate, create/attach draft PR and deliver to the existing
   management Work for independent exact-SHA review. Stop at implementation handoff.

Dependencies: existing Taiwan normalized APIs/source contracts, unchanged backend
adapters/projections/shared Semaphore2, current shell/static resource mechanism.

Gate / Done when: all four areas work; independent source identities/states, null,
UNKNOWN, zero, WARMING_UP and saved FAILED survive; no DETAIL/autopoll/private read;
Stocks failure still permits reports; stale responses never overwrite the newest
matching load; no more than two Evidence-owned browser reads remain unresolved,
including old Refresh generations; 1280/375/320 keyboard/overflow/race and existing
regressions pass; exact candidate is pushed/clean, protected evidence recorded.

Self-QA: code/diff review, strict parser reuse and explicit field allowlist, controlled
fetch/body-promise tests, real fixture-browser interactions/screenshots, regression
logs, packaged-static resource assertion, generator/diff checks, protected before/after
identities, native owner Doc fingerprints, replay receipts and complete handoff.

No Design Sync, merge, deployment, Windows package, installed start/stop, new formal
source/API/CLI/DB read, source/runtime/Task/Runner/receipt/config mutation, next Stage,
or owner Doc write. A scoped existing Java **test** adds the new static module URL;
there is no backend product code/config/POM/adapter/projection change.

## Architecture and exact API ownership

`source contracts → existing adapters/projections → normalized APIs → existing
parsers → explicit Evidence presentation`.

| Evidence-owned request | Query / sequence |
| --- | --- |
| `GET /api/tw/stocks` | Latest selection only; no date/range; Wave 1 |
| `GET /api/reports/tw?type=daily&limit=1&offset=0` | Daily LIST, Wave 2 |
| `GET /api/reports/tw?type=weekly&limit=1&offset=0` | Weekly LIST, Wave 2 |

Every browser request uses `cache:no-store` and `redirect:error`. There is no
EvidenceController/Adapter/DB/cache/new source contract, arbitrary private file path,
raw JSON view, source invocation vector or report DETAIL auto-fetch. Full reports
belong to Reports; candidates belong to TW Stocks. Safe links use only `#tw`/`#reports`.
Normal navigation to those existing pages retains their own API behavior/ownership.

The existing Maven `ui/*.mjs` resource include already packages the module; fixture
servers explicitly add its route. `ProjectsResourceHttpTest` verifies actual HTTP
static bytes against the checkout, without changing backend product behavior.

## Loading, cancellation and return policy

A single drain loop owns network work across generations. Refresh increments the
presentation revision, clears prior results, aborts old browser signals and coalesces
queued refreshes to the newest request. It **awaits actual old fetch/body promise
settlement** before starting the next cycle, even when a fetcher ignores abort.
An abandoned Wave 1 does not start reports. An abandoned Wave 2 waits for both old
report promises. Headers alone do not release Wave 1. Current Stocks HTTP/parser/JSON
failure settles into its own ERROR presentation and still starts Daily/Weekly.
Reports complete/render independently; one failure never erases another valid source.

Entering loads once. Returning to a completed view retains that bounded observation
and requires explicit Refresh for another read. Leaving an incomplete view invalidates
and clears its presentation/cache; returning queues one new cycle behind unresolved
old work. Loading/failure does not retain old facts. There is no polling or persistence.
Native details on already rendered Stocks remain usable while report responses settle.

Each read has its own 35-second browser abort timer, so one report timeout does not
abort the other. The scheduler does not race a timeout against an unresolved request
and then pretend the request settled. The maximum of two applies to Evidence-owned
browser reads, including old generations, not other pages/clients or source children.
Browser abort does not prove the server/source child stopped; external source capacity
and truthful SOURCE_BUSY remain owned by existing backend semantics.

## Presentation / source truth

- Sources: independent TW Stocks, TW Daily Reports, TW Weekly Reports; contract,
  dataState, generated/observed times, selected identity, envelope warnings.
- Daily: query/snapshot/reasons/read times/scope, separate latest attempt and finalized,
  selected run/date/saved status/classification/strategy. Valid scope/responsibility/
  Weekly survive an absent observation.
- Diagnostics: source headers and TWSE/TPEX completeness, readiness/skipped counts,
  warming symbols, baseline/mapping/exclusions/unmapped symbols, saved/exported
  candidate summary, responsibility totals/truncation/bounded returned records, and
  independently identified Weekly Check state/saved status/counts/source binding.
- Reports: first item of each LIST observation; its report/run identity, dates,
  saved/checked time, saved business status and source facts; envelope and item warnings
  are separate. Weekly LIST provides `problemCount`, not problem contents; the page
  shows that count and directs full content ownership to Reports instead of fetching
  DETAIL. No source state is folded into a synthetic aggregate.

All dynamic nodes use safe DOM text, never HTML interpretation. Only named facts are
rendered; unknown fields, database/output/CLI paths, raw config/stderr/host/PID are not
published. Public diagnostic tokens/timestamps/nullable scalars have bounded safe text
formatting; IDs have a separate public identity formatter; free-form warnings are
replaced with a nondisclosing message. Diagnostic detail rows/displayed symbol lists
are limited to the first 100 returned entries with truthful response-count wording.
No candidate-detail/research duplication or private filesystem links are introduced.

COHERENT/PARTIAL are not SUCCESS; null/UNKNOWN are not 0/NO. WARMING_UP + zero
candidates explicitly does not establish no anomaly. Source SUCCESS does not prove
market completeness; candidate is not buy, anomaly score is not investment score.
Latest attempt/finalized, Stocks observation/Daily report/Weekly report and their times
remain independent. Overlapping dates do not establish atomic/PIT linkage. Weekly
saved FAILED does not fail usable Daily facts. Bounded LIST is not complete history.

This first Taiwan slice does not finish broader Evidence. Schedule Versions,
Correlation, Runner aggregation, US Evidence, history/range, Taiwan Performance and
broader research analytics are explicitly outside scope. Canonical `product-evidence`
remains DESIGNED, all 33 IDs/statuses and the existing generated sample remain unchanged.
The later owner-authorized combined closeout would change only its status to PARTIAL;
this Stage does not perform that closeout or edit canonical/Google Docs.

## Verification evidence

Private evidence is stored in this worktree's ignored `.tools/evidence/` directory.
Synthetic fixtures are the existing isolated source-derived Taiwan fixtures. Saved
test evidence replay copies the prior normalized TW Stocks GET and TW Daily/Weekly
LIST captures byte-for-byte; original dates, timestamps, states and IDs are retained.
The replay banner explicitly identifies saved test evidence, not a new observation.
`replay-manifest.json` records original/copy hashes and prior packet identities; Reports
capture hashes also match their frozen implementation artifact manifest. The Stocks
historical receipt identifies the prior sole request; its raw capture hash is measured
here, without inventing a previously recorded hash absent from that receipt.

Final executed totals, protection result, exact SHA/draft PR and handoff identity are
recorded in the private final packet; this implementation Stage is not self-approval.

### Executed Self-QA — 2026-10-03

- Evidence pure tests: 22 PASS; Evidence browser tests: 12 PASS. Targeted Evidence +
  existing TW Stocks/TW Reports/shell campaign: 66 PASS, 0 failures/skips.
- Final saved-capture replay browser campaign: 12 PASS, 0 failures/skips. Original
  Stocks observed time `2026-10-02T17:04:23.118012500Z`; Daily/Weekly LIST observed
  times `2026-10-03T12:17:45.674272100Z` / `2026-10-03T12:17:46.080439900Z` remain
  unchanged. These are historical saved observations, not this Stage's formal reads.
- Ordinary full Node/browser: 194 total, 190 PASS, 4 **existing** opt-in live tests
  not executed, 0 failures; no new skip. Full Maven clean verify: 273 PASS, 0 failures,
  errors or skips, BUILD SUCCESS. Campaigns ran serially to avoid shared target cleanup.
- Generator check: unchanged canonical 33-feature sample PASS; diff check PASS.
  New static module is checked by actual isolated Spring HTTP resource parity.
- Real fixture-browser 1280/375/320 coverage includes safe source cards, wrapped IDs,
  native details via Space/Enter, Tab/internal navigation, usable Refresh while pending,
  independent failures, null/zero/FAILED, no whole-page horizontal overflow and
  controlled old-wave races. Six synthetic screenshots plus saved replay screenshot
  are private; desktop/320 readiness images were directly visually inspected.
- Protected before/after snapshots are **exactly equal**: Taiwan deployed runtime112,
  source705, source config/Git/full data/output metadata/eight opaque formal file hashes,
  Task definitions/state, installed Dashboard225, external home6764 including config/
  history/Runner receipts, both shortcuts, Python identity and canonical refs.
  No DB query was performed. Owner's existing installed process at 43871 is RUNNING
  before/after with the same PID/identity; this Stage did not start/stop or access it.
  No 8080 product listener is present. No ambient protected drift was observed.
- Both owner Docs have equal before/after native content fingerprints; zero writes.
  Canonical docs/sample, existing parsers and all backend product bytes remain unchanged.

The first browser trace assertion was installed after the page had already bound its
fetcher, so its instrumentation recorded no requests. Moving trace setup before mount
corrected the harness; no product workaround was needed. That initial log is retained.
Windows Maven uses the existing unmodified SysWOW64 wrapper/JDK25/nonfork explicit
test/classes classpath strategy; no system, registry, wrapper or POM changes.


## Authorized consolidated Design Sync — Gate A

Taiwan Data & Evidence v1 實作 `04f67e9c41085b7ff196b50eac1ca331251cb2d7` 已獲 Manager 核准；本次 consolidated Design Sync 完成，main integration／production deployment 待後續已授權 gates。只將 `product-evidence` DESIGNED→PARTIAL，33 stable IDs 與其他32 statuses 保留；product-tw／product-reports／product-performance 仍 PARTIAL。Taiwan-only 第一切片不是整個跨來源 Evidence 完成，Schedule Versions／Correlation／Runner aggregation 仍未接入。

Localization / i18n（zh-TW default、en）→ Taiwan History / Range → Taiwan Performance；localization 尚未實作。完成 i18n Stage 後，所有新增 owner-facing UI 必須使用 common i18n resource layer，不再加入 hard-coded user-visible strings。獨立 `chore/i18n-seed` 分支留給下一 Stage，本次不 merge／consume／touch，也不新增 localization stable feature ID。

Canonical architecture/contracts/Design Space/current wording and generator sample are synchronized; only product-evidence is promoted. Accepted implementation/runtime source bytes stay exact to04f67e9c. Coupled canonical assertions alone may change. Gate A owner Docs mark implementation/Design Sync checked and main/deployment unchecked, with fresh native revision guard/readback. Actual Gate A validation and Docs evidence live in the combined private operations packet. Gate B/C remain unexecuted at this documentation commit; no postdeployment status-only Git commit is needed. Installed image/config/home/source/Tasks untouched during Gate A; no new formal read.
