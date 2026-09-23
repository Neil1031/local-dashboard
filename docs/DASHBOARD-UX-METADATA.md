# Dashboard UX Metadata／Workflow 設計提案

狀態：**PROPOSED／未實作／等待 Manager Review**，2026-09-23。
優先順序、完成盤點與其他未完成事項見 [BACKLOG.md](BACKLOG.md)。

## 目標與邊界

讓使用者知道「這是什麼工作、屬於哪個市場、需要什麼前置、影響哪些後續」，能調整顯示順序，且不被 legacy／日期型舊 task 淹沒。

**Windows Task Scheduler 管理真實執行；Dashboard 管理中文名稱、說明、分類、順序、依賴描述、隱藏與備註。**
這些 metadata 不寫入 Windows Description，也不改 Action／Trigger／Enabled／帳號／ACL。
它不是 workflow runner，不觸發、阻止、重排、重試或刪除任務；也不證明資料或前置步驟已完成。

現況：中文 aliases 在 `dashboard.mjs`；`JobService` 依 task path/name 排序；API `description` 是 Scheduler 原始 Description。
基本 UI、七日 history、完整 path/name identity 與原始證據已有，可在其上加入獨立 presentation metadata。

## Metadata contract（設計，非目前可用設定）

建議先用 Dashboard 外部 home 下的獨立、帶 `schemaVersion` 的 UTF-8 metadata 檔；**具體檔名／序列化與 API DTO 在 UX-A contract Gate 決定**。
不要把示意欄位加入現有 `application.example.yml`，以免使用者誤以為已支援。
metadata 與 scheduler include/exclude 分離；bootstrap／upgrade 不覆寫既有自訂值。

| 欄位／概念 | 規則 |
| --- | --- |
| stable identity | Scheduler 節點綁定完整 TaskPath + TaskName（沿用既有大小寫正規化 ID）；不使用中文 display name 當 key；外部節點用獨立 namespace |
| displayName／description | 中文、人可讀、純文字；保留 raw task name/path、raw Scheduler Description 在 technical detail，不改 API 原始證據語意 |
| market | `TW` 台股、`US` 美股、`OTHER` 其他／未分類；未知 task 可見，不猜市場 |
| order | 使用者可設定的顯示順位；預設市場（TW → US → OTHER）→ order → 可用 nextRunAt → identity，缺時間置後；同順位／時間以 identity 穩定排序 |
| dependsOn | 唯一儲存的前置關係集合；含 target、關係類型（資料前置／外部前置／僅顯示順序）與純文字註記；都是說明，不是執行控制 |
| downstream | 從 dependsOn 反向推導；UI 若提供「後置」編輯，寫回對方前置，避免兩套矛盾資料 |
| hidden／legacy | 明確的 presentation flag；預設隱藏特定已配置 legacy；disabled 不自動等於 legacy；可「顯示隱藏」 |
| notes | 使用者純文字備註；內容不解讀為 command、檔案讀取請求或 JS／HTML，不用來保存 credentials |
| family | 明確配置的日期型 task family、日期格式與同資料夾範圍；exact override 優先於 family defaults，無規則則 fallback |
| external node | 例如 AI 日報產生；沒有 Scheduler ID／LastTaskResult，不計入 monitored jobs／success／failure |

Metadata 缺失時沿用 raw name／現有 alias fallback、未分類與穩定排序，不消失、不影響 Scheduler collection。
檔案格式／schema／重複 key／非法型別錯誤應有可見 diagnostics；不靜默套用半份設定。
關係指向未收集或不存在的節點時顯示「前置資料未取得」，不假造成功、不擴大 Scheduler selection。
同名不同 folder 不合併；metadata 改名／改 market／改排序不改 SQLite job ID 或 run identity。

儲存前拒絕 self-reference 與 dependency cycle；外部檔案若出現 cycle，顯示問題並停用該部分流程推導，基本列表仍可用。
列表依使用者 order 呈現；流程圖依關係排列，遇到顯示順位和資料依賴矛盾時清楚提示，不悄悄更改任務或使用者設定。
Workflow 箭頭不可標成「已執行／可執行」；缺日期／execution-window 證據時不根據上次 SUCCESS 填綠前置。

## 初始內容與建議順序

