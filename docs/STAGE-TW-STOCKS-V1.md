# TW Stocks v1 Consumer Integration

Cross-project Taiwan workflow Stage 3; stable Dashboard feature `product-tw`.
Historical Dashboard Stage 3A/3B identities are unchanged. Accepted implementation
`e2bbbd85e6f3f5ac9464e8f0af688c64cc7113a0` is Manager approved; NOT MERGED,
NOT DEPLOYED. The original implementation deferred Design Sync; the separately
authorized consolidated sync and its bounded Manager-requested derived-artifact
correction are recorded at the end.

## Original implementation Plan / Stage / Gate / Self-QA

- Goal: consume saved Taiwan daily observations through source-owned
  `tw-daily-accumulation-v1`, preserving incomplete data and independent identities.
- Base: `9392949d90c0cc0f1f6defb4e9375e4b64f643e2` in
  `Neil1031/local-dashboard`; branch `implement/dashboard-tw-stocks-v1`.
- Source authority: `Neil1031/taiwan-volume-watch` canonical
  `1406ff78d40a748ed9edaada8802354514df593c`; deployed Stage 2 image
  `dad7b4978a4a15823abef641f9440d07bfc0fe11`. Actual installed CLI/exporter bytes
  matched canonical before use. Canonical's older not-deployed wording is
  historical; this assignment explicitly authorizes consuming deployed Stage 2.
- Stage A: dedicated config, fixed process adapter, consumed-field validation,
  allowlisted projection and one bounded latest/exact-date API.
- Stage B: real TW destination, isolated source fixtures, process/HTTP/contract
  tests and actual responsive/keyboard/browser regression.
- Stage C gate: isolated tests pass before the sole formal request; native source
  writers/tasks must be idle. Capture response and protected-state comparisons.
- Done when: candidate source/config/UI/tests pass, exact commit is frozen and
  pushed, PR and complete packet reach the existing management Work with receipt.
- Self-QA: process, exit mapping, null/state/identity/privacy, source-owned facts,
  failure clearing, date/refresh/navigation, mobile/focus and existing regressions.
- Stop: management review; no merge, Design Sync, installed-config edit or deployment.

The original implementation Manager instruction intentionally overrode normal
consolidated design sync timing: only this Stage evidence and necessary fixtures
were updated at that time.
`PROJECT-DESIGN.md`, `DASHBOARD-DATA-CONTRACTS.md`, As-Built, README, owner Google
Doc and generated sample remained untouched in that accepted implementation.
`product-tw` was DESIGNED in that historical snapshot. The current separately
authorized Design Sync below promotes the engineering canonical to PARTIAL.

## Fixed process and configuration

`dashboard.sources.taiwan` contains `enabled`, `python-path`, `cli-path`,
`database-path`, `output-dir`, `timeout-seconds`. Repository/application/bootstrap
example defaults are disabled with empty paths and timeout 10 seconds. No personal
absolute paths are committed. Existing installed config is unchanged.

Reviewed command shapes (argument vectors, never shell strings):

```text
<absolute Python executable> -B <absolute export_tw_readonly.py> --db <fixed configured DB> --output-dir <fixed configured root>
<absolute py.exe> -3.11 -B <absolute export_tw_readonly.py> --db <fixed configured DB> --output-dir <fixed configured root>
# Either shape may append exactly: --target-date YYYY-MM-DD
```

Executable basename is allowlisted and must be an existing absolute executable;
CLI is an existing absolute regular file named exactly `export_tw_readonly.py`.
DB/output paths must be absolute; missing sources are passed to the source-owned
read-only CLI for truthful UNAVAILABLE, never initialized by Dashboard. No .py
association, shell, arbitrary flags, package installation or browser-selected paths.
Python environment fixes UTF-8 and disables bytecode writes.

