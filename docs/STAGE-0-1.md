# Stage 0 + Stage 1 implementation / acceptance

Date: 2026-09-21 (Asia/Taipei). Repository baseline: `4e3e82b`.
Local branch: `implement/stage-0-1`. Scope: `PLAN.md` Stage 0 and Stage 1 only.

## Plan and boundaries

Read both original repository files in full before implementation; no project-specific AGENTS.md existed.
Workspace AGENTS.md applied. No UI redesign, no changes to PLAN.md, no UI/API integration.

| Stage | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| 0 | Spring Boot baseline, wrapper, localhost configuration, original static UI, startup docs | Java 21+, Maven dependencies at build time | Buildable executable JAR, starts locally, original UI remains accessible | Ordinary user, loopback binding, source/served bytes equal, no task mutations |
| 1 | Read-only collector, selection, normalized model, list/detail API | Windows PowerShell ScheduledTasks read access | All configured tasks match independent scheduler reads; explicit errors and normalization tests pass | Success, disabled/not-due, failed, running, Unicode/folders, never-run, missing dates, permission errors, process failures |

Sequence: baseline → PowerShell JSON collector → normalization/selection → API → fixture tests → packaged-service live comparison → acceptance record.

## Files changed

All implementation files below are new relative to `4e3e82b`:

- `.gitignore`
- `pom.xml`
- `mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties`
- `README.md`
- `config/application.example.yml`
- `src/main/resources/application.yml`
- `src/main/resources/collect-scheduler.ps1`
- `src/main/java/io/github/neil1031/dashboard/DashboardApplication.java`
- `src/main/java/io/github/neil1031/dashboard/SchedulerProperties.java`
- `src/main/java/io/github/neil1031/dashboard/TaskSelection.java`
- `src/main/java/io/github/neil1031/dashboard/Models.java`
- `src/main/java/io/github/neil1031/dashboard/CollectionException.java`
- `src/main/java/io/github/neil1031/dashboard/SchedulerCollector.java`
- `src/main/java/io/github/neil1031/dashboard/PowerShellCollector.java`
- `src/main/java/io/github/neil1031/dashboard/JobNormalizer.java`
- `src/main/java/io/github/neil1031/dashboard/JobService.java`
- `src/main/java/io/github/neil1031/dashboard/JobsController.java`
- `src/test/java/io/github/neil1031/dashboard/JobNormalizerTest.java`
- `src/test/java/io/github/neil1031/dashboard/TaskSelectionTest.java`
- `src/test/java/io/github/neil1031/dashboard/JobServiceTest.java`
- `src/test/java/io/github/neil1031/dashboard/JobsApiTest.java`
- `src/test/java/io/github/neil1031/dashboard/PowerShellCollectorTest.java`
- `src/test/resources/fixtures/scheduler.json`
- `src/test/resources/fixtures/scheduledtasks-stubs.ps1`
- `scripts/verify-live.ps1`
- `docs/STAGE-0-1.md` (this record)

`index.html` and `PLAN.md` are unchanged. The build copies the root UI into the JAR, avoiding a second editable UI copy.
Temporary tools, local process logs and machine-specific live JSON are ignored under `.tools/` and `target/`.

## Commands / tests run

Executed with existing OpenJDK 25.0.2, Windows PowerShell 5.1 collector, non-administrator user.
Java compilation target: 21. Spring Boot: 3.5.16. Maven: 3.9.11, wrapper distribution checksum pinned.

```powershell
# Baseline / implementation branch
git clone https://github.com/Neil1031/local-dashboard.git local-dashboard
git switch -c implement/stage-0-1

# The existing JDK was selected for this shell; no system-wide PATH changes.
$env:JAVA_HOME = 'C:/Users/qwe74/.jdks/openjdk-25.0.2'
& .\mvnw.cmd -B clean verify

# Packaged application, configured task set
& "$env:JAVA_HOME\bin\java.exe" -jar target/local-dashboard-0.1.0.jar --server.port=18080 --spring.config.additional-location=file:config/application.example.yml

# In a second shell; executes the reviewed read-only verifier without altering execution policy.
& ([scriptblock]::Create((Get-Content -Raw ./scripts/verify-live.ps1))) -BaseUrl http://127.0.0.1:18080

# Additional default-configuration service
& "$env:JAVA_HOME\bin\java.exe" -jar target/local-dashboard-0.1.0.jar --server.port=18081
Invoke-RestMethod http://127.0.0.1:18081/api/jobs
Get-NetTCPConnection -LocalPort 18080,18081 -State Listen
Invoke-WebRequest http://127.0.0.1:18080/ -OutFile .tools/served-index.html
Get-FileHash index.html,.tools/served-index.html -Algorithm SHA256
git diff --exit-code HEAD -- PLAN.md index.html
git diff --check
```

The two Java commands above were actually launched via `Start-Process -WindowStyle Hidden`, with stdout/stderr redirected to `.tools/` and their process IDs recorded for cleanup. They are shown as foreground equivalents for reproduction.

Final build: **BUILD SUCCESS**, 12.279 s. Tests: **31 passed, 0 failures, 0 errors, 0 skipped**:

