# Release 1A-1 — Local Dashboard Projects Viewer

Implementation and Self-QA complete; awaiting independent Astra first review and Manager final review. This record is not an approval, merge or deployment acceptance.

## Plan, stages and gates

Baseline: clean `main` at `f1dac729c72db5e636a762b9f5f505b91074537e`, repository `Neil1031/local-dashboard`. Implementation branch: `implement/dashboard-projects-viewer-r1a1`. The implementation Work's actual session `turn_context` was `gpt-6.1-sol / high`. Astra manages and reviews in its separate visible Work. No subagents were used.

1. Source contract: extract one shared v1 parser, keep the canonical source in `docs/PROJECT-DESIGN.md`, and package only that named document. Gate: generator consistency, malformed/missing/unsupported/oversize rejection and all baseline IDs preserved.
2. Production UI: add Projects beside Today/History, keep settings, use an independent module, derive counts from parsed rows and show purpose/implementation/limits/remaining work. Gate: real canonical bytes, safe text, failure clears old data, retry and request revision guard.
3. Self-QA: isolated Spring HTTP, Node/browser regressions, three widths and visual inspection. Gate: pass relevant tests without production Scheduler/Runner/DB interaction.
4. Documentation and handoff: update engineering explanations and the existing Google Doc, commit/push a PR, stop at READY_FOR_ASTRA_REVIEW. Google Doc synchronization evidence and source SHA are recorded in `GOOGLE-DOCS.md`; final review belongs to Astra/Manager.

## Result and source ownership

`pom.xml` copies the canonical file without filtering into `static/project-design/PROJECT-DESIGN.md`. The production page fetches only `/project-design/PROJECT-DESIGN.md`. `ui/project-design.mjs` is the pure shared parser used by both the viewer and prototype generator. Production does not load `window.PROJECT_DESIGN_SAMPLE`. There is no manually maintained production status array, external source discovery, new API, controller, DB or dependency.

The fixed same-origin loader rejects redirects, bounds reads to 10 seconds and 256 KiB, hashes exact received bytes, validates UTF-8/schema/project identity, and returns safe error codes. Reload immediately clears old rows/counts/provenance; only the newest response can render. All rendered source fields use text content. The view identifies the source as a build snapshot and distinguishes historical design baseline from the implementation SHA and browser read time.

All 33 original feature IDs remain in original order. The only status transition is `product-projects: DESIGNED -> PARTIAL`. Counts: DONE 19, PARTIAL 1, BACKEND_READY 3, DESIGNED 7, NOT_STARTED 2, BLOCKED 1; DATA_READY/IN_PROGRESS/DEFERRED/DROPPED each 0. Full Projects/aggregation and other Release 1 capabilities remain unfinished. The static prototype is still independently labeled SAMPLE.

`dashboard.mjs` grew by 6 net lines (to 926 at handoff); Projects lives in its own module. No new framework was introduced. Fixture browser servers now explicitly serve the added modules rather than returning HTML for every unknown URL.

## Verified evidence

- Node 24.19.0 runtime, JDK 24.0.2, Maven Wrapper 3.9.11; Playwright reused from the bundled runtime, Edge headless. No dependency installation.
- `node --test tests/projects.test.mjs tests/dashboard.test.mjs tests/history.test.mjs tests/projects-browser.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs tests/settings-browser.test.mjs`: **50 passed, 0 failed/skipped**. This includes Today, History, settings revision conflict, Runner drawer/coverage, baseline IDs/counts, bad metadata/columns/status/duplicate ID, network/HTTP/HTML/UTF-8/size/timeout failure, retry, stale response and unsafe text.
- `mvnw.cmd -B verify` with `PROJECTS_NODE` and `NODE_PATH` pointing to the bundled browser runtime: **182 passed, 0 failed/errors/skipped**; JAR build succeeded. Existing tests use their fixtures/temp stores. New `ProjectsResourceHttpTest` uses a random loopback port, temporary history DB, mocked collector and metadata store with `verifyNoInteractions`.
- Its 3 tests verify real HTTP resource bytes and JavaScript MIME types, fixed resource whitelist/no mutation endpoint, and a real browser consuming the actual Spring-served index/modules/canonical source. The browser's unrelated APIs are fixture-routed; no real Scheduler collection or Runner receipt/config read occurs in this smoke.
- `node --test design/prototype/check.mjs`: **7 passed, 0 failed/skipped** across nine sample pages and Projects six sample detail views. `PROTOTYPE_SCREENSHOT_DIR` points to ignored `target/projects-r1a1/prototype/` so regression QA does not rewrite committed screenshots. Expectations derive status counts from the shared canonical parser.
- Generator regeneration followed by `--check` confirms the generated sample matches the sole source. `git diff --check` passes.
- Projects at **1280/375/320 px**: all 33 IDs, status counts, detail expansion with Enter, tab Home/End, settings access and no document overflow. Screenshots in `target/projects-r1a1/`: `projects-{width}.png`, `projects-panel-{width}.png`, `projects-header-{width}.png`. The implementation Work inspected rendered screenshots; text wraps without clipping. A filename encoding mistake was corrected with `fileURLToPath`; only the three exact mistaken files produced by this test were removed.

Logs are local ignored files: `.tools/projects-r1a1-node-final.log`, `.tools/projects-r1a1-maven.log`, `.tools/projects-r1a1-prototype.log`, `.tools/projects-r1a1-visual.log`. The final delivery records the full commit SHA and PR, so no self-referential commit value is required here.

## Astra early checkpoints addressed

- Explicit `mode: same-origin` / `redirect: error` added to the fixed source fetch; options covered by loader test.
- Removed an ineffective Spring metadata path property; the HTTP test mocks `JobMetadataStore` and proves no interactions, without changing production behavior.
- Corrected screenshot URL-to-filesystem conversion with `fileURLToPath`.

These are early feedback corrections, not a formal first-review verdict.

## Limits and protected scope

The decided formal port target is **43871**; this stage's current program baseline remains **8080**. No port migration, old branch merge/deletion, app-image/installer/Service action or installed-package acceptance was performed. A Maven JAR build is not a deployment.

No production task execution, Scheduler mutation, Runner/receipt mutation, production DB access, external investment repository read, new MISSED inference or source integration is part of this change. Existing runtime monitoring calls remain unchanged. No full nine-page shell, complete six production Projects views, cross-project aggregation, Overview operations slice or next stage was started.

The viewer shows only the source snapshot in the running build. Git edits require a new build to appear. The parser deliberately supports the documented v1 contiguous pipe-table format, not arbitrary Markdown/YAML or escaped/multiline pipe cells. Engineering statuses do not prove a fresh operational/deployment acceptance. Full tests and static visual QA do not establish formal installed application behavior. Google Doc native content/style/topology readback is recorded separately; no PDF/browser visual acceptance of that Doc is claimed.