Bounds: two nonblocking process slots; configured timeout 1–30 seconds; 16 MiB
stdout (full valid source ceiling supported, no JSON truncation); 64 KiB stderr;
bounded drains; strict UTF-8, duplicate keys and trailing tokens rejected. Timeout
destroys descendants and root. Raw stderr is neither interpreted as contract data
nor published. No source cache or stale fallback. Capture code reuses the existing
bounded stream helper; source behavior remains in its own dedicated adapter.

| Exit / stdout | Dashboard behavior |
| --- | --- |
| 0 + valid COHERENT contract | HTTP 200 / COHERENT; business PARTIAL/FAILED remain separate |
| 2 + valid PARTIAL contract | HTTP 200 / PARTIAL; usable facts retained |
| 2 + valid UNAVAILABLE contract | HTTP 200 / source-declared UNAVAILABLE; not empty success |
| 2 + only `error: TARGET_DATE_INVALID` | Safe ERROR / SOURCE_TARGET_DATE_INVALID; not a snapshot |
| 2 + argparse stderr/no contract | Safe ERROR / SOURCE_INVALID_OUTPUT; stderr omitted |
| Unexpected exit | Safe UNAVAILABLE / SOURCE_READ_FAILED |
| Exit contradicts snapshot state | Safe ERROR / SOURCE_INVALID_OUTPUT |
| Unsupported version | Safe ERROR / SOURCE_CONTRACT_UNSUPPORTED |

Disabled, invalid config, concurrency exhaustion, timeout/interruption and process
start failure use safe Dashboard-owned failure envelopes with null sections.

## API and consumed-field boundary

`GET /api/tw/stocks` means LATEST_FINALIZED; only optional single
`?date=YYYY-MM-DD` means TARGET_DATE. No pagination/range/extra parameters.
Invalid, impossible, whitespace/noncanonical, year-zero or repeated dates and
unknown query parameters return HTTP 400 with `TARGET_DATE_INVALID` before adapter
invocation. Responses set `Cache-Control: no-store`.

Envelope:

```text
contractVersion: 1
sourceContractVersion: tw-daily-accumulation-v1
dataState: COHERENT | PARTIAL | UNAVAILABLE | ERROR
observedAt: Dashboard completion time
generatedAt: source export time (nullable on adapter failure)
query: {mode, targetDate}
snapshot: {state, readOnly, reasonCodes, readStartedAt, readFinishedAt}
scope: {state, mode, startDate}
latestAttempt: {runId,state,status,createdAt,startedAt,finishedAt,scheduledDates,businessFinalized}
latestFinalized: {runId,targetDate,finishedAt,status}
observation: {runId,targetDate,finishedAt,status,identity,classificationStatus,strategyStatus,
              sources,markets,baselineSessionDiagnostics,mappingDiagnostics,readiness,candidates,candidateSummary}
responsibility: {state,pendingCount,unfinishedCount,truncated,pendingRevalidation,unfinishedRuns}
weeklyCheck: {state,checkRunId,checkedAt,weekStart,weekEnd,status,problemCount,dayStatusCounts,
              pendingRevalidationCount,unfinishedRunCount,binding,pointerState}
warnings: safe codes
```

`TwStocksProjection` validates consumed fields only and explicitly constructs each
section, without duplicating the complete canonical source schema. Fixed enums,
aware real timestamps/canonical dates, IDs, finite numbers, bounded collections,
query identity, run/date/finished/status agreement, source/candidate duplicates,
candidate count/truncation, blocked mapping symbols, public-info consistency,
responsibility null totals and weekly Mon–Fri identity are checked. Critical extra
identity fields fail closed. Unexpected non-consumed payload/path/host/PID/trading
fields are omitted. Unexpected path-like stock text is redacted and adds
`SOURCE_TEXT_LOCAL_PATH_REDACTED`. No raw JSON/payload proxy or private SQLite read.

