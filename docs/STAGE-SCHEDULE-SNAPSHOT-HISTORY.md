# Stage A — Schedule Snapshot History

## Architecture

`/api/jobs` 每次維持一次 PowerShell collector 呼叫：collector → normalize → 既有 `HistoryObserver` → `ScheduleSnapshotObserver`。新 observer 使用同一份已正規化的 job 與同一個 `collectedAt`，沒有再次讀取 Scheduler，也不修改 Scheduler、Runner、receipt 或 job status。排程歷史只寫入 Dashboard 的既有 SQLite 檔案。

## Sanitized schedule definition

`ScheduleDefinition` 只取 `enabled`、Windows timezone ID、`StartWhenAvailable`、`WakeToRun`、`MultipleInstances`、`RunOnlyIfIdle`、`RunOnlyIfNetworkAvailable`，及各 trigger 的類型、ID、啟用狀態、boundary、日曆欄位、delay、repetition。保留 trigger 陣列，最多 32 筆。`StartBoundary`、`EndBoundary` 原文保留；有明確 offset/Z 時另存 UTC instant。無 offset 時標為 `LOCAL_WINDOWS_TIMEZONE`，並由版本的 `windowsTimezoneId` 提供觀測當時的時區背景。時區不可用則標為 `ZONE_UNAVAILABLE`。

不儲存 description、action、executable、args、帳號、SID、完整 XML、執行結果或任意 CIM 欄位。文字與陣列有長度上限，完整 JSON 上限 64 KiB；偵測到私有絕對路徑或 SID 的允許欄位會拒絕寫入，並回報 persistence warning。現有 `/api/jobs` 的 raw 技術資料契約沒有改動；上述限制針對新資料庫欄位。

目前只接受 time、daily、weekly、monthly、monthly day-of-week trigger。其他 trigger 因語意欄位未完整 allowlist，整批 schedule observation 會回滾並顯示 warning，避免把不完整的定義當成完整版本。

## Fingerprint

定義以固定 key 次序的 canonical JSON 表示，SHA-256 產生 fingerprint。Trigger 先按內容排序，再給予 `indexWithinVersion`；單純變更 collector 列舉順序不改 fingerprint，同內容的重複 trigger 仍保留兩筆。Windows trigger `Id` 若存在會保留；index 只在同一版本內有效。`collectedAt`、LastRunTime、NextRunTime、LastTaskResult、State、NumberOfMissedRuns 都不進 fingerprint。

## Version semantics

首次看到定義建立 `schedule_version`。相鄰觀測 fingerprint 相同時，只延長該版本的 `last_observed_at`，並另記 observation。fingerprint 改變、缺席後重新出現，或 timezone/enabled 改變都開新版本。A → B → A 為三個時間上的版本 episode，即使首尾 fingerprint 相同。較舊的延遲觀測不覆蓋較新的狀態，同時間但互相矛盾的觀測拒絕寫入。

## Observation semantics

`schedule_observation` 記每個 job、UTC 觀測時間、版本、`PRESENT`/`ABSENT_OBSERVED` 與 `OK`/`PARTIAL`。版本的 `previous_last_observed_at` 與 `first_observed_at` 形成變更區間 `(前次最後觀測, 新版首次觀測]`。區間內實際生效時間未知；未來 occurrence correlation 必須回報 ambiguous/UNKNOWN，不能把新版本首次觀測時間當成精確修改時間。

## Presence / absence semantics

只在 collector 完整、無 job 警告、無 unmatched include、既有 history 寫入成功時，對仍被目前 selector 包含但本次消失的**先前已觀測** job 記一次 `ABSENT_OBSERVED`。PARTIAL 只寫成功讀到的 present jobs；ERROR 與 NOT_CONFIGURED 完全不寫 schedule state。selector 變更、unmatched include、權限或 collector 錯誤不會推論 deletion。連續缺席不重複寫 tombstone，重新出現開新 episode。`ABSENT_OBSERVED` 不表示已證實刪除。

## Timezone handling

Collector 在每批快照輸出 Windows `TimeZoneInfo.Local.Id`、UTC `timezoneObservedAt`，與同批 `collectedAt`。版本保存 Windows timezone ID；時區變更改 fingerprint。無 offset boundary 只保存原文與時區背景，本 Stage 不推算 DST 或 occurrence，也不使用 JVM/瀏覽器時區改寫 boundary。

