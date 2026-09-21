# Stage 5B-R evidence index

**Root cause reproduced: the creating process's redirected AppData view made the
ordinary absolute Java/JAR paths visible locally but absent to Task Scheduler.**
Same binaries succeeded via their physical paths and an unredirected test deployment.
The formal weekly task was untouched. This evidence is diagnostic only.

- [Derived assertions and matrix](analysis.json): 12 manual requests, outcomes,
  receipt counts and invariant checks.
- [Prior candidate](prior-candidate.json): old Command was absolute, not a literal
  `%LOCALAPPDATA%` expression; source XML hash and release identity.
- [Creating-process file resolution](path-resolution.json) vs
  [Scheduler-context visibility](marker-A2.json): same hashes, different visibility.
- [Inspecting-process context](creation-context.json): no package identity on that
  Python process; no logical-parent reparse point. The report limits its mechanism
  claims accordingly rather than inferring process identity from a cache pathname.
- [Shared candidate deployment](shared-deployment.json) and [D3 result](case-D3.json):
  successful direct Runner outside the package cache, with all release file hashes.
- `case-*.json` / `request-*.json` / `action-*.sanitized.xml`: each case's exact
  sanitized action/context, one request, scheduler result, polling and receipt fields.
  E's `collectionRecovered` flag identifies read-only collection after a harness
  error; E was not triggered again. `elapsedMs` is collection wall time, not child
  execution duration; use the TERMINAL receipt's `durationMs` for the latter.
- [Captured environment](captured-environment.json): LOCALAPPDATA, TEMP, cwd,
  64-bit flags, SID hash/equality and Java-on-PATH boolean. `marker-*.json` and
  `wrapper-G.json` are sanitized references derived from these saved observations;
  original temporary markers were deleted. No full environment dump.
- `tasks-before.json`, `tasks-before-*.json`, `tasks-after-*.json`,
  `integrity-*.json`: all 234 existing definitions hashed at every checkpoint;
  the diagnostic task is excluded. No external drift occurred. Existing raw
  task XML remains private; the task inventories retain its UTF-8 export hashes.
- [Task cleanup](task-cleanup.json), [file cleanup](file-cleanup.json),
  [deleted-file hashes](deleted-test-file-hashes.json): diagnostic removal and
  deletion of temporary config/marker/copied-release files.
- [Final read-only audit](final-audit.json): task still absent, both temporary roots
  absent, original weekly metadata and all existing task definitions unchanged.
- [Environment before](environment-before.json) / [after](environment-after.json):
  unchanged weekly execution metadata/ACL, 8080 offline and Operational log disabled.
- [Application-log query](application-events.json): no relevant existing event.
- [Regressions](regressions.json): 133 Maven testcases and 32 frontend/browser
  results extracted without JUnit environment properties or raw logs.
- [Source manifest](source-manifest.json): raw artifact SHA-256 provenance.

Redacted absolute paths use **`[LOCALAPPDATA]`**, `[USERPROFILE]`,
`[DASHBOARD_REPO]` and `[DIAGNOSTIC_ROOT]`. Literal **`%LOCALAPPDATA%`** in Case C
is deliberately preserved: it really was in that Action. SID values in XML are
replaced; environment markers retain only a SID hash/equality check. Sanitized XML
is UTF-8 and is a review reference, not a restorable definition.

Raw hashes identify the original private bytes, not the redacted files. They are
not independent signatures. Deleted test-file/marker hashes are retained alongside
captured observations; they do not imply those files remain installed. No private
Runner config, stock data, secrets, full user paths, usernames, raw SIDs or raw logs
are committed. All Runner receipts here belong to harmless diagnostic fixtures.

The exporter validates the result-specific assertions; it only reads saved evidence.
See [`scripts/export-stage-5br-evidence.py`](../../../scripts/export-stage-5br-evidence.py)
and [the diagnostic report](../../STAGE-5B-R.md).
