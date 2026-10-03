# Release 3A — Insider Performance v1 consumer

Current follow-up: implementation `96b15c8caf0ed0fc64e307a77c95de3e460e20ce` has passed Manager approval. The subsequently authorized consolidated Design Sync promotes only `product-performance` to PARTIAL; Git closeout/main integration and deployment remain pending. The implementation-phase record below retains its original gate/status/evidence; the later sync is recorded at the end.

Implementation handoff evidence, 2026-10-03 Asia/Taipei. Awaiting independent management and Manager review. NOT MERGED / NOT DEPLOYED. Canonical `product-performance` remains DESIGNED; no Design Sync in this implementation phase.

## Plan / Stage / Gate

- Goal: consume stored active Insider AI-report Performance through its three reviewed read-only CLI operations; present Summary / Signal Detail on the existing Performance destination.
- Scope: Dashboard shared bounded process mechanics, fixed Performance adapter/projection/API/UI, isolated contract/process/HTTP/browser regression, sole authorized formal compatibility set, feature branch/PR/handoff.
- Baseline: Dashboard `bce84c4506e3e94d7b69eac6bf92679d1f1fd49d`, branch `implement/dashboard-performance-v1`. Source read-only main `231638f2efaed69755f1534a4c651630afaf896a`; Performance contract merge `fdd7fa5e0dc762d130c86a3c980863be29eeb392`, version1/source=performance.
- Dependencies: existing `dashboard.sources.insider` configuration and source-owned `docs/PERFORMANCE_CONTRACT.md` / `performance/reader.py` / CLI read-only routing. All current required engineering references and owner sections1–41 read.
- Gates: source static preflight; isolated targeted/full tests; source safely readable under v1 contract; single formal operation set; exact candidate commit/PR and clean handoff.
- Done when: fixed source-owned reads, source identity/null/zero/status/snapshot truth, bounded transport/pagination, safe accessible UI, existing behavior regressions and full gates pass, protected invariance, reviewable PR. Self-QA results below.
- Exclusions: Taiwan/SEC/portfolio Performance; source SQL access/calculation/writers/prices; ranking/recommendations/trading/statistics; automatic refresh/persistence/freshness; Overview/Ticker Detail integration; installed package/config/shortcuts/Task definitions/Runner/receipts mutation; source changes; canonical design/README/generated sample/Google Docs changes; merge/deployment/next Stage/new Work/subagent.

## Architecture and existing-source compatibility

`BoundedSourceProcess` is package-local pure transport: no-shell ProcessBuilder, reviewed Python no-bytecode/UTF-8 environment, stdin close, concurrent bounded stdout/stderr draining, timeout, strict UTF-8, interrupt-safe cleanup. It returns raw exit+bytes; source-specific argv, limits, states and validators remain in their adapters. Limits remain Insider2MiB/64KiB, Taiwan16MiB/64KiB, configured1..30s, two bounded stream joins. Cleanup captures descendants before parent termination and waits at most300ms for parent plus300ms for descendants to avoid asynchronous OS termination races; it does not claim universal process-group/job-object supervision of already detached descendants.

Existing `InsiderSignalsAdapter` keeps its original Semaphore2 across Signals/SEC/Reports/Ticker operations. Performance borrows the same instance's acquire/release, adding no new pool/config. Taiwan retains its separate Semaphore2. Existing argv, normalization, failure vocabulary, source observations and Taiwan valid0+COHERENT / 2+PARTIAL / 2+UNAVAILABLE logic are unchanged. The shared runner contains no nonzero-exit business policy. Existing adapter regression32/32PASS, including Taiwan exit2/tree cleanup and shared Insider contention. Dedicated transport tests verify stdin/environment/rawexit2 and confirmed descendant+parent termination on timeout and interruption. Performance tests verify cross-operation contention and release/interrupt semantics.