## Multi-trigger handling

每個 trigger 是獨立物件。fixture 涵蓋 Market 06:30、SyncImport 10:40、SEC 11:15、UnexplainedVolume-Daily 的週一至五 14:30 與 17:00 兩筆 trigger，以及 Accumulation-Weekly-Check 的週五 22:00。fixture 不包含舊 13:35。2026-09-26 只讀 Scheduler 定義核對了上述時段與啟用狀態；fixture 不包含 action、帳號或私有路徑。

## SQLite schema

版本 2 新增 `schedule_version` 與 `schedule_observation`，兩者有 job/時間索引、外鍵、presence/collection CHECK 與 `(job_id, observed_at)` 唯一約束。版本的 `(job_id, first_observed_at)` 唯一。既有 `job` 與 `job_run` 表及 `job_id + observed_run_at` 執行紀錄身分不變。寫入使用 `BEGIN IMMEDIATE`、交易、唯一約束；失敗回滾整批 schedule observation。

## Migration

既有 `HistoryRepository` 在同一交易內按順序執行 V1、V2 SQL，最後設 `PRAGMA user_version=2`。新 DB 與已知 V1 DB 均可升級，未知、損壞或未版本化且非空的 DB 仍拒絕採用；不重建既有表、不刪執行歷史。測試覆蓋新 DB、V1 升級、重新初始化、重啟與失敗回滾。

## Failure handling

Schedule persistence 失敗時 `/api/jobs` 保留本次 collector 的 job，但增加 `SCHEDULE_SNAPSHOT_PERSISTENCE_FAILED` diagnostic，使 `collectionStatus=PARTIAL`；服務不中斷，不假裝整體成功。既有 history 寫入失敗仍保留自己的 warning。完整收集才允許 absence；任何 history warning 都會關閉該次 absence 推論。

## Security

新 DB 欄位從明確 allowlist 建立。Trigger、陣列、文字及 JSON 均有界限，SQL 使用參數；沒有任意 job path 的新 HTTP endpoint。測試以敏感欄位與私有路徑注入檢查排除/拒絕。Collector 僅讀取 ScheduledTasks cmdlet，沒有 Scheduler 寫入命令。

## Tests

`ScheduleSnapshotTest` 驗證 canonical fingerprint、trigger reorder、daily/weekly/multi-trigger fixture、版本變更、觀測 gap、enabled/settings、timezone、absence、PARTIAL、ERROR、NOT_CONFIGURED、重啟、V1 升級、敏感欄位、並行去重及單次 collector 呼叫。`scripts/verify-schedule-live.py` 用正式封裝 JAR、臨時 DB 和五個唯讀 Scheduler task 驗證版本、trigger 與前後定義雜湊。

本分支最終驗收：Java 165/165 通過；Node/browser 40/40 通過；封裝 JAR 隔離驗收為五個 job、五個版本、五筆 present observation、trigger 數量 1/1/1/1/2，五個 Scheduler 定義前後相同；Windows app-image 冒煙測試通過 bundled runtime、HTTP readiness、safe empty config、SQLite 初始化和安全 Stop。驗收只證明本 Stage 的排程 snapshot 路徑；正式 Runner、實際排程執行、MISSED 與 occurrence correlation 未驗證。

## Limitations

本 Stage 不產生 MISSED、不執行 occurrence matching、不判斷機器可用性，也不補回第一次觀測前的歷史。沒有新增 UI 或 API；持久化可由測試與 SQLite 檢查。缺席代表完整快照中的觀測缺失，未證實 Windows task 已刪除。舊版 collector/測試 fixture 若未提供 timezone，版本保留 `null` 並標示 boundary timezone 不可用。

## Bridge to occurrence correlation

未來 Stage 可由 `schedule_version.id` 取得定義版本，從版本內 trigger ID 或 `indexWithinVersion` 建立 `triggerIdentity`，並獨立計算 `scheduledFor`。必須先檢查版本變更的觀測 gap；落在 gap 的 occurrence 不能選定唯一版本。此 bridge 不改目前 Runner receipt，也不把 schedule version 放進 `job_run` identity。
