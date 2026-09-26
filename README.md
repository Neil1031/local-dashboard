# Local Dashboard

Windows Task Scheduler 的本機唯讀觀測服務。目前另提供 **Stage 5A 獨立 Runner Core**（待 Manager Review）。
`index.html` 保留原有粉色 UI，透過 `dashboard.mjs` 讀取真實 `/api/jobs`；runtime 不含 mock scheduler data。
UI job metadata、台股／美股分組、排序與舊版顯示切換見 [Stage UX-1](docs/STAGE-UX-1.md)。
流程概覽、日期型工作收納與 Today 列表數量語意見 [Stage UX-2](docs/STAGE-UX-2.md)。
可編輯的 Dashboard 顯示設定、外部持久化與衝突處理見 [Stage UX-3](docs/STAGE-UX-3.md)。

## 環境與啟動

**Windows 雙擊使用**：建置者執行 `.\scripts\package-windows.ps1`，使用者雙擊
`dist/LocalDashboard/LocalDashboard.exe`（內含 Java runtime，自動開瀏覽器，重複雙擊重用服務）。
桌面捷徑：`.\scripts\install-shortcut.ps1`，建立 **Local Dashboard** 與 **Stop Local Dashboard**。
停止捷徑使用 `LocalDashboard.exe --stop`，核對程序身分後只停止本 Dashboard；瀏覽器保持開啟。
設定與 data 預設保存於 `%LOCALAPPDATA%\LocalDashboard`；
首次雙擊會在設定檔缺少時自動建立五個既有 tasks 的監控設定，不需手動建立 YAML；已有設定絕不覆寫。
既有設定／history 的沿用方式、建置與 debug 詳見 [Windows launcher](docs/WINDOWS-LAUNCHER.md)。
以下是開發者／手動 JAR 啟動方式。

- Windows 10/11，Windows PowerShell 5.1 與內建 `ScheduledTasks` module。
- JDK 21–25，將 `JAVA_HOME` 指向 JDK 目錄。建置目標為 Java 21。
- 不需要安裝 Maven；repository 附 Maven Wrapper（Maven 3.9.11）。
- 第一次建置需要從 Maven Central 下載 Maven／依賴；**封裝後啟動與收集不需網路、帳號或外部 API**。
- 使用一般使用者執行即可開啟服務；只能讀取該 Windows 身分有權檢視的 tasks。

在 repository 根目錄的 PowerShell 執行：

```powershell
# 依自己的 JDK 安裝位置設定
$env:JAVA_HOME = 'C:\path\to\jdk-21'
& .\mvnw.cmd -B clean verify
& "$env:JAVA_HOME\bin\java.exe" -jar .\target\local-dashboard-0.1.0.jar
```

瀏覽 <http://127.0.0.1:8080/>，或查詢 API：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/jobs | ConvertTo-Json -Depth 16
```

按 Ctrl+C 停止。若 8080 已被占用，在 Java 指令最後加上 `--server.port=8081`。
預設只綁定 `127.0.0.1`，沒有 LAN listener。不要為本機儀表板改成公開介面。
服務不會註冊／修改／啟動／停止任何 Windows 排程，也不會改系統 execution policy。

## 選擇要監控的 tasks

Windows EXE 會將唯一範本 [`config/application.example.yml`](config/application.example.yml) 寫入缺少的外部設定檔，
預設選取範本中的五個既有 tasks；`LOCAL_DASHBOARD_HOME` 覆寫目錄也適用。已存在的設定原樣保留。
以下手動 JAR 啟動方式仍預設 `include: []`，API 回傳 `NOT_CONFIGURED`，且不啟動 PowerShell。
手動 JAR 使用者可複製範例後依自己的 tasks 編輯（此檔已列入 `.gitignore`）：

```powershell
Copy-Item .\config\application.example.yml .\config\application.yml
```

```yaml
dashboard:
  scheduler:
    include:
      - 'InsiderTracker-Market'       # 各資料夾的同名 task
      - '\Research\Daily Report 中文' # 完整 TaskPath + TaskName
      - '\My Tasks\'                # 此資料夾及其子資料夾
      - '\AIStockHunter-Accumulation-Check-*' # 日期型一次性檢查
    exclude:
      - '\My Tasks\Disabled job'
    missed-grace-minutes: 15
    timeout-seconds: 30