Latest attempt and saved finalized observation stay distinct. A newer failed
attempt does not replace or relabel an older finalized observation. A valid scope
survives an absent observation. Weekly check IDs are a separate namespace;
SELECTED_RESULT is displayed only when the source explicitly supplies that binding.
Independent/unknown weekly summaries remain visibly unbound; weekly FAILED never
erases daily facts. Snapshot COHERENT is not business SUCCESS/completeness/maturity.

## UI semantics

`ui/tw-stocks.mjs` supplies source banner, Daily Observation, accumulation/readiness,
source completeness, candidates/watchlist, responsibility and Weekly Check within
the existing nine-page pink shell. Only the source-export candidates are displayed;
no master remap, active-signal joins or local candidate reconstruction.

Saved vs source-export vs Dashboard-read times are labelled separately. Baseline
READY/INSUFFICIENT_HISTORY/BASELINE_SESSION_GAP and legacy unavailable diagnostics
remain saved source facts; counts/dates are not recalculated. Unmapped symbols,
source-backed exclusions, market completeness and candidate facts remain separate.
Missing journal is UNKNOWN, not zero pending. Truncated responsibility totals stay
null; bounded returned pending facts are retained.

Anomaly score is labelled source anomaly score, never investment/buy/recommendation
score. Daily analysis eligibility is null / NOT_APPLICABLE_DAILY_OBSERVATION; no
misleading eligibility column. Public-info SUCCESS is explicitly a source check,
not analysis completion or suitability. Zero candidates under WARMING_UP explicitly
cannot mean no anomaly. PARTIAL retains valid facts; UNAVAILABLE is not empty success.

First visit loads latest once. Explicit refresh deduplicates in-flight requests;
exact-date Apply/Latest cancel older requests, and latest response wins. Navigation
back to a completed view makes no implicit request; leaving a pending view aborts
it. No automatic polling. Loading and failures clear stale facts/cards/detail.
DOM text only, no HTML injection or executable links. Native candidate dialog
supports Tab/Space/Enter, visible focus, Escape and trigger-focus return.

## Verification on accepted implementation content e2bbbd85

| Check | Actual result |
| --- | --- |
| Maven clean verify | 241 tests, 0 failures/errors/skips; actual Projects Spring/browser smoke enabled |
| Taiwan backend focused tests | 12 PASS; real child bounds/timeout/concurrency and actual Python ProcessBuilder included |
| Normal Node/frontend/browser regression | 132 tests: 128 PASS, 0 FAIL, 4 pre-existing opt-in SKIP |
| TW Node + browser subset | 15 PASS, including 1280/375/320, actual Tab/Space/Enter/Escape/focus, safe text, stale clearing, dates, warming, nulls and no auto polling |
| Generator --check | PASS; existing 33-ID design sample unchanged |
| Spring/resource and isolated JAR static parity | Exact index/dashboard/shell/TW module bytes served; PASS |
| git diff --check | PASS |
| Visual Self-QA | Actual 1280/375/320 page PNGs and 375 dialog inspected; synthetic-only, no horizontal overflow |
| Management preview QA | Management independently operated 1280/375/320 and keyboard/date/dialog behavior; no blocking UI findings |

The four opt-in Node skips are installed/bootstrap real-collector acceptance,
packaged actual-list refresh, persisted live History, and packaged Settings. Their
endpoint env vars were not set; no installed-version QA is claimed. All ordinary
fixture/browser regressions (US Signals/SEC/Ticker Detail, Reports, Shell/Overview,
Projects, Automations/History/Settings) ran. No tests were weakened. The pre-existing
Projects status test omitted the already approved Release 2D reports promotion;
it now allows precisely that existing promotion and asserts all status counts and
TW's still-DESIGNED canonical status. Source/schema/exporter are read-only.

