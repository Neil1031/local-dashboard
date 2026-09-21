# Stage 5B review evidence

This directory publishes the saved evidence for implementation commit
`8153d19cb724a5542d5ff3e84ab881e0694ab109`. **The live pilot failed and the final
task uses its original Action.** These files do not establish a successful live
Runner execution or natural Friday execution.

| Evidence | Review entry |
| --- | --- |
| Single manual request and actual scheduler failure | [request](pre-migration/manual-run-request.json), [result](pre-migration/live-result.json) |
| Original task, candidate, applied task, final original | [original](pre-migration/original.sanitized.xml), [candidate](pre-migration/runner-action.sanitized.xml), [applied](pre-migration/applied.sanitized.xml), [restored](pre-migration/final-restored.sanitized.xml) |
| Exact rollback and final state | [rehearsal](pre-migration/rollback-rehearsal.json), [final rollback](pre-migration/rollback.json), [inspection](pre-migration/final-task-inspection.json) |
| All task definition hashes | [initial inventory](initial/all-tasks-before.json), [pre-migration inventory](pre-migration/all-tasks-before.json), [final inventory](pre-migration/all-tasks-latest.json) |
| External drift before any task write | [drift inventory](initial/all-tasks-drift.json), [baseline refresh explanation](pre-migration/baseline-refresh.json), [drift task](pre-migration/external-drift-task.sanitized.xml) |
| Child equivalence, exit codes, storage/config failures | [fixture results](pre-migration/fixture-results.json), [derived observations](fixture-observations.json) |
| Protected source/data/config hashes and unchanged weekly output | [before](pre-migration/protected-files-before.json), [final checks](pre-migration/final-data-integrity.json), [weekly report hashes](pre-migration/weekly-reports-before.json), [weekly log hash](pre-migration/weekly-log-before.json) |
| Runtime/config identity, without private config contents | [deployment manifest](pre-migration/deployment.json) |
| Maven, frontend, packaging and isolated weekly tests | [regression results](regression-results.json) |
| Original artifact provenance | [raw source hashes](source-manifest.json) |

`initial/` retains the first baseline rather than silently replacing it. One
RefreshCache definition changed before our first registration attempt; the actor
is unknown. Only the refreshed pre-migration inventory matches all 234 final
task hashes. Intermediate XML snapshots are diagnostic history, not final state.

Fixture observations include both saved fixture directories. The first verifier
attempt completed the process/storage cases but its missing-config assertion used
the wrong diagnostic constant. After correcting that assertion, the complete six
cases passed. These entries are direct-run fixtures, never scheduled real jobs.
No live receipt exists. The observations retain selected receipt fields and
markers, not raw receipt/config files.

The nine isolated weekly unit tests were rerun while exporting evidence to capture
a durable test result. The timestamp is recorded separately in regression results;
it is not backdated to the original pilot. Maven's 133 individual testcase results
are extracted from saved JUnit files without environment properties or captured
stdout/stderr. Frontend/package checks are structured extracts of the saved logs.
Original logs are represented by hashes, not committed as logs.

Host/user names, user SIDs, profile paths and project roots are redacted consistently.
Raw config, DB contents, credentials, full logs and raw receipts remain private.
Original-file SHA-256 values refer to **private original bytes**, not these sanitized
files. XML is converted to UTF-8 and identifying fields replaced: it is a review
reference, **not a restorable backup**. Restore uses the private original XML.
Hashes provide traceability; they are not independent signatures or proof that
an unsaved observation occurred. The final protected-file result is the saved
aggregate check, not a fabricated per-file historical after snapshot.

Export helper: [`scripts/export-stage-5b-evidence.py`](../../../scripts/export-stage-5b-evidence.py).
It only reads existing artifacts and writes sanitized evidence; it does not access
the scheduler, run the real child, or open databases. The retained original artifacts
are required to reproduce the export.