```

- YAML 路徑使用**單引號**，保留 Windows 反斜線。
- 選擇器**大小寫不敏感**。只有非空 prefix 後的單一末尾 `*` 表示 prefix match：開頭 `\` 比對完整路徑，否則比對 task name。
- 不支援完整 glob／regex；`*abc`、`a*b`、`a*b*`、單獨 `*`、`?`、`[` 皆維持字面值，不能擴大匹配。include／exclude 使用相同規則。
- 開頭 `\`、結尾 `\` 表示資料夾子樹；只有 `\` 表示全部可列舉 tasks。
- `exclude` 永遠優先；重複 include 不會產生重複工作。同名不同資料夾保留不同 ID。
- `unmatchedIncludes` 表示列舉結果中沒有符合的 selector；可能不存在或目前身分無法看見，不假裝知道原因。明確排除的已找到工作不算 missing。
- 改設定後重新啟動。從其他目錄啟動時加上 `--spring.config.additional-location=file:C:/path/to/config/application.yml`。
- `timeout-seconds` 範圍 1–120；超時會終止本次 collector process。
- `missed-grace-minutes` 範圍 0–1440，預設 15，**Stage 1 只保留設定，不執行 MISSED 推算**。

## API 與狀態契約

`GET /api/jobs` 每次重新讀取，將可確認的 completed execution 保存至本機 SQLite；current data 無舊快照 fallback，回應有 `Cache-Control: no-store`：

```json
{
  "collectionStatus": "OK",
  "collectedAt": "2026-09-21T02:00:00Z",
  "jobs": [],
  "errors": [],
  "unmatchedIncludes": []
}
```

上方只是回應結構範例。設定有匹配 task 時，`jobs` 包含：

| 欄位 | 意義 |
| --- | --- |
| `id` | 完整 task path + name 小寫後的 UTF-8 Base64URL，不是 task name；供 detail URL 使用 |
| `name`, `taskPath`, `description`, `enabled` | 已正規化的識別與設定 |
| `state` | 排程器當下狀態：READY／RUNNING／DISABLED／QUEUED／UNKNOWN |
| `status` | Stage 1 的目前狀態；參見下方規則 |
| `lastRunStatus` | 可判定的最近一次執行結果：SUCCESS／FAILED／UNKNOWN |
| `lastRunAt`, `nextRunAt` | UTC ISO-8601；未提供或 sentinel 日期為 null |
| `lastTaskResult`, `resultText` | unsigned 32-bit Windows 結果與說明，不等同業務成功 |
| `scheduledAt`, `durationMs` | Stage 1 一律 null，來源不足時不猜測 |
| `triggers` | 可用 trigger type 與原始屬性（含 repetition），尚未推算執行視窗 |
| `raw` | collector 的原始 TaskName／TaskPath／State／Enabled／時間／result／trigger／error 等證據 |
| `warnings`, `source` | normalization 警告；來源固定 WINDOWS_TASK_SCHEDULER |

`status` 規則：資料不完整或 task info 收集失敗 → UNKNOWN；正在執行 → RUNNING；停用 → DISABLED；
READY 工作若最近可確認結果失敗 → FAILED，否則 READY。QUEUED／未知 state → UNKNOWN。
所以**未到期工作不會因上次成功而變成 SUCCESS**，但仍能在 `lastRunStatus` 看見 SUCCESS。
FAILED 表示最近一次已知失敗，不代表今天那個執行視窗失敗。Today 頁籤顯示目前排程概況，不推算今日執行視窗。

沒有執行時間時不把 `0` 當成功；`0x00041303` 表示從未執行；正在執行或 scheduler 資訊碼不代表已完成。
負值結果保留在 `raw`，normalized `lastTaskResult` 轉成 unsigned 32-bit。時間保留來源 offset 於 `raw`。
`MISSED` 保留於 enum，但 Stage 1 不產生此分類；不使用 `NumberOfMissedRuns` 代替可靠的執行視窗判定。

`GET /api/jobs/{id}` 只能查詢目前 server 設定篩選出的工作；不接受任意 task path 或 shell command。
找不到 ID 回 404 `JOB_NOT_FOUND`。所有 API 對 Windows scheduler 都是唯讀；讀取 snapshot 會保存本機 observed history，無 run／refresh mutation endpoint。

| 情況 | HTTP / collectionStatus |
| --- | --- |
| 收集正常（包括明確排除全部的空結果） | 200 / OK |
| 未設定 include | 200 / NOT_CONFIGURED |
| 部分 task 權限不足／資料不完整／include 未匹配 | 200 / PARTIAL，查看 errors／unmatchedIncludes |
| Scheduler collection 成功但 history 儲存失敗 | 200 / PARTIAL，保留 current jobs，errors 包含 HISTORY_PERSISTENCE_FAILED |
| PowerShell 無法啟動、列舉失敗、timeout、JSON 無效或不支援的平台 | 503 / ERROR，提供 code／message，不回偽造空 jobs |

PowerShell stdout/stderr 各有 8 MiB 上限。錯誤時不回傳任意主機 stderr，以免洩漏敏感內容；
個別 task info 錯誤保留於 `raw.CollectionError`／`errors`。本機其他程式仍可存取 loopback API；本版沒有登入。

## 驗證

```powershell
& .\mvnw.cmd -B clean verify
```

包含 normalization、task selection、Spring HTTP API 與真正 PowerShell process 的 fixture 測試。
PowerShell fixtures 替換讀取 cmdlet 為記憶體資料，不建立測試排程；Windows 以外會略過這組測試。
涵蓋空清單／單筆、Unicode、特殊字元、資料夾、result code、sentinel／offset、權限拒絕、collector failure 與 timeout。

依範例設定啟動服務後，可執行實機唯讀比對：

```powershell
& .\scripts\verify-live.ps1
# 若本機要求簽章，先檢視腳本；可用同一 PowerShell session 直接執行已檢視的內容：
& ([scriptblock]::Create((Get-Content -Raw .\scripts\verify-live.ps1)))
```

它比對五個固定監控 tasks 與目前所有日期型 accumulation checks、detail API 與 task definition 前後 SHA-256；
輸出 `target/live-verification.json`。其他設定可傳 `-ExpectedTaskKeys` 與 `-BaseUrl`。
若 task 恰好在收集與比較之間自然執行，值可能變動；等待該次執行完成再重新比對。
Stage 0 + 1 的歷史驗收見 [docs/STAGE-0-1.md](docs/STAGE-0-1.md)；UI 串接驗收見 [docs/STAGE-2.md](docs/STAGE-2.md)。

## Stage 2 UI 行為

- 請從服務網址開啟，不能直接雙擊 `index.html`；JavaScript module 與 API 由同一個本機服務提供。
- 初次載入及每次 Refresh 各呼叫一次 `GET /api/jobs`。收集中停用 Refresh，沒有自動輪詢；drawer、filters、history 頁籤都不增加 API collection。
- 列表同時顯示 Current 與 Last run；篩選器只篩 current status。READY + SUCCESS 表示目前等待執行、上次成功，不代表今天執行成功。
- 摘要為 Monitored、Last run success、Last run failed、Attention。Attention 計算 current FAILED / UNKNOWN / MISSED 工作數；collection 警告獨立顯示，不把警告數混成工作數。
- PARTIAL 保留可取得的工作，顯示 errors / unmatchedIncludes，摘要只涵蓋已取得的工作。NOT_CONFIGURED 提示設定 include；OK 空列表顯示沒有可顯示的排程。
- 載入期間與錯誤後不顯示舊列表／摘要；無 mock fallback。Last refresh 是最近成功取得回應的 collectedAt（含 PARTIAL / NOT_CONFIGURED），失敗不更新。
- drawer 使用既有列表物件，顯示狀態、enabled、時間、result、description、warnings；空值顯示 `—`。日期含日期與時間，以瀏覽器本機時區呈現。
- MISSED 只在 API 明確回傳 MISSED 時顯示；不根據日期、nextRunAt 或 NumberOfMissedRuns 推算。7-day history 現由下方 Stage 3B 唯讀 API 提供資料。
- Filter 支援 Tab / Enter / Space；頁籤支援左右方向鍵 / Home / End；drawer 支援 Close / Escape / 點遮罩，關閉後焦點回到原工作。

## 前端測試（不增加 runtime 相依套件）

使用 Node.js 22+；純 mapping 測試只使用 Node 內建 test runner：

```powershell
node --test tests/dashboard.test.mjs tests/history.test.mjs
```

瀏覽器測試使用 Playwright 與已安裝的 Microsoft Edge。僅將測試工具裝在忽略的目錄，無前端編譯流程：

```powershell
npm install --prefix .tools/browser-tests --no-save --package-lock=false playwright@1.62.1
node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
```

也可透過 `NODE_PATH` 使用既有 Playwright。測試會在隨機 loopback port 提供 HTML/JS，
以 mocked HTTP responses 驗證狀態、收集錯誤、loading、refresh 去重、空值、25 筆資料、Unicode、文字注入、鍵盤和 320/375/820/1280px 版面。
測試 fixture 不封裝進應用程式。截圖寫入忽略的 `target/stage-2/`。

真實服務的 browser acceptance 需先依上方步驟建置並啟動封裝 JAR，設定至少一個可讀取的 task，再明確啟用：

```powershell
$env:DASHBOARD_LIVE_URL = 'http://127.0.0.1:8080'
node --test tests/live-browser.test.mjs
Remove-Item Env:DASHBOARD_LIVE_URL
```

此測試不 mock HTTP：捕捉 UI 自己取得的列表、逐筆驗證列表與 drawer、確認初次載入與 Refresh 共兩次 GET、無 detail API 請求，
並寫出 `target/stage-2/live-ui.json` 與桌面／窄版截圖。未設定環境變數時會明確 skip，不視為實機通過。
Maven 驗證後端與靜態資源封裝；Node 測試需另外執行。

## Stage 3A — 本機 observed execution history

預設檔案為 **`data/local-dashboard.db`**，相對於啟動時的工作目錄。首次啟動自動建立父目錄、SQLite 檔案與 schema；
restart 時必須指向同一檔案，才會保留原有 history。可在 `config/application.yml` 設定：

```yaml
dashboard:
  history:
    database-path: data/local-dashboard.db
    busy-timeout-ms: 2000
```

也可用 `--dashboard.history.database-path=C:/local-data/dashboard.db` 指定固定絕對路徑。
SQLite 是本機檔案，無外部 DB server；`data/`、常見 DB 副檔名與 journal/WAL sidecars 已忽略，不可 commit。
Python、Node、Playwright 只用於驗收，執行服務只需要 Java 與既有 PowerShell。

- **Observed history，非完整 Windows audit log**：只保存 dashboard 收集到、且 Stage 1 normalization 有足夠完成證據的 execution。
  若 dashboard 關閉三天，task 跑了 20 次，但 Windows 只提供最後一次，重新開啟時只能保存最後觀察到的那次；不補造另外 19 筆。
- 建立 run 必須同時符合 `lastRunAt != null` 且 `lastRunStatus` 是 `SUCCESS` 或 `FAILED`。
  RUNNING、informational result、never-run、時間缺失或 collection incomplete 不建立 completed run。
  `lastTaskResult = 0` 本身不是執行證據。Disabled job 若有可靠的 completed last run，仍會保存該次歷史。
- Identity 固定為 **Stage 1 job ID + normalized UTC lastRunAt**；資料庫 `UNIQUE(job_id, observed_run_at)` 與 UPSERT
  保障 Refresh、多 tab、併發 request、application restart 都不重複。同一次 execution 後來的 outcome/result/message 更新同一筆。
  較舊 `collectedAt` 不覆蓋較新 metadata；UNKNOWN observation 不會降級已保存的 completed run。
- `job` 保存 task path/name、nullable enabled（未知不假裝 disabled）、first/last seen；`job_run` 保存 outcome、scheduler result、
  message、raw JSON、first/last observed。`observed_run_at` 是 scheduler 的 LastRunTime，不是完成時間；目前 duration 為 NULL。
  時間儲存成固定 9 位小數的 UTC ISO-8601；瀏覽器本機時區／台北午夜不影響 identity。
- 每份 normalized snapshot 是一個 `BEGIN IMMEDIATE` transaction；foreign keys 開啟、synchronous FULL，使用 SQLite 預設 rollback journal。
  busy timeout 預設 2000ms（可設 1–10000ms，單次 lock wait 上限）。有寫入錯誤就 rollback，下一次 Refresh 可重試。
- Schema 版本存於 `PRAGMA user_version`，目前為 **1**，DDL 在 `src/main/resources/db/migration/V1__observed_history.sql`。
  migration 與 version bump 在同一 transaction。未來新增循序 migration，不修改已發佈的 V1。
  不支援的較新版本、非空但未標版本的 DB、損壞 schema 均明確失敗；不會 drop history 或偷偷重建。
- 啟動時 DB 不可用仍保留 current scheduler service，server log 記錄初始化錯誤。
  每次 configured collection 都重試 schema 檢查與保存；失敗回 `PARTIAL` + `HISTORY_PERSISTENCE_FAILED`，保留 jobs 與既有 diagnostics。
  browser 不會收到 DB path、SQL 或 database exception。無監控設定仍為 `NOT_CONFIGURED`；collector 本身失敗仍為 503。
  DB 修復後後續 observation 自動恢復。請先停服務、備份原始檔再由操作者修復；應用程式不自動刪除損壞 DB。
- Stage 3A 當時保留 UI、filters、drawer 與 unavailable 提示，僅提供 bounded internal read；Stage 3B 現已加入下列 public history API/UI。

Stage 3A 後端 tests 使用隔離 temporary DB，包括 application context restart、8 個獨立 repository 同時初始化／寫入、
直接 SQL UNIQUE rejection、rollback、corrupt/locked/unavailable DB 與 HTTP 安全錯誤呈現。
新增的 browser fixture 驗證 `HISTORY_PERSISTENCE_FAILED` 可見且 current jobs 保留。

實機唯讀驗收（Python 3.11+，使用範例設定列出的 5 個既有 tasks）：

```powershell
# 先完成 Maven verify；Node 22+ 與 Playwright 設定同上。
python scripts/verify-history-live.py --java "$env:JAVA_HOME/bin/java.exe" --node node
```

此腳本以獨立 DB 啟動兩次封裝服務，驗證 10 次觀察、restart、3 次觀察及真實 browser load/Refresh，
用 Python SQLite 獨立讀取 DB 並比對每筆 observed identity、run ID、結果與 raw evidence。
另外比對 Windows 當下值、所有 5 個 monitored task definition hashes，最後只停止它自己啟動的 dashboard processes。
收據、DB、logs 放在忽略的 `target/stage-3a/live-*/`；截圖沿用 `target/stage-2/`。
若 task 在比較途中自然執行而造成不同，腳本會失敗，待完成後重新驗證；不會啟動 task 製造資料。
完整 Gate 與限制見 [docs/STAGE-3A.md](docs/STAGE-3A.md)。

## Stage 3B — 7-day history

7-day history 顯示瀏覽器本機時區「包含今天」的 7 個日曆日。瀏覽器以本地午夜計算起點及明日午夜終點，
轉成 UTC 查詢；不是從現在減去 168 小時，因此可跨夏令時間變換。

```text
GET /api/history?from=2026-09-14T16%3A00%3A00Z&to=2026-09-21T16%3A00%3A00Z
```

- `from` / `to` 必填，格式 `YYYY-MM-DDTHH:mm:ss[.1至9位小數]Z`（四位西元年、UTC、有效日期時間）。
  必須 `from < to`，最多 31 × 24 小時；查詢採 **`from <= observedRunAt < to`**。
  無效範圍回 400 `INVALID_HISTORY_RANGE`；DB 不可讀回 503 `HISTORY_UNAVAILABLE`，錯誤不包含 DB path／SQL／原始 exception。
- 成功回 `{from, to, jobs}`，每個 job 是 `{id, taskPath, taskName, enabled, runs}`。
  `runs` 含 `{id, observedRunAt, outcome, schedulerResult, durationMs, message}`，依時間升冪。
  `enabled` 可為 null；`outcome` 僅 SUCCESS／FAILED；result、duration、message 保留 null。
  空區間回 `jobs: []`；只有區間內有 execution 的 DB jobs 才進入回應。不傳 raw evidence 或 observation metadata。
- 此 endpoint 只開 SQLite 唯讀連線，用 prepared statement 查詢；不建立目錄／檔案／schema、不寫 observation、
  不呼叫 `/api/jobs`、collector、PowerShell 或 Windows Task Scheduler。使用 `Cache-Control: no-store`。
  Schema v1、UTC run identity 及 UNIQUE constraint 都維持原樣。
- 首次切換 History 才讀取；每個 range 一次 request，cell/drawer 不送 request。
  同頁 cache 在成功取得 Current Refresh 後過期：History 可見則重新讀取，否則下次切換才讀取。
  切換時會重新計算日期邊界。Retry history 只重試 history；沒有背景輪詢或跨分頁 cache 同步。
- Rows 是最近成功 current snapshot 與 history jobs 按 ID 的聯集；current 名稱優先。
  Current job 沒 history 仍顯示七個 `—`；只在 history 的工作使用 DB 名稱／路徑及 `History only` 標記，不推定為 deleted。
- 每個 job/day：無 observed runs → `—`；一筆成功 → 綠色 `✓`；一筆失敗 → 紅色 `!`。
  多筆顯示總次數（例如 `✓ 3` / `! 3`）；**任一失敗即為紅色，後來成功不會抹掉當天失敗**。
- 有執行的 cell 可點擊或 Tab／Enter／Space 開啟 history detail，依時間列出全部 observed executions、
  本地時間、結果碼及 message；duration 無值不顯示。Escape／Close 關閉並回到原 cell。
  Current 與 History 使用同一 drawer，但有明確 mode 及不同內容。空格不是 button。
- 窄版表格可局部水平捲動、工作名稱固定在左側；長名稱換行；狀態同時使用符號、次數及 accessible label。
- History 有獨立 loading/error 與 retry，不清除 Today snapshot，也不改成 collector error。
  **這是 observed completed executions，不是完整 audit trail；缺資料不是 MISSED，Success 不是業務成功證明。**

可重現的實機驗收：使用 Stage 3A 已累積的 DB（必須有最近七天的真實記錄）。工具透過 SQLite backup 複製到隔離驗收目錄，
原檔保持不變；正常 Today 讀取可能對副本新增 observation，但不會啟動任何 scheduled task。

```powershell
python scripts/verify-history-ui-live.py --source-db C:/local-data/existing-observed.db --java "$env:JAVA_HOME/bin/java.exe" --node node
```

驗收啟動封裝 JAR、執行 Today/History browser 測試，以 Python SQLite 獨立比對每筆 DTO／count／outcome，
反覆讀 history 並驗證 DB 位元組和觀察時間不變，檢查 5 個既有範例 tasks 的 definition hashes。
工具只停止自己啟動的 dashboard process。證據寫入忽略的 `target/stage-3b/`；完整驗收見 [docs/STAGE-3B.md](docs/STAGE-3B.md)。

## 範圍與參考

Stage 4 的可靠 MISSED 偵測依 Manager 決策暫緩；目前不推算 MISSED。
Stage 5A 提供以下本機 runner；尚無 receipt UI/API、logs UI 或 30-day reliability。
Stage 5B 單一 task pilot 已進行遷移與 rollback 驗證，但真實排程啟動未通過，最終恢復 original Action；
完整結果與證據界線見 [`docs/STAGE-5B.md`](docs/STAGE-5B.md)。尚未保留任何正式 task migration。

Stage 5B Retry attempt 1 的 principal 字串比對失敗紀錄保留於
[`docs/STAGE-5B-RETRY.md`](docs/STAGE-5B-RETRY.md)。Manager 授權的 identity fix／attempt 2
已通過 canonical SID、Scheduler preflight 與 controlled integrity；唯一一次正式 weekly
回傳 1，因此依規則 exact rollback，最終仍是 original Action，整體 Gate 為 FAILED。
Ambient system-task drift 另記為 `EXTERNAL_DRIFT_OBSERVED`；詳見
[`docs/STAGE-5B-RETRY-IDENTITY-FIX.md`](docs/STAGE-5B-RETRY-IDENTITY-FIX.md)。

- [Microsoft Task Scheduler result codes](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-error-and-success-constants)
- [Spring Boot 3.5 system requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html)
- [Xerial SQLite JDBC](https://github.com/xerial/sqlite-jdbc)（3.53.4.0；Apache-2.0 / BSD-2-Clause）
- [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)、[transactions](https://www.sqlite.org/lang_transaction.html)、[user_version](https://www.sqlite.org/pragma.html#pragma_user_version)

## Stage 5A — 獨立本機 runner

建置會額外產生 `target/local-dashboard-0.1.0-runner.jar`。此 JAR 使用獨立 main，**不啟動 Spring、HTTP 或 SQLite**，
dashboard service 關閉也可執行。現有 dashboard JAR、scheduler、observed history 與 UI 行為不變。

```powershell
# 先建置，再複製並編輯本機設定：填入真正的 Java executable 與工作目錄絕對路徑。
& ./mvnw.cmd -B verify
Copy-Item ./config/runner.example.json ./config/runner.json
& "$env:JAVA_HOME/bin/java.exe" -jar ./target/local-dashboard-0.1.0-runner.jar run ./config/runner.json test-java-version
$LASTEXITCODE
```

範例只執行 `java -version`；不是正式 task，也不建立 Task Scheduler entry。設定檔採 UTF-8 JSON，完整範例見
[`config/runner.example.json`](config/runner.example.json)。`config/runner.json`、`data/` 與測試 artifacts 已忽略，不提交秘密設定。

Dashboard 的 Today drawer 可唯讀顯示 Runner receipts。將私人 Dashboard `application.yml` 的
`dashboard.runner.config-path` 設為已部署 Runner `config/runner.json` 的絕對路徑；
它會從該設定讀取 primary/fallback receipt roots。內建只對應每週檢查 pilot，
其他 task 須以 `dashboard.runner.mappings` 明確列出完整 Scheduler task 路徑與 profile ID。
詳見 [`docs/STAGE-RUNNER-RECEIPTS-UI.md`](docs/STAGE-RUNNER-RECEIPTS-UI.md)。

- CLI 僅接受 `run <trusted-config.json> <profile-id>`。沒有動態 args、web command endpoint 或 HTTP dependency。
- Profile ID / job ID 為 1–64 字元小寫英文字母、數字、連字號，首字母須為英文字母；使用無秘密的穩定名稱。
- `executable` 與 `workingDirectory` 必須是絕對路徑；`args` 是必填字串陣列，不做 shell interpolation。
  Windows executable 必須是 `.exe`。腳本應明確指定 interpreter，例如 `python.exe` 或 `powershell.exe -File ...`。
  不要自行替每個 Windows arg 包外層雙引號；空白與內嵌引號由 JDK 處理。Shell profile 內的腳本文字仍屬受信任本機程式。
- v1 非互動執行，child stdin 為 EOF；environment 繼承 runner process。Receipt 不保存 environment、args、executable path 或 cwd。
- `receiptDirectory` 相對於 **config 所在目錄**，不是 runner 啟動 cwd。範例為 repository 的 `data/receipts`。
  `fallbackDirectory` 可選、同樣相對 config；省略時為使用者 home 下 `.local-dashboard/runner-fallback`。
  建議兩者使用具有正常本機 ACL 的固定本機目錄，不使用網路 share。
- 主儲存失效 → fallback → 若兩處皆失效，stderr 印出固定 `RUNNER_RECEIPT_UNAVAILABLE` 與 execution ID。
  **不因 observability 失效略過 child 或修改 child exit code**。兩處與 stderr 都不可用時無法保證留下證據。
- Child exit 0 → runner 0 / `SUCCESS`；非零原樣傳回 / `FAILED`。這只是 child process 返回結果，不是 BUSINESS_SUCCESS。
  無法啟動 → runner 127 / `START_FAILED`，child exitCode 與 processStartedAt 為 null；無效 config/profile → 64，沒有 child。
  真正 child exit 127/64 仍是 `FAILED`，必須由 receipt 區分，不能只看數值。
- **沒有自動 execution timeout／termination／retry**，不 kill descendants。Exit/duration 描述直接 child；
  profile 應使用會等待實際工作結束的 foreground command，不用 `start` / detach 來冒充工作完成。
- stdout/stderr 同時 drain，超過每 stream 64 KiB sample 上限仍持續讀取。只存 byte count、sample size、truncated、complete、readFailed，
  **不存 output text、tail 或 hash**。sample 只在記憶體暫存。Direct child 結束後最多等待 5 秒讓兩個 streams 收尾；
  descendants 保有 pipes 時記 `complete=false`，仍保留 direct child exit。這個 5 秒不是工作執行 timeout。

每次 invocation 的唯一 ID 是 `jobId_epochMilliseconds_UUID`；retry／restart 是新 execution，不自動重跑不完整工作。
每個 ID 下最多三份 immutable lifecycle snapshots，代表 **一份 logical receipt**：

```text
data/receipts/<executionId>/
  00-started.json
  01-process-started.json
  02-terminal.json
```

`schemaVersion=1`。先寫臨時檔、force，再同目錄 atomic move 發佈；專屬目錄原子 claim 防止兩個 invocation 覆寫。
原始 started evidence 保留。主儲存中途失效時 fallback 的 self-contained terminal snapshot 沿用相同 ID；
internal `ReceiptFiles.read(List<Path>, executionId)` 合併 primary/fallback，只取最新 phase，identity 衝突會拒讀。
目前以這些檔案為 authoritative receipt store；**尚未 ingest 到 SQLite 或顯示在 dashboard**。
沒有更動 SQLite v1；file schema version 與 DB schema 分開。未知／損壞版本拒讀，不自動重建或覆寫。

已發布 started/process-started、但沒有 terminal 的 receipt 一律為 **INCOMPLETE / UNKNOWN**，可能是尚未結束、runner crash、失去終端證據；
不能宣稱 SUCCESS、永久 RUNNING 或 MISSED。不要只憑 elapsed time 自動 rerun；先查 child 自身結果。
只有 claimed directory 或 `.pending-*`、沒有任何正式 phase 檔案時，代表 **no published receipt evidence**；
single-root reader 回 `Optional.empty()`，不阻擋其他 fallback root。任何已發布 phase 的 corruption／版本／identity／lifecycle 錯誤仍會拒讀，
即使另一 root 有有效 receipt 也不忽略錯誤。
詳細 crash、去重、format evolution、retention 與 privacy 策略見 [`docs/STAGE-5A.md`](docs/STAGE-5A.md)。

封裝 runner 的 Windows test-only acceptance（不啟動 Spring，不使用 Task Scheduler）：

```powershell
python scripts/verify-runner.py --java "$env:JAVA_HOME/bin/java.exe"
```

使用 `target/test-classes` 的 fixture，驗證 exit、Unicode、雙 stream 大輸出、fallback、併發、crash/restart 與 descendants；
只中止 verifier 自己啟動的 runner，finite fixture child 會自行結束。結果寫入 `target/stage-5a/runner-*/verification.json`。
