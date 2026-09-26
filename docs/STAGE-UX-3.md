# Stage UX-3 — Editable Dashboard job settings

## Plan

| Stage | Goal / scope | Dependencies | Gate | Done when / Self-QA |
| --- | --- | --- | --- | --- |
| 1 | Freeze `ddcb1680` baseline and Scheduler definitions | Clean `main` | Branch and read-only inventory | `implement/dashboard-ux-settings` exists; seven Dashboard task XML hashes recorded |
| 2 | Add versioned user override storage and API | Existing UX-1 defaults | Validation, atomic replace, revision conflict, safe fallback | Unit and HTTP tests cover writes and failures |
| 3 | Add settings editor and immediate UI application | Existing UX-2 view code | Raw identity unchanged; no collector request on save | Today, History, Workflow and mobile browser checks pass |
| 4 | Run regressions and package acceptance | Stages 2–3 | Node, Maven, browser, packaged app, restart, Scheduler diff | Reviewable commit pushed; stop for Manager Review |

## Architecture and persistence

`dashboard.mjs` retains versioned defaults. The Spring settings API owns a separate UTF-8 JSON file at `%LOCALAPPDATA%\LocalDashboard\config\job-metadata.json` by default. `-Ddashboard.metadata.path=...` is available for isolated tests. Neither `/api/jobs` nor `/api/history` changes. Editing only calls the settings API and re-renders cached jobs and history. `Monitored` still counts the complete Scheduler snapshot.

The file schema is `{ "version": 1, "overrides": { ... } }`. A user entry contains only changed fields. Effective metadata uses field-level precedence: exact user override > pattern user override > exact default > pattern default > unknown fallback. The dated pattern applies only to valid `AIStockHunter-Accumulation-Check-YYYY-MM-DD` dates; exact dated keys take precedence. Raw Scheduler names, paths, IDs, and dated folding remain unchanged. Equal configured orders are resolved by raw task name; unknown fallback jobs retain incoming order.

`GET /api/settings/job-metadata` returns `{version,revision,overrides,warning}` with no-store caching. `PUT` accepts `{expectedRevision,overrides}`. Revision is the SHA-256 of the existing file bytes (`0` when absent); stale writes return HTTP 409. The server validates the complete new document, writes a temporary file in the destination directory, flushes it, then atomically replaces the old file. A failed write leaves the previous file in place and removes the temporary file. Corrupt JSON, unsupported versions, or invalid content are preserved without overwrite; the UI uses defaults and shows `自訂顯示設定無法載入，已使用預設值`.

The endpoint accepts at most 128 KiB and at most 256 metadata keys. Editable fields are `displayName` (1–100 chars), `market` (台股/美股/其他), `description` (up to 1000 chars), `order` (integer 0–10000), `hidden` (boolean), and `dependsOn` (up to 32 entries). Internal dependency identities use raw task names or metadata keys; external dependencies use text. Self references, unknown internal references, and cycles are rejected. The API accepts no file path, command, or Scheduler mutation input and returns error codes without filesystem paths. It is served on the existing loopback-only server.

## Settings UI

`⚙ 顯示設定` lists versioned metadata keys and the current raw jobs, including unknown names and the dated pattern. The raw Windows task name is read-only. The form edits display fields and simple dependency rows. `取消` restores the current effective values; per-job reset removes only that override; reset-all requires a confirmation. Save immediately re-renders Today, Workflow, and cached History without collection or history refetch. User text is inserted with `textContent`.

`hidden=true` hides a job only in Dashboard views. An explicit user hide cannot be undone through the legacy toggle. Collection, counts, history storage, and raw API identities remain unchanged. User overrides are local to this machine and are not synced with Git or the package.

For an unknown current task used as an internal upstream dependency, save that task's metadata first so its raw name becomes a known metadata key. The editor reports unknown internal references and suggests `外部前置` for an external condition.

## Verification and review boundary

Focused Java, Node, browser, packaged HTTP/UI, restart persistence, 320/375 layout, and read-only Scheduler definition comparisons are the stage gates. A complete Maven run requires an environment where `cmd.exe` can start normally, because Surefire's fork and one existing Runner test launch subprocesses. No Scheduler task is run or changed for this stage. Stop after pushing the implementation branch; merging into `main` requires Manager Review.