Two management findings fixed during implementation: an initial Windows-default text decoding drift in the SEC label was restored from exact Git UTF-8 bytes, with explicit UTF-8 rewrite and bounded diff; replacing a pending list request now also replaces an unfinished Summary, avoiding permanent Loading after ticker Apply. A held-summary→Apply browser regression verifies the final Summary remains unfiltered. Test harness CSS selectors beginning with numeric horizons were quoted; navigation while a native modal is open uses actual location/hash navigation, rather than clicking its inert background. Initial failing logs remain private; final full regressions below supersede them without weakening assertions.

## APIs and exact semantics

All successful, failed and invalid defined operations return `Cache-Control: no-store`:

- `/api/performance/summary`: horizon default3m; 1d/1w/1m/3m/6m only. Optional decimal finite0..100 minInvestment/minSignal; null means absent, explicit0 is preserved. Fixed `read-performance-summary --horizon h [--min-investment n] [--min-signal n]`.
- `/api/performance/signals`: horizon default3m, optional exact case-sensitive ticker without trimming/case normalization, limit default20/range1..100, offset0..1,000,000. Fixed `list-performance --horizon h --limit n --offset n [--ticker exact]`. At the Dashboard offset cap, pagination ends with PAGINATION_BOUND_REACHED.
- `/api/performance/detail`: required exact `report:YYYY-MM-DD:ticker`; fixed `get-performance --signal-id id`. Same ticker on a different report date remains distinct. Nonzero detail read is UNAVAILABLE, with no fallback probe/retry or invented NOT_FOUND.

Prefix is the existing trusted owner CLI plus `--db` and configured DB. Extra/multiple/empty params, invalid dates/horizons/thresholds/IDs/paging fail400/INVALID_PERFORMANCE_QUERY before invocation. Ticker accepts a bounded256-character exact component, rejects whitespace/control/colon/path separators. No browser-selected executable/path/source/options. No source SQLite/JDBC/Python-module access from Dashboard; source owns mode=ro/query_only/schema2/WAL refusal/no initialization.

Projection allowlists fields into contractVersion1/sourceContractVersion1/source=performance/dataState/observedAt/provenance/warnings. READY/EMPTY only for valid source output; unsupported source/version, disabled/unconfigured/busy/timeout/nonzero are safe UNAVAILABLE; malformed UTF-8/JSON/fields/output bounds are safe ERROR. No STALE or invented PARTIAL. Successful source observation stays null on failures. Strict duplicate/trailing JSON checks; paths in consumed text/identity are rejected and unused private fields omitted; stderr never exposed.

Summary preserves source order `<85`, `85-89`, `90-94`, `95+`, `UNSCORED`, all five including empty buckets, and supplied aggregates/status counts. Source-generated synthetic fixtures exercise fractional84.999/85/89.999/90/94.999/95/null boundaries using the unchanged source reader and an in-memory synthetic DB, never the formal DB. Dashboard checks consumed types/count coherence, never recomputes buckets/returns/wins. Observed means stored non-null requested-horizon tradable return;0 is observed and not a win. Observed0 means null average/win rate. UNSCORED means null Investment Score. Stored status counts cover the same filtered active population and are distinct from horizon maturity.

List retains exact signal/report/ticker/company/discovery/imported-score identity and performanceStatus/asOf/missingSessions/snapshot/horizonObserved. horizonObserved means snapshot EXISTS, not usable tradable return. Snapshot-saved/null-return, absent snapshot, real zero return and NOT_COMPUTED with snapshots are distinct. Pages are bounded current-state observations with no total/PIT-token or all-pages fetch.

Detail retains signal/performance/all existing snapshot types in fixed order. COMPLETE/PARTIAL/PENDING/NOT_COMPUTED meanings remain source-owned; NOT_COMPUTED has null metrics/times and empty gaps but may coexist with snapshots. PARTIAL may have entry gaps with no listed dates. Missing sessions are exact source dates; contradictory known gaps in COMPLETE/PENDING/NOT_COMPUTED fail closed. Zero/null excursion and integer time-to metrics remain distinct. Missing snapshot types are omitted; price is positive finite; both discovery/tradable return bases remain independently nullable, with timestamp/provider/priceBasis/createdAt. No price-derived calculations or time-based maturity inference.