Source fixture provenance: canonical exporter ran against TEMP synthetic
SQLite/journal/immutable weekly files from its source-owned test Fixture; frozen
clock 2026-09-25 yielded schema-valid COHERENT while saved daily was PARTIAL and
weekly FAILED. Input files' hashes stayed unchanged. Management independently
validated the committed fixture against the canonical Draft 2020-12 schema.
No formal data or private paths are in that fixture.

An actual unmodified `TaiwanStocksAdapter.start` test invokes a TEMP fixed Python
CLI, checks argv/environment/-B/UTF-8/no bytecode, retains existing fixture bytes
and creates neither missing DB nor output directory. The separate candidate-JAR
smoke below additionally exercises deployed `py.exe -3.11 -B` and actual source CLI.

## Isolated candidate JAR and sole formal smoke

Candidate JAR SHA-256:
`5926eef44ea5f11cabb3326077568a7d6ca627734e20213ec48cd41aa6eb2b1a`.
All final runtime source/UI bytes match the source/resource chain tested and
served by this JAR. Later Stage evidence does not alter runtime content.

Before formal reading, that JAR ran on an ephemeral loopback port with TEMP
Dashboard DB/config and actual deployed exporter pointing at TEMP synthetic
source files. Latest and exact-date calls returned 200/PARTIAL with one candidate,
saved daily PARTIAL, independent weekly FAILED/SELECTED_RESULT and WEEKLY_STALE.
Year-zero request returned 400. All synthetic source hashes stayed unchanged.
Owned backend was identity-checked and stopped. This is isolated wiring evidence.

Exactly one formal `GET /api/tw/stocks` was then made through the same candidate
JAR/adapter on 2026-10-03 approximately 01:04 Asia/Taipei. The source CLI was invoked
once, using deployed Python launcher/CLI and already existing source DB/output.
No other formal DB/query/CLI read followed. Captured API and before/after inventories
remain in TEMP for management review; private absolute paths and Task XML are not
committed. Management reviewed the captures, without a second formal source read.

| Sole formal result | Actual saved source truth |
| --- | --- |
| HTTP / cache | 200 / no-store |
| Snapshot / dataState | PARTIAL |
| Selected target | 2026-10-02 |
| Saved daily status / classification | PARTIAL / WARMING_UP |
| Exported candidates | 0; cannot be interpreted as no anomaly |
| Safe reasons | LEGACY_DIAGNOSTICS_UNAVAILABLE |
| Latest attempt status | PARTIAL; distinct attempt identity/times preserved |
| Weekly status / source binding | FAILED / SELECTED_RESULT |
| Consumer compatibility | PASS: valid partial data and meaning preserved |

Formal protection: immediately before the read, zero native writers; source Tasks
Ready/Ready/Disabled/Disabled. Before/after 675 installed source files' bytes/size/
mtime, 522 data/output metadata entries, DB and journal family bytes/size/mtime
and sidecar absence, four Task definition XMLs, canonical HEAD/clean status all
matched. No source creation/write, Task trigger, provider/scanner, notification,
journal repair, source deployment/config edit or installed Dashboard mutation.
Owned formal backend PID was identity-checked and stopped; ephemeral listener
released. The separate owned synthetic preview helper was retained for management
QA, then identity-checked and stopped after review; its listener was released.

This is contract consumer compatibility, not Stage 1 natural-writer acceptance,
market completeness, recommendation, future stability or installed Dashboard QA.
The weekly binding differs from the older Stage 2 smoke because the current source
explicitly returned SELECTED_RESULT; Dashboard did not infer it from dates.

## Boundaries and handoff

No Taiwan source code/schema/DB change; no other stocks repository integration;
no Performance, TW Reports, Data & Evidence panel, Overview stock metrics, cache,
history table, background sync, Scheduler/Runner/receipts write, shortcut edit,
installed configuration, deployment, merge or next Stage. Repository defaults
remain disabled; this feature needs a later explicitly authorized config/deployment.

