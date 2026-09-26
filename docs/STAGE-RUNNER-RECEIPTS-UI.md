# Stage — Runner Receipt UI

## Plan

| Stage | Goal and scope | Dependency | Gate / Done when / Self-QA |
| --- | --- | --- | --- |
| 1 | Confirm version 1 receipt contract and trusted configuration | Stage 5A source | Schema, roots, and pilot identity documented from code |
| 2 | Add bounded, read-only normalization and one API response | Stage 1 | Primary/fallback, malformed data, lifecycle, ordering, and limit tests pass |
| 3 | Show recent Runner executions in Today drawer | Stage 2 | Scheduler fields and History identity unchanged; safe text rendering and narrow layout checked |
| 4 | Package and regression verification | Stages 2–3 | Maven, Node/browser, packaged app, diff check, and Git review complete |

## Existing Runner receipt contract

`ExecutionReceipt` schemaVersion 1 has `executionId`, `jobId`, `commandProfileId`, `phase`, `outcome`, UTC `startedAt`, `processStartedAt`, `finishedAt`, `createdAt`, `durationMs`, child `exitCode`, `runnerExitCode`, `processStartFailure`, and `terminationReason`. Each execution directory has published `00-started.json`, `01-process-started.json`, and/or `02-terminal.json`. `RunnerMain` writes `STARTED`, then `PROCESS_STARTED` after `ProcessBuilder.start`, then `TERMINAL`. Start failure writes `STARTED` then `TERMINAL` with `START_FAILED`, no child exit, and runner exit 127. Terminal duration is Runner elapsed time since the initial start, so the UI must label it Runner duration rather than child-only duration. A claim directory containing only pending files is no published evidence. Primary is `receiptDirectory` resolved against the Runner config directory. Fallback is `fallbackDirectory` resolved against that directory, or the Runner default under the user home when absent.

## Trusted receipt roots

The Dashboard reads one operator-configured Runner config file, never a browser path. Set `dashboard.runner.config-path` in the private Dashboard `application.yml` to the **absolute** path of the deployed Runner's `config/runner.json`. Do not copy that private JSON into the web app or repository. The packaged pilot must opt in with that path; an absent path returns `NOT_CONFIGURED`. An invalid/unreadable path returns `UNAVAILABLE`. Both primary and fallback roots come only from the versioned config. If the fallback field is absent, the existing Runner default under `user.home` is used. The Dashboard never starts the Runner or accesses child command arguments.

## Execution normalization

For each configured profile, the service scans at most 4,096 root entries in each root and returns at most five recent executions sorted by UTC `startedAt`, then `executionId`. One API read caches a profile result across mappings to that profile, and at most 32 mappings are accepted. A scan-limit warning means the five may not actually be the newest. Each published version 1 phase is validated with the Runner's bounded 16 KiB reader and grouped by `executionId`. The latest phase supplies identity and outcome. A terminal receipt supplies Runner-measured `durationMs`, child `exitCode`, `runnerExitCode`, and reason. Invalid or unreadable evidence is skipped with a warning. The API never returns raw JSON or command arguments.

## Deduplication

Primary is inspected before fallback. Identical phase copies are counted once. Complementary phases merge when `startedAt`, `jobId`, and `commandProfileId` agree. If the same phase disagrees, or identity conflicts, the later root's copy is ignored with a warning. Thus a partial primary can be completed by a valid fallback. Empty/pending-only execution directories do not count. Primary and fallback root names are exposed as `primary`, `fallback`, or `primary+fallback`, never as filesystem paths.

## Mapping Scheduler jobs to Runner jobs

The packaged pilot maps the exact Scheduler task path `\AIStockHunter-Accumulation-Weekly-Check` to profile `aistockhunter-accumulation-weekly`. The source of this mapping is `dashboard.runner.mappings`, not a substring match. The profile must exist in the trusted Runner config; its `jobId` determines the execution-directory prefix. Future mappings can be declared as an explicit list in private Dashboard configuration. If a Scheduler task has no exact mapping, the UI states that no Runner mapping is configured.

## Incomplete receipt semantics

`STARTED` or `PROCESS_STARTED` without terminal means `INCOMPLETE` unknown evidence, never failed or permanently running. `childStarted` is true only when a process-start timestamp exists, false for terminal `START_FAILED`, and otherwise unknown. A terminal with `START_FAILED` means `NEVER_STARTED_CHILD`; its child exit is empty while runner exit is 127. A full three-phase lifecycle is `COMPLETE`. A terminal missing another phase is `PARTIAL_TERMINAL` with an explicit warning; its terminal outcome remains visible but the chain is not labeled complete. No receipt does not prove a missed run.

## API

`GET /api/runner/executions` returns one no-store, read-only response with `status`, `jobs`, and `warnings`. Every mapped job has `schedulerTask`, `profileId`, up to five normalized `executions`, and warnings. No request parameter controls a path, job command, or limit. The server binds to `127.0.0.1` by default. The UI makes one request on first Today-drawer use per Refresh and reuses the result for all drawers.

## UI

The Today drawer shows a separate **Runner execution** section with the latest evidence and five expandable executions. It shows phase timestamps, child exit, Runner exit, Runner-measured duration, completeness, source, and warnings. Missing receipt, unmapped job, unconfigured source, and unavailable source have separate messages. Scheduler current status and observed History retain their original contract and identity. The Today card itself stays compact.

## Security

Receipt input is untrusted. The reader rejects symlink roots, symlink execution directories, symlink/nonregular phase files, oversized files, malformed JSON, unknown phase files, schema errors, identity mismatches, and impossible timestamp ordering. Each invalid execution is isolated so other executions remain visible. The front end creates text nodes (`textContent`) for every receipt field, including IDs and warnings. The API exposes no arbitrary path, mutation, process execution, or task operation. The trusted private config can point outside the repository by design; its owner must control that file.

## Tests

Maven tests cover complete/incomplete/start-failure, child exits, roots, deduplication, corrupt receipts, ordering, limits, and mapping. Browser tests cover drawer content, no extra `/api/jobs`, XSS-like strings, keyboard focus, and 320/375 px widths. On 2026-09-26, the final Maven run passed 152 tests using the existing JDK 25 and in-process Surefire; the full Node suite passed 41 tests with four existing conditional skips. The final Windows app-image passed the repository's packaged startup/stop smoke check. A separate packaged API probe used an isolated fixture config and fallback STARTED receipt: one execution returned `INCOMPLETE`, `source=fallback`, and unknown `childStarted`. `git diff --check` passed. No Scheduled Task mutation was performed.

## Remaining limitations

This stage does not derive Scheduler status or unify Scheduler History. Enabling live receipts requires the operator to set the private Runner config path in the Dashboard config; this stage does not discover it from Scheduler or change any task. The deployed private Runner config and live receipts were not supplied to this repository task, so actual deployed-receipt display remains unverified. A 4,096-entry root cap bounds work and emits a warning if reached. Snapshot reads are not a transaction across all files: a concurrent Runner publication may appear on the next drawer read after Refresh.