## UI and verification

Existing shell mounts `ui/performance.mjs` only for its existing destination. Five horizons, five bucket cards, stored status counts, source/version/observation banners, manual Refresh, bounded list-only exact ticker filter and Previous/Next, native Signal Detail dialog. Summary is unfiltered by ticker and has no hidden85 threshold. Loading/failure clears stale facts; latest response wins; explicit Refresh deduplicates pending reads; completed return navigation does not implicitly re-read; leaving aborts pending presentation. Browser abort does not prove cancellation of an already running server read.

DOM text only; Unicode/HTML-looking source content remains inert. Native keyboard Space/Tab/Escape/focus-return verified at1280/375/320, no horizontal page overflow. Methodology is visible: discovery previous completed regular-session close proxy before assumed publication; first regular-session open at/after publication;1d close/open;1w first session on/after+7calendar days;1m/3m/6m calendar-month targets. Yahoo split_adjusted_ex_dividends excludes dividends/fees/taxes/slippage; daily bars do not establish intraday threshold order or actual execution. Current imported scores are not reconstructed historical PIT scores; repeated report signals may be correlated observations, not independent trades/realized portfolio returns.

Final self-QA:

| Check | Result |
| --- | --- |
| Existing Insider/SEC/Reports/Taiwan targeted adapter regression | 32PASS/0fail/0error/0skip |
| Performance backend projection/argv/process/query guards | 14PASS/0fail/0error/0skip |
| Dedicated transport characterization | 3PASS/0fail/0error/0skip |
| Actual random-port Spring Performance HTTP + resource chain | Included in full Maven; temp Dashboard DB and mocked source/collector, no formal reads |
| Final Maven `clean verify` (JDK25, PROJECTS_NODE configured) | 259PASS/0fail/0error/0skip |
| Full Node/browser regression, concurrency1 | 149total /145PASS /0fail /4existing opt-in packaged-runtime SKIP |
| Performance pure/browser cases | 17PASS within full Node;1280/375/320; all five horizons, null/zero/groups/status/paging/exact filter/detail/keyboard/safe text/races/errors |
| Existing shell expectation update | Retains evidence DESIGNED assertion; Performance now asserted five real source-fixture groups/20list rows; all other assertions retained |
| Existing generator `--check` | PASS33features; no regeneration/canonical/status promotion |
| `git diff --check` | PASS |
| Actual visual inspection |1280/320 viewport Summary/Detail PNGs inspected; responsive checks also375; private screenshots retain all widths |

Four full-Node skips are the existing explicitly opted-in packaged Today/Runner/History/Settings tests; no new skips or weakened tests. Synthetic/browser checks are development evidence, not installed app or market-history acceptance.

## Sole formal compatibility smoke

Static actual configured EXE ZIP entrypoint imports insider_tracker.cli.main; editable .pth resolves the approved source/src. Source Git clean at231638f2; reviewed routing contains the three Performance reads under READ_ONLY_COMMANDS/connect_readonly, never writer `performance-summary`. Config SHA256 `f5786331c8b62994f8ca0d2231057d2bbbeab694a379ff8aa410726f44885b7f`, CLI SHA256 `09d0752aa3031c3cfb952f38a7191e08736dca58664bdf19f4191cdf660459a4`. Private machine paths are only in ignored evidence, never responses/PR.

After all isolated gates, safe read precondition was checked from raw SQLite header: schema2, DELETE-compatible header, no-wal/shm/journal sidecars. No independent SQL read. Exactly one non-installed candidate runtime on a random loopback port (neither43871 nor8080), isolated Dashboard History/metadata home, Taiwan disabled/Runner unset/Scheduler includes empty. Candidate JAR SHA256 `0f25f45742e9850ea9f3e1d7f7766a36676f1028c466c1054e333ef0eee9a310`. Static readiness GET `/` makes no source call. Formal attempts are recorded before dispatch in a one-use marker; no retry/new horizon or extra source probe.