Full handoff includes exact candidate SHA/base/remote/clean state, PR, API/command/
config, tests, synthetic PNGs, captured formal response/protection and known limits.
The existing management Work independently reviews and owns
`READY_FOR_MANAGER_REVIEW`; Sol does not self-approve.

## Consolidated Design Sync c8856a6 (2026-10-03)

Separately authorized scope: existing PROJECT-DESIGN, Data Contracts, As-Built,
README's materially false active TW status, this bounded evidence appendix, and
the same owner Google Doc. Accepted implementation remains
`e2bbbd85e6f3f5ac9464e8f0af688c64cc7113a0`, Manager approved / NOT MERGED /
NOT DEPLOYED. Historical docs-only commit
`c8856a6b1154ebbfd143417bb2ebec708486c562` directly parents accepted implementation
e2bbbd85. The bounded correction below directly parents c8856a6; it is part of this
same Design Sync, not a new Stage. No merge or deployment.

Canonical parser check: 33 stable IDs; only `product-tw` DESIGNED → PARTIAL.
All other 32 complete feature rows remain byte-identical. Counts: DONE19,
PARTIAL6, BACKEND_READY3, DESIGNED2, NOT_STARTED2, BLOCKED1; other states zero.
Broader Taiwan roadmap remains incomplete. Historical Local Dashboard Stage
3A/3B and original AIStockHunter inventory/plans are retained, with their
historical role distinguished from current Taiwan Volume Watch integration.

Current architecture/API/exit-2 meaning/independent identities/null/privacy,
seven UI areas and sole formal captured result are now in the existing
engineering sources. Source canonical main and deployed image provenance remain
separate; intentionally dirty installed Git checkout is not called clean main.
Source contract owns selection and saved semantics; no direct private data reader.

Owner Doc remains `1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs`, tab `t.0`.
Fourteen unique existing paragraphs were changed under requiredRevisionId;
no new document/tab/paragraph or chapter was created. Existing TW locations show
implementation Manager-approved, main integration unchecked and deployment
unchecked, with Performance/TW Reports/Data & Evidence/future range work retained.

- Native revision before:
  `ANLCKQm_RvFECoGaDpCWceH3ktoCMtQn7bUnbRK3yP71Z1dHqhTBgxdSVedv731cm6290Kov3xfaDF6We63h7qNSwuSRSSfk0ZePNeNKWj0`
- Native revision after:
  `ANLCKQmBiEGvvdnEqvblxPQ5FAVmbU0ZEl1sTCyWx44yI0d6SqKaY3HuV8NII4sGUiLWpc9R_Z9QpEv8l-Qym0HRbM93BBE4WoktsC_k0fs`
- Full trusted/native before and after: 770 paragraphs each, 14 intended text
  replacements, 756 other paragraphs unchanged after compensating shifted indexes.
- All 24 H1 and 52 H2 texts/order/styles retained; tab topology, paragraph/text
  styles, hanging indentation, native lists/link/object fields and out-of-scope
  content identical. Readback has no protected controls, native link runs or
  native bullet paragraphs; existing literal lists/URLs remain preserved.
- Drive sharing/owner/parent metadata is exactly identical. No Taiwan owner Doc
  update. Visual/PDF QA was neither performed nor claimed for this targeted edit.

Historical c8856a6 proof captured all 216 non-doc tracked file blobs against
accepted implementation, including then-unchanged tests/generated sample, and
verified all other 506 tracked blobs/modes. That equality belongs to c8856a6 only.
The current correction explicitly changes the generated sample and one canonical
status test; it does not claim ALL non-doc bytes remain unchanged. Java/UI/runtime,
config/parser/fixtures/other tests and canonical design remain accepted content.
Git canonical blob bytes and raw Windows LF/CRLF working hashes are distinguished
in private evidence. The 241 Maven / 132 Node results and generator PASS in the
implementation section remain historical e2 evidence, not fresh correction tests.