以下是需求提供的**預設提案**，不是本輪即時 task inventory 或已驗證業務 DAG。
Task 名稱在 UX-A 驗收時需綁定實際完整路徑；例如同名其他 folder 不應套用根目錄的 exact metadata。
日期檢查與 weekly 都依賴 Daily 資料，**不把日期檢查畫成 weekly 的必要前置**。

| 市場／order | Task 或外部節點 | 中文名稱／description 提案 | 前置／顯示政策 |
| --- | --- | --- | --- |
| 台股 10 | `AIStockHunter-UnexplainedVolume-Daily` | 異常成交量每日掃描：產生並累積台股每日資料，提供後續檢查使用 | 主要資料產生者 |
| 台股 20 | `AIStockHunter-Accumulation-Check-YYYY-MM-DD` family | 籌碼累積上線檢查：檢查指定日期所需的 Daily 累積資料 | Daily 的資料前置；按 family 折疊；保留日期 |
| 台股 30 | `AIStockHunter-Accumulation-Weekly-Check` | 籌碼累積每週檢查：檢查整週 Daily 累積資料完整性與品質 | Daily 的整週資料前置；不是前一個單日 check 成功就算完成 |
| 台股 90 | `AIStockHunter-UnexplainedVolume-HealthCheck` | 舊版異常成交量健康檢查 | legacy、預設隱藏；若 selection 未收集不自行加入 |
| 台股 100 | `AIStockHunter-UnexplainedVolume-V2-Weekly` | 舊版異常成交量每週流程 | legacy、預設隱藏；是否存在／可讀於實作時核對，不能假造 task |
| 美股 10 | `InsiderTracker-Market` | 市場資料更新：更新已存在訊號的行情與績效 | 獨立流程；不依賴今天的其他排程 |
| 美股 20 | 外部節點 `external:ai-daily-report` | AI 日報產生：由外部流程產生日報並進 Git | 外部／未追蹤；不能用固定時間當完成證據 |
| 美股 30 | `InsiderTracker-SyncImport` | 內部人資料同步：匯入已產生並進 Git 的 AI 日報 | 前置為外部 AI 日報；不是 Market |
| 美股 40 | `InsiderTracker-SEC` | SEC 內部人交易更新：更新 SEC Form 4 資料 | 顯示於 SyncImport 後，**不是硬依賴**；關係須標為僅排序 |

需求中的美股時間為 Market 06:30、外部日報約 10:30、SyncImport 10:40、SEC 11:15。
這只是流程背景：Scheduler task 的畫面時間取真實 API，外部 10:30 必須標示「約／規劃時間」，不拿它推算 SUCCESS／MISSED。
業務關係若尚未由 owner／程式碼確認，顯示為「設定的前置說明」，與執行證據分開。

## 隱藏、折疊與摘要語意

- Legacy 隱藏只影響 presentation，不改 include/exclude、不停用 task、不刪 history；Current／History 都有顯示隱藏項目的入口與數量。
- 摘要必須標示範圍：monitored totals 維持所有已收集實體 jobs；畫面另外顯示「可見／隱藏」數量。隱藏或折疊內的 FAILED／UNKNOWN attention 要有明確提示，不能讓首頁看似全部正常。
- 日期 family 預設顯示**有效日期後綴最大的實際 task**，列出「最新日期、共 N 個、其餘 N−1 個」；不使用 lexicographic 假日期，不推定最新日期 task 已成功或已到期。
- 無效日期後綴保留為普通可見 job，附 metadata 診斷；只有一個 task 時不顯示空的展開控制。
- 同一 family 展開可看每個原始 task 的 Current／Last run／next run／detail／history；以原 job ID 導覽，無 synthetic execution 或 family 混算。
- Family 卡片顯示含歷史成員在內的 attention 摘要；舊 task 的失敗不能被最新成功掩蓋。篩選命中折疊成員時可見並可展開定位。
- History 的「同日任一失敗仍紅色」與 history-only job 規則維持；折疊是 rows presentation，不把不同 task 的 runs 合成同一次 execution。
- 流程視圖與一般列表可切換，同一份 metadata；Market 獨立、Daily 分支到兩個檢查、外部日報到 SyncImport、SEC 僅順序關係。區分實體 Scheduler node、family 與 external node。