Exactly three HTTP200/no-store/READY operations:

1. summary horizon3m, no score thresholds;
2. list horizon3m, limit1/offset0;
3. exact returned `report:2026-10-02:CRESY` detail once.

| Bucket | Signals | Observed | Unobserved | Average return | Win rate |
| --- | --- | --- | --- | --- | --- |
| <85 | 14 | 0 | 14 | null | null |
| 85-89 | 14 | 0 | 14 | null | null |
| 90-94 | 4 | 0 | 4 | null | null |
| 95+ | 0 | 0 | 0 | null | null |
| UNSCORED | 0 | 0 | 0 | null | null |

Current formal total32active report signals, all32unobserved for3m; stored counts COMPLETE0/PARTIAL0/PENDING0/NOT_COMPUTED32. This is fresh captured evidence, not the historical27/COUR snapshot. Selected CRESY/Cresud report2026-10-02, discovered2026-10-02T10:30:00+08:00/report_date_assumed_publication, imported Signal84/Investment81, NOT_COMPUTED, nullasOf/metrics/times, missingSessions[], horizonObserved=false/snapshot=null, detail snapshots={}. List hasMore=true/nextOffset1; no additional page fetched.

Formal consumer compatibility PASS only. It does not certify strategy success, independent trades, complete performance history, observed3m return, recommendation quality, portfolio performance, future source availability or installed Dashboard acceptance. Source current state is authoritative for these three separate reads; no cross-call PIT snapshot guarantee.

Before/after complete protected manifests match331entries (source tracked files/runtime/CLI/editable paths, raw formal DB/sidecar absence, installed package/config/shortcuts). DB raw SHA256 `3887c5755ee068edc926a33e66c654a0f5815e8d761e9392d7f466f21f6fd7d4`, size180654080bytes, mtimeNs1790997775435651500 unchanged. All hashes/sizes/mtimes and absence entries equal. Source Git remains clean; installed package/config byte hashes equal initial preflight. Candidate stopped; no real43871/8080 listener existed in post-read inventory and none was operated. No Task/Runner/receipts/production config operations. No formal re-read will be used to review/fix this candidate; management reviews captures.

## Evidence integrity and handoff

Private reproducible evidence lives in this worktree's ignored `.tools/`; Stage record is the sole documentation change. Full sanitized HTTP captures are `formal-sanitized.json`; private paths only in preflight/manifest/candidate config/log files. Source fixture generator, bounded one-use formal harness, logs and screenshots remain available for independent review. Hashes below bind captured evidence:

| Artifact under `.tools/` | SHA256 |
| --- | --- |
| `full-maven-final.log` | `c658deebb83ba202d3c0de790c75c59edafc25b9ff1702c5cd156ecd69ff96f1` |
| `full-node.log` | `72a9606d9acd97954f25b6cd3102850416c41f2465fe5cacc3ba0e281bbf0240` |
| `transport-regression.log` | `91abb28cfc8ebea3db3b8717c978b2f59daa3b2622125af8123aca0f79b5de43` |
| `transport-final.log` | `5bf3da9120114406c8657ddda32bb12cde5b70b1a92c876a02181bf6905d0283` |
| `generator-check.log` | `e1d82240a5ece128ad38724d2c570e96b7ced35fd9978194a1c05e0a7a2ac194` |
| `formal-sanitized.json` | `46a402ed308979513e79ebacc66f7a26c1c38d0f06c900e8decfe7481c443f25` |
| `formal-before-private.json` | `f58a61b88c3bc9099e21436953286c9144391c31276e9ae1f7c3d22d8c5acf2b` |
| `formal-after-private.json` | `f58a61b88c3bc9099e21436953286c9144391c31276e9ae1f7c3d22d8c5acf2b` |