Manager requested a bounded canonical-derived consistency correction, superseding
the earlier stale-sample/test timing rationale. Canonical PROJECT-DESIGN is the
authority: the existing generator now updates its sample, and the first Projects
test now includes the approved product-tw DESIGNED → PARTIAL promotion. Current
generator/test parity is recorded below. Earlier docs-only artifact timing wording
describes c8856a6, not the corrected final branch. No Google Doc write, new formal
source read, package generation, full Maven or browser campaign is part of this fix.

Remaining: independent exact-SHA Design Sync review, separately authorized Git
closeout/deployment, and later bounded Taiwan features. Sole formal captures are
reused without a second source read. No Taiwan repository/runtime/config/data,
Dashboard installation, shortcut, Scheduler/Runner/receipt or provider mutation.

## Bounded Manager consistency correction (2026-10-03)

Direct parent: `c8856a6b1154ebbfd143417bb2ebec708486c562`. One correction commit,
same branch/worktree/PR14. Allowed changes only this Stage evidence,
`design/prototype/project-design-sample.js` (existing generator, no hand edit),
and the first canonical-status test in `tests/projects.test.mjs`. Existing exact
33-ID order, baseline status checks for every other feature, nonempty fields,
parser validation and all other assertions remain intact. The approved promotions
are shell/overview/us/reports/tw; product-tw is PARTIAL. Exact counts are DONE19,
PARTIAL6, BACKEND_READY3, DATA_READY0, DESIGNED2, IN_PROGRESS0, NOT_STARTED2,
DEFERRED0, BLOCKED1, DROPPED0.

Fresh targeted verification on correction content:

| Check | Actual result |
| --- | --- |
| Existing generator `--check` | PASS; generated sample equals unchanged canonical, 33 IDs |
| `node --test tests/projects.test.mjs` | 4 PASS, 0 FAIL, 0 SKIP |
| `mvnw.cmd -B -Dtest=ProjectsResourceHttpTest test` | BUILD SUCCESS; 3 total, 2 PASS, 0 failures/errors, 1 existing conditional SKIP |
| `git diff --check` | PASS |

Maven used the environment-equivalent existing wrapper with JDK25; PROJECTS_NODE
was unset only in that invocation. The third existing opt-in browser smoke remained
skipped normally; no Maven-test edit or browser campaign. The two executed tests
verified current canonical/resource bytes through isolated loopback Spring HTTP
and restricted named-resource access, with collector/metadata mocked and TEMP DB.
This test phase copied current canonical into test resources; it did not package
or deploy a JAR. Existing candidate JAR SHA-256 remains
`5926eef44ea5f11cabb3326077568a7d6ca627734e20213ec48cd41aa6eb2b1a`.

All 214 protected non-doc files (the prior 216 minus the authorized sample/test)
retain exact raw working SHA-256 and Git canonical bytes from accepted e2/c885
evidence. Java/UI/runtime/config/parser/fixtures/other tests are unchanged.
Canonical and all other engineering docs outside this Stage remain c885 content.
The only Projects test edits are its first test name and three expected-value
lines; other test bytes/assertions remain unchanged. Generator uses unchanged
canonical/parser; no hand editing of sample.

Private fresh logs: `.tools/tw-correction-generator.log`,
`.tools/tw-correction-projects-node.log`, `.tools/tw-correction-projects-maven.log`;
Maven XML: `target/surefire-reports/TEST-io.github.neil1031.dashboard.ProjectsResourceHttpTest.xml`.
Private runtime and model proofs are `.tools/tw-correction-runtime-proof.json` and
`.tools/tw-correction-model-proof.json`. These fresh targeted results are distinct
from historical e2 full-suite evidence. Google Doc is not written; its accepted
revision remains the one recorded above (management's fresh metadata confirms).
No additional Taiwan source/DB read, Task/Runner operation, merge, deployment or
new Stage. Final correction still requires independent exact-SHA review.
