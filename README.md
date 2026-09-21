# Local Dashboard

Windows Task Scheduler 的本機唯讀觀測服務。目前只完成 `PLAN.md` 的 **Stage 0 + Stage 1**。
`index.html` 是原始 UI 基準，頁面仍全部使用 mock data；API 尚未接入 UI。

## 環境與啟動

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

瀏覽 <http://127.0.0.1:8080/>（原始 mock UI），或查詢 API：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/jobs | ConvertTo-Json -Depth 16
```

按 Ctrl+C 停止。若 8080 已被占用，在 Java 指令最後加上 `--server.port=8081`。
預設只綁定 `127.0.0.1`，沒有 LAN listener。不要為本機儀表板改成公開介面。
服務不會註冊／修改／啟動／停止任何 Windows 排程，也不會改系統 execution policy。

## 選擇要監控的 tasks

預設 `include: []`，API 明確回傳 `NOT_CONFIGURED`，且不啟動 PowerShell。
複製範例後依自己的 tasks 編輯（此檔已列入 `.gitignore`）：

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
    exclude:
      - '\My Tasks\Disabled job'
    missed-grace-minutes: 15
    timeout-seconds: 30
```

- YAML 路徑使用**單引號**，保留 Windows 反斜線。
- 選擇器是**字面值、大小寫不敏感**；沒有 wildcard／正規表示式。`*`、`[`、引號、空白與中文皆視為名稱內容。
- 開頭 `\`、結尾 `\` 表示資料夾子樹；只有 `\` 表示全部可列舉 tasks。
- `exclude` 永遠優先；重複 include 不會產生重複工作。同名不同資料夾保留不同 ID。
- `unmatchedIncludes` 表示列舉結果中沒有符合的 selector；可能不存在或目前身分無法看見，不假裝知道原因。明確排除的已找到工作不算 missing。
- 改設定後重新啟動。從其他目錄啟動時加上 `--spring.config.additional-location=file:C:/path/to/config/application.yml`。
- `timeout-seconds` 範圍 1–120；超時會終止本次 collector process。
- `missed-grace-minutes` 範圍 0–1440，預設 15，**Stage 1 只保留設定，不執行 MISSED 推算**。

## API 與狀態契約

`GET /api/jobs` 每次重新讀取，無持久化、無舊快照 fallback，回應有 `Cache-Control: no-store`：

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
FAILED 表示最近一次已知失敗，不代表今天那個執行視窗失敗。Stage 2 必須尊重此區別，Today 歸屬需另行決定。

沒有執行時間時不把 `0` 當成功；`0x00041303` 表示從未執行；正在執行或 scheduler 資訊碼不代表已完成。
負值結果保留在 `raw`，normalized `lastTaskResult` 轉成 unsigned 32-bit。時間保留來源 offset 於 `raw`。
`MISSED` 保留於 enum，但 Stage 1 不產生此分類；不使用 `NumberOfMissedRuns` 代替可靠的執行視窗判定。

`GET /api/jobs/{id}` 只能查詢目前 server 設定篩選出的工作；不接受任意 task path 或 shell command。
找不到 ID 回 404 `JOB_NOT_FOUND`。所有 API 都是唯讀，無 run／refresh mutation endpoint。

| 情況 | HTTP / collectionStatus |
| --- | --- |
| 收集正常（包括明確排除全部的空結果） | 200 / OK |
| 未設定 include | 200 / NOT_CONFIGURED |
| 部分 task 權限不足／資料不完整／include 未匹配 | 200 / PARTIAL，查看 errors／unmatchedIncludes |
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

它比對範例列出的全部 5 個 tasks、detail API 與 task definition 前後 SHA-256；
輸出 `target/live-verification.json`。其他設定可傳 `-ExpectedTaskKeys` 與 `-BaseUrl`。
若 task 恰好在收集與比較之間自然執行，值可能變動；等待該次執行完成再重新比對。
實際本次驗收、限制與後續建議見 [docs/STAGE-0-1.md](docs/STAGE-0-1.md)。

## 範圍與參考

沒有 UI 串接、SQLite history、MISSED 偵測、runner、logs、30-day reliability；依 `PLAN.md` 分別屬於後續 stages。
本次不更動 `PLAN.md` 或 `index.html`。

- [Microsoft Task Scheduler result codes](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-error-and-success-constants)
- [Spring Boot 3.5 system requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html)