Existing primary main and source main remain clean/unmodified. Exact candidate SHA/PR/changed paths and log hashes are frozen in `.tools/handoff-packet.json` after commit/push. Sole normal implementation role remains the existing Sol Work; management independently reviews exact SHA. HANDOFF_DELIVERED is the submission state, not self-approval. Stop after handoff: no Design Sync, merge, deployment or next Stage.

## Consolidated Design Sync evidence — 2026-10-03

Manager authorization is one bounded docs/generated/coupled-test commit, direct parent accepted implementation `96b15c8caf0ed0fc64e307a77c95de3e460e20ce`; current main/base remains `bce84c4506e3e94d7b69eac6bf92679d1f1fd49d`. Same branch/PR #15, no new Work/subagent. This sync is READY_FOR_MANAGER_REVIEW, not self-approval, Git closeout or deployment. The original implementation evidence above is historical and unchanged; its formal capture is not rerun or reassigned to this documentation commit.

### Scope and parity

- Existing PROJECT-DESIGN, Data Contracts, As-Built, Design Space and README explain the approved first current-active Insider AI-report consumer, its three fixed read-only operations, small BoundedSourceProcess mechanics/source-specific exits, APIs, stored status versus horizon observation, exact identity/null/zero/snapshot semantics, source methodology and statistical limits. Broader original design remains in its fixed place; Ticker Detail itself still has no Performance integration.
- Only product-performance DESIGNED→PARTIAL; all33 IDs and32other feature statuses retained. Existing parser derives DONE19/PARTIAL7/BACKEND_READY3/DATA_READY0/DESIGNED1/IN_PROGRESS0/NOT_STARTED2/DEFERRED0/BLOCKED1/DROPPED0. product-us/reports/tw remain PARTIAL. No status was changed to manufacture these counts.
- Materially stale active2C/2D/TW wording reconciled to the already accepted cumulative bce84c4 deployment; historical Stage/Change Log evidence retained. Design Space's active Taiwan source statement now names the existing Taiwan Volume Watch contract, preserving the old AIStockHunter export proposal as unfinished design. This reconciliation adds no runtime capability or new deployment claim.
- Existing prototype generator regenerated project-design-sample.js from canonical, then --check passed. Coupled Projects test retains baseline33-ID/status guards and exact final counts, adding the approved Performance promotion. Installed Projects remains the frozen bce84c4 package build snapshot; browser reload cannot read this unbuilt canonical. No package or JAR rebuild.

### Bounded validation and implementation protection

| Check | Result |
| --- | --- |
| Projects Node status/parser/loader/error cases |4PASS/0failure/0skip |
| ProjectsResourceHttpTest |3PASS/0failure/0error/0skip; actual isolated random-port Spring resources + browser, temp Dashboard DB and fixture-routed APIs, no source read |
| Generator --check and diff --check |PASS33features / PASS |
| Exact implementation preservation |All518 out-of-scope tracked files equal accepted Git content; Java source equals accepted blobs with existing checkout CRLF where applicable.14 product UI raw resources byte-exact to accepted frozen JAR, including existing mixed EOL files; no runtime/test-source modifications |
| Candidate JAR |Unchanged SHA2560f25f45742e9850ea9f3e1d7f7766a36676f1028c466c1054e333ef0eee9a310 |
| Installed image/config/source |225files hash/size/mtime unchanged, installed config unchanged, two shortcut hashes equal existing deployment identity; Insider98trackedfiles equal main231638f2, clean |
| Formal source operations |0new reads; existing32active/3m observed0/null/NOT_COMPUTED32 captures reused |

Windows launcher environment prevented normal Maven wrapper start; the downloaded matching Maven3.9.11 batch stalled before Java and Surefire's cmd.exe fork returned OS CreateProcess740. The verified test helper alone was stopped. Same installed Maven/JDK25 with forkCount=0 ran the exact bounded test class successfully, including its actual browser child. No system settings/elevation, auto-approval rejection bypass, product change, full Maven/browser campaign, package build or installed operation. Failed launcher logs are retained separately; zero-test launcher failures are not test failures or successful verification. After the final on/after methodology refinement, the same bounded test class ran again on stable canonical; final-stable log is authoritative. Served target/classes canonical is byte-exact SHA256 f50bcb6b4cfbede49a3545e84fd10d4cad0ee6dcd63a8d5e927dd7b2b5ee6c8d. The accepted packaged JAR is unchanged; test resource copying does not repackage it.