| Suite | Tests | Evidence |
| --- | ---: | --- |
| JobNormalizerTest | 17 | Known outcomes, informational/unsigned codes, offsets/sentinels, missing/invalid data, folders/Unicode, no fabricated MISSED or future SUCCESS |
| TaskSelectionTest | 2 | Exact names/paths, folder boundaries, case handling, literal wildcard characters, exclusion priority, empty include |
| JobServiceTest | 3 | No collector for unconfigured service, API filtering, duplicate identity rejection |
| JobsApiTest | 5 | List/detail, 404, PARTIAL, 503 after prior success, invalid snapshot, no mutation route, exact original UI bytes |
| PowerShellCollectorTest | 4 | Real PowerShell process with in-memory cmdlet fixtures; Unicode/quotes, permission errors, singleton/empty arrays, filtering, enumeration failure, timeout/process cleanup, missing executable |

Earlier attempts uncovered and resolved: PowerShell native argument splitting for an unquoted Maven `-D` value; Java-properties backslash escaping in test setup; MockMvc's default text decoding (replaced by exact byte comparison); and PowerShell 7's automatic ISO date conversion in the verifier (preserve DateTime.Kind instead of reparsing localized text).
Direct `-File` execution was refused by the host's signature policy; the application executes its bundled constant script via `-EncodedCommand`. No persistent policy change was made.

## Live scheduler evidence

Verified at **2026-09-21 10:40:54 +08:00**. All **5/5 configured tasks** were compared, not a sample.
The API was read over HTTP from the packaged JAR; independent `Get-ScheduledTask` / `Get-ScheduledTaskInfo` reads supplied expected values.

| Task (all in root folder) | state | status | lastRunStatus | LastTaskResult | Last run (UTC) | Next run (UTC) |
| --- | --- | --- | --- | ---: | --- | --- |
| InsiderTracker-Market | READY | READY | SUCCESS | 0 | 2026-09-21 01:38:37Z | 2026-09-21 22:30:00Z |
| InsiderTracker-SEC | READY | READY | SUCCESS | 0 | 2026-09-20 04:22:19Z | 2026-09-21 03:15:00Z |
| InsiderTracker-SyncImport | RUNNING | RUNNING | UNKNOWN | 267009 | 2026-09-21 02:40:01Z | 2026-09-22 02:40:00Z |
| AIStockHunter-UnexplainedVolume-HealthCheck | DISABLED | DISABLED | SUCCESS | 0 | 2026-09-14 06:19:11Z | 2026-09-21 05:35:00Z |
| AIStockHunter-Accumulation-Weekly-Check | READY | FAILED | FAILED | 1 | 2026-09-18 14:00:00Z | 2026-09-25 14:00:00Z |

Compared: identity, description, raw/normalized state, enabled, raw/normalized last result, raw/normalized last/next times, missed counter, StartWhenAvailable, all discovered trigger/repetition properties, and detail API identity.
All five exported task-definition SHA-256 values were identical before/after verification.
SyncImport started naturally at its configured time; this implementation did not start it.

Machine-specific full comparison receipt: `target/live-verification.json` (ignored local artifact).
The failed existing task was observed only; its failure was not investigated or repaired in this scope.

## Gate result

**Stage 0: PASSED.** Executable JAR builds and starts as a non-administrator. Configured and unconfigured services bind exclusively to `127.0.0.1` on verification ports 18080/18081. The default API reports `NOT_CONFIGURED`. HTTP `/` returns the original UI bytes.

UI SHA-256 (root source and HTTP-served response):
`7642BB89B0F68C9C7D0562910452BB23E23EE8BAF2A196A0EBD05E66AF890822`.

**Stage 1: PASSED.** 31 tests pass, including real PowerShell fixture execution; all five configured live tasks match independent scheduler reads. Required successful, disabled/not-due and failed cases are verified, plus a naturally running task. Errors remain explicit. No scheduled tasks were modified.

## Known limitations / verification boundaries

- **Verified:** build, packaged application startup, loopback listeners, HTTP APIs, exact served UI bytes, fixture normalization/error paths, current host live task values, unchanged monitored task definitions.
- **Not verified:** fresh-machine setup, actual runtime on JDK 21, a real protected-task access denial (fixture only), browser visual/interactions regression (UI is byte-for-byte unchanged), every Windows trigger type or organizational PowerShell restriction.
- Stage 1 is an on-demand current-state snapshot, not execution history or an atomic scheduler transaction. A task may change naturally between reads. Collection calls are serialized; UI polling/concurrency tuning is not part of this stage.
- `status` expresses current scheduler/last-failure awareness; `lastRunStatus` is a separate result. READY is not proof that today's expected run occurred. No Today execution-window classification is implemented.
- `scheduledAt` and `durationMs` remain null. MISSED/grace evaluation, SQLite history, business-level success, runner/log integration and reliability metrics are deferred to their planned stages.
- Runtime is local-only and network-independent; initial Maven dependency download needs network access. No cloud/account/telemetry dependency was introduced.

## Follow-up recommendations

1. PM should confirm how Stage 2 presents `status`, `lastRunStatus`, `collectedAt` and PARTIAL/ERROR together so prior success and collection uncertainty cannot be mistaken for today's success.
2. Use captured daily/weekly trigger shapes as input for Stage 4 planning. Preserve nulls and do not infer MISSED from the aggregate missed counter.
3. Evaluate request coalescing/poll frequency when UI refresh is introduced; current collection is deliberately on demand with a bounded process timeout.

## Next stage

Stage 2 should connect the existing UI to the backend while preserving its design, implement refresh/filter/detail and clear collection-error presentation, and verify desktop/narrow layouts and missing/long/large datasets. **Stage 2 has not been started.**
