# Runner Coverage & Diagnostics

## Plan, stages, and gates

1. Freeze the existing receipt reader and `/api/jobs` identity. Gate: exact mapping and bounded receipt semantics remain intact.
2. Extend the single `/api/runner/executions` read with safe diagnostics. Gate: config, roots, mappings, and warnings are explicit without private paths.
3. Combine that response with the current `/api/jobs` snapshot in Today and the drawer. Gate: one jobs request and at most one Runner request per refresh, with no per-job requests.
4. Verify Maven, browser, packaged app, and Git evidence. Gate: tests pass, review files are pushed, and the working tree is clean.

## Coverage states

`RUNNER_EVIDENCE_AVAILABLE` requires an exact Scheduler mapping, a profile in the trusted config, and at least one normalized execution. `MAPPED_NO_RECEIPT` means the mapping and profile exist, roots are available or naturally not created yet, and no valid receipt was found. It does not imply a missed run. `MAPPED_PROFILE_MISSING` identifies an absent profile. `RUNNER_UNAVAILABLE` means the mapped profile's trusted receipt source cannot be read safely. `UNMAPPED` is derived by the UI only when a current Scheduler job has no exact mapping. If config is absent or invalid, the whole coverage summary is unavailable rather than counting all jobs as unmapped.

## Config status semantics

The response adds `configStatus`: `CONFIGURED`, `NOT_CONFIGURED`, or `UNAVAILABLE`. The original top-level `status` and `jobs` fields remain. An invalid config returns a fixed warning. Neither API nor UI receives the config path.

## Receipt root status semantics

`roots.primary` and `roots.fallback` each report `AVAILABLE`, `NOT_CREATED_YET`, `UNREADABLE`, `INVALID`, `UNSAFE`, or `NOT_CONFIGURED`. A missing directory can be normal before any receipt is published. Direct and ancestor symlinks are unsafe. Status checks do not create directories or receipts. The existing bounded reader remains responsible for receipt validation.

## Mapping diagnostics

Each mapped entry retains `schedulerTask`, `profileId`, `executions`, and `warnings`, and adds `jobId`, `profileStatus`, `coverageState`, and `latestEvidenceAt`. The first valid exact Scheduler mapping wins; duplicate or invalid mappings produce top-level warnings. Shared profiles reuse one scan result. An absent profile is a structured `MISSING` state.

## Coverage summary

Today counts every job in the current `/api/jobs` snapshot, including jobs folded in presentation. The summary counts mapped, with evidence, mapped without receipt, missing profile, and unmapped jobs. The small row indicator never changes Scheduler status or identity. Top-level warnings are displayed as text.

## Freshness semantics

`latestEvidenceAt` is the start time of the newest normalized execution among the bounded recent results. The drawer formats it in local time and shows an approximate age. Freshness is diagnostic only; it never changes `READY`, `FAILED`, or `MISSED`.

## MISSED readiness semantics

The UI always reports `NOT_READY`. Unmapped jobs are counted explicitly, and the Dashboard does not establish expected schedule, nominal occurrence, or grace period for Runner-based missed detection. Runner evidence coverage alone cannot establish MISSED readiness. No MISSED inference is introduced.

## Security redaction

The response contains no config or receipt absolute paths, executable, arguments, working directory, environment, or stdout/stderr. Browser values and warnings use text nodes. The API accepts no path or command input and performs no mutation.

## Performance

Each refresh requests `/api/jobs` once, then `/api/runner/executions` once. History remains on demand. Mapping results are cached by profile within the service call; receipt limits remain 4096 entries per root, five recent executions, and the existing receipt size and identity checks.

## Tests

Backend tests cover config absence and invalidity, natural missing and available roots, an access-denied fallback root, unsafe root, evidence and empty mapping, missing profile, duplicate mapping, shared profile reuse, timestamp, and response redaction. Browser tests cover summary counts, warnings rendered as text, row and drawer diagnostics, narrow widths, unchanged Scheduler status, and one shared Runner request. Full Maven, Node/browser, package, and Git results are recorded in the final review report.

On 2026-09-26, Maven `verify` passed 156 tests using JDK 25 and in-process Surefire. The full Node suite passed 41 tests with four existing conditional skips. A focused browser rerun after the last UI edit passed 25 tests, including History and 320/375 px layouts; the final Runner browser rerun passed all 19 tests. The isolated Windows app-image passed the packaged startup and safe-stop smoke checks, and its packaged `/api/runner/executions` returned the expected path-free `NOT_CONFIGURED` diagnostics. `git diff --check` passed. No Scheduled Task or Runner action was invoked.

## Limitations

The root status is an observation at request time; filesystem permissions or contents can change after it is checked. A scan limit can hide older evidence and emits a warning. No live Scheduler task or Runner execution is performed for this stage. Readiness remains `NOT_READY` pending a separate, explicit schedule semantics stage.