### Existing owner Google Doc synchronization

Same Doc `1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs`, tab t.0, in place. Checked-in trusted-read bridge3.6 with supported Windows fileIO persisted complete before/intermediate/final native responses/control inventory/outline/text; no protected controls/warnings. Two direct structured batches used fresh requiredRevisionId:17targets initially, then bounded current-wording corrections to2additional paragraphs plus one methodology correction.19unique target paragraphs changed,751other native paragraphs unchanged,770total. All24H1/52H2 text/order/styles, tab/named styles/list/hanging indentation/text styles/links/headerfooterobjects preserved. Parent/sharing metadata readback equal; no permissions/move/copy/new Doc/Taiwan Doc write. Native checks are not PDF/browser visual QA.

Existing Release3 items remain in place: ☑ Performance v1 implementation complete/Manager approved, ☐ Git closeout/main integration, ☐ production deployment. First Insider slice is PARTIAL,32currentactive/3m observed0 is not0% performance; NOT_COMPUTED does not become PENDING. Current canonical7PARTIAL/1DESIGNED is distinguished from installed bce84c4 historical6PARTIAL/2DESIGNED. Taiwan/SEC/broader analytics/PIT/portfolio/backtesting/recommendations/trading remain unfinished.

- Before revision: `ANLCKQlZe86HGEls6gBTWfAzb-FF9e739_TFD1qfLR4HKlc-XQHh814soMYwVo6U5xww6d90t8ytUehLXnXU66fs4rO3LRc1A51-EdshHbQ`.
- Intermediate revision: `ANLCKQmGwLx6JoYqTWW0XjJHIyv6iRsVD-NQi8k9dALDYLRTPfVvuzmjGTvIFDj1cogQBDC6BrcEnyanVM7nVYPekdEO5oP2ZK2XyTSL1V0`.
- Final revision: `ANLCKQneZpzMsCPIfLkaaLcUk0EbsQ_qAX3svUokUGn_dUibwb1RUMWXaHTCYLKCoU73u2cvq_M8bOKZ_5bYcoMDPK0Uq7RbX9lKp7lEXcM`.

Ignored private evidence under `.tools/performance-design-sync/` is available to management; raw native/private metadata is not committed. Hash-bound evidence:

| Artifact | SHA256 |
| --- | --- |
| `projects-node-final.log` | `8a70c35a13a39eeb9ce4630afd707eb6b48b1af19658411ec6edc0a0be66a5c3` |
| `projects-http-final-stable.log` | `8d281da94b2b4e289b26ff8d609af82fd078f9d117d47564320205fcc36d9e3d` |
| `doc/before/manifest.json` | `b355b56a56a777de50ba46ef17ce03a681ef82bb817e8aae4a3f6d982bcd6e7c` |
| `doc/final/manifest.json` | `07f41a5b541aaacb0e6e03bd7324854f45804a483935ef29dc676bd90669f1f3` |
| `doc/native-proof.json` | `e96c6e9e01ea87b06cfdcb897f032abce6a04a09f95289fb6affcd6c247bba27` |
| `byte-proof.json` | `03b231f7cbae91db17c8ee8f6284dec3ff551eb1c795aec80022c05225dba0c5` |

Exact Design Sync SHA/parent/changed paths/live PR state are recorded in the post-commit handoff packet and direct management delivery, avoiding a self-referential SHA in this commit. No new formal DB/CLI read, source writer, installed Start/Stop, Scheduler/Task/Runner/receipt operation, rebuild/repackage/deploy/merge or next Stage. Stop after HANDOFF_DELIVERED to existing management for independent exact-SHA review.