## 分 Stage 交付

### UX-A — Metadata 與基本顯示

- **Goal**：先讓分類、中文說明、依賴與自訂排序真正可配置，移除「每次改名都要改 JavaScript」的需求。
- **Scope**：獨立檔案／schema 與 read-only presentation contract；TW／US／OTHER、displayName／description、dependsOn／derived downstream、order、legacy/hidden、notes；列表與 drawer、Current／History 一致顯示。先由人工編輯 Dashboard metadata，未做設定頁。
- **Dependencies**：Stage 2／3B、既有 selection／identity；Manager 確認欄位、排序／隱藏語意與初始流程內容。既有 aliases 平順 fallback；不需要 Runner／MISSED／port 分支先完成。
- **Gate**：改 Dashboard metadata 可改 UI 且 restart 保留；原始 Scheduler Description 可查；metadata edit 不改 task definition 或 ID／history；collection error／UNKNOWN 不被 metadata 蓋過。
- **Done when**：所有要求欄位有真實讀取路徑與文件、無硬寫的新業務別名、fallback 與錯誤訊息可用；此 Stage 不發布 metadata write endpoint。
- **Self-QA**：缺檔、壞 schema、重複 identity、中文／長字／HTML injection、同名不同 folder、unknown job、依賴缺節點／self/cycle、排序 ties／缺時間、隱藏 attention、restart／existing config 不覆寫、Current／History／窄版／鍵盤；正式 tasks 僅唯讀驗收，前後 definition hashes 一致。

### UX-B — 日期折疊與流程視圖

- **Goal**：減少日期型舊 task 噪音，同時看懂流程及前後置。
- **Scope**：family rules、最新日期／count／展開歷史成員、流程視圖、external nodes、關係類型與狀態來源；不做 graph execution engine。
- **Dependencies**：UX-A identity／metadata／排序／隱藏 contract。
- **Gate**：多日期成員可以完整找回；Daily 兩個 downstream 正確，Market 獨立、外部日報有明確標示、SEC 無假硬依賴；折疊／篩選／隱藏後 totals／attention 可核對。
- **Done when**：列表與流程視圖共用真實 metadata，可正常切換／開 drawer／查 history，無硬寫的展示假資料；錯誤圖不使基本列表失效。
- **Self-QA**：0／1／多成員、跨月年／閏日／非法日期、相同 family 不同 folder、未來日期、舊 failure＋新 success、history-only、未收集前置、循環設定、窄版／鍵盤／長文／大量節點；不得增加 Scheduler 操作。

### UX-C — 之後的顯示設定頁

- **Goal**：日常調整完全由使用者在 Dashboard 完成。
- **Scope**：「編輯顯示設定」頁，編輯名稱、description、市場、order（數值與上下移動優先；拖曳為可選 enhancement）、前置／推導後置、hidden／legacy、notes、family／external metadata。能預覽、取消、儲存；設定頁清楚標「只影響 Dashboard 顯示」。
- **Dependencies**：UX-A/B 穩定 schema；Manager 另審本機寫入 API、origin／CSRF 防護、revision/conflict 與 backup/recovery；loopback 本身不等於可任意接受跨站寫入。
- **Gate**：合法變更可原子保存並於 restart 後保留；validation/cycle/conflict/permission failure 不毀損舊設定；取消完全不寫入；沒有 Scheduler mutation 或 arbitrary file／command capability。
- **Done when**：使用者不用改 YAML/JSON/JavaScript 即可管理上述欄位，儲存結果可預覽核對且有恢復方式。即使本規劃獲准，仍須獨立核准 UX-C 才開始寫入功能。
- **Self-QA**：兩個頁面同時修改、stale revision、read-only home、寫入中斷、壞檔、備份恢復、未知版本、跨站請求、重複提交、取消、鍵盤排序、隱藏後找回、既有 config／history／Scheduler hashes 保留。

## 本次規劃驗收

只驗收文件涵蓋需求、現況與 proposal 的區分、Stage／Gate 可追溯、相對連結與 docs-only diff。
上述所有 UI／存檔／Scheduler integrity Gates 都是**未來實作的驗收要求**，不是本次通過紀錄。
本次交付 planning branch；不實作、不 merge main、不啟動後續 Stage，等待 Manager Review。
