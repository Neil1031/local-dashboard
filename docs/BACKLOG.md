# Dashboard backlog 與 Stage 執行順序

規劃日期：2026-09-23（Asia/Taipei）。狀態：**PROPOSED — 等待 Manager Review**。
核對基準：遠端 `main` = `22af205509f2a25ce287053a120cd6a82784a8ee`。
本文件與 [PLAN.md](../PLAN.md) 的最新指派共同管理後續工作；歷史 Stage 報告保留當時 Gate、限制與交付文字，不改寫成今日驗收。

## 本次範圍與證據界線

- **Verified（Git／文件／程式碼）**：已 fetch 最新 main，核對 merge history、PLAN、README、Stage 報告、已提交 evidence 與現有實作入口。
- **Inferred／Proposed**：以下優先順序與 UX 設計是待審提案；流程關係依需求描述，尚非跨專案業務依賴驗證。
- **Not verified（本輪）**：即時 Scheduler、部署中的 EXE、正式資料品質、UI 實機、既有 Gate 的重新執行。本輪不啟動服務或 task、不讀寫正式 DB、不部署。
- 交付只包含 Markdown 規劃／必要說明；不改程式、設定範本、schema、排程 Description／Action／Trigger／Enabled、正式 config/data 或既有 evidence。
- 每次實作須另開 bounded stage，Manager 決定啟動與合併；本 planning branch commit/push 後停止。

## 已完成與未完成盤點

「已合併」由 main ancestry 確認；「Gate 通過」引用既有報告，並不表示本輪重測。

| Stage／能力 | main 上狀態 | 依據與仍保留的限制 |
| --- | --- | --- |
| 0／1 repository、唯讀 Scheduler collector | 已合併；歷史 Gate PASS | [STAGE-0-1](STAGE-0-1.md)；非 atomic snapshot，沒有完整 execution audit |
| 2 真實資料 UI | 已合併；歷史 Gate PASS | [STAGE-2](STAGE-2.md)；Current 與 Last run 分開，非今日 execution-window 判定 |
| 3A observed history | 已合併；歷史 Gate PASS | [STAGE-3A](STAGE-3A.md)；SQLite v1、UTC identity／dedup；關閉期間未觀察的 executions 不補造 |
| 3B 七日 History API／UI | 已合併；歷史 Gate PASS | [STAGE-3B](STAGE-3B.md)；多次執行保留失敗，empty 不代表 MISSED；尚無 30-day UI |
| 4 trigger／event research | 兩輪研究已合併；自動 MISSED **DEFERRED** | [trigger research](STAGE-4-RESEARCH.md)、[event research](STAGE-4-EVENT-RESEARCH.md)；後者嚴格研究 Gate 3 FAILED，缺 Operational execution XML，不能把交付完成當可靠 MISSED 完成 |
| 5A Runner Core | 已合併；歷史 Gate PASS | merge `bbaed57`、[STAGE-5A](STAGE-5A.md)；獨立 CLI、三階段 receipts、exit propagation；無 public receipt API/UI／ingestion |
| Windows app-image／launcher | 已合併；歷史 Gate PASS | merge `f2425b0`、[WINDOWS-LAUNCHER](WINDOWS-LAUNCHER.md)；雙擊、bundled runtime、singleton、外部資料與捷徑已做，非 installer／tray／auto-start／updater |
| Config bootstrap／monitoring selection／中文 aliases | 已合併；歷史 Gate PASS | merge `f4bd7b6`、[SCHEDULER-SELECTION](SCHEDULER-SELECTION.md)；六個 include selectors，日期 prefix 可匹配多個 jobs；alias 仍硬寫在前端 |
| Safe Stop | 已合併；歷史 Gate PASS | merge `8b209bc`、[WINDOWS-SAFE-STOP](WINDOWS-SAFE-STOP.md)；嚴格 process identity；tray 尚未做 |
| 5B 初次 pilot | 失敗／rollback 證據與工具已合併；migration 未保留 | merge `8e3e746`、[STAGE-5B](STAGE-5B.md)；當時 Scheduler launch 失敗，不能代表後續 attempt 2 仍同一原因 |
| 5B-R launch diagnostics | 已合併；研究 Gate PASS | merge `42356ab`、[STAGE-5B-R](STAGE-5B-R.md)；redirected AppData 可見性問題已定位；diagnostic success 不等於正式 migration |
| 5B Retry identity fix／attempt 2 | 已合併；preflight／controlled integrity PASS，正式 Gate **FAILED** | merge `22af205`、[identity fix](STAGE-5B-RETRY-IDENTITY-FIX.md)；weekly child exit `1`，exact rollback；final migration **BLOCKED** |
| Port 8080 → 43871 | **BRANCH_ONLY／待 Manager 整合** | 遠端 `fix/dashboard-port-43871` = `96fd763d1281f1d3461e862c5b59b79a5e05445e`，不是 main ancestor；[分支驗收證據](https://github.com/Neil1031/local-dashboard/blob/96fd763d1281f1d3461e862c5b59b79a5e05445e/docs/evidence/dashboard-port-43871.json)；main source 仍 8080，本輪不改使用說明的 port 或合併此分支 |
| UX metadata／流程管理／設定頁 | **PLANNED** | 現有 `dashboard.mjs` 的 aliases、`JobService` 名稱排序不等於 metadata 功能；[設計與 Gates](DASHBOARD-UX-METADATA.md) |
| Runner receipt UI、logs、30-day reliability、Windows 後續產品化 | **PLANNED／未實作** | 細分於下列 Stage，避免從舊 Next stage 文字漏掉 |

目前 `JobNormalizer` 的 `description` 來自 Scheduler `Description`；Dashboard 自己的中文說明尚不存在。
未來顯示設定屬於 Dashboard，原始 Scheduler Description 保留為 technical detail。

## 重新排序的工作佇列

保留舊 Stage 0–7 編號以便追溯；**下表順位才是提議的執行順序**，不是依 Stage 數字順跑。
UX-A／B／C 為新增獨立 Stage；5C 為 Runner receipt UI；8／9 收納 Windows 產品化與維護。
Blocked／Deferred 項目不阻擋其他獨立 Stage；表內所有尚未實作項目仍需 Manager 核准。

| 順位 | Stage | 狀態／目的 | 前置與完成 Gate |
| --- | --- | --- | --- |
| P0 | Planning review／Port 分支 disposition | 本規劃待審；另確認 43871 分支合併或延期 | Manager 核准本 backlog；port 要另審，不能夾帶在文件分支；不是 UX 設計的硬依賴 |
| P1.1 | **UX-A — Job Metadata／基本顯示** | 下一個建議 implementation；台股／美股、中文名稱／說明、依賴、自訂排序、legacy 隱藏 | Stage 2／3B 已有；[UX-A Gate](DASHBOARD-UX-METADATA.md#ux-a--metadata-與基本顯示) 通過；metadata 不改 Scheduler 或 history identity |
| P1.2 | **UX-B — 日期折疊／流程視圖** | 降低一次性 task 噪音，看到前置／後置與外部步驟 | UX-A contract；[UX-B Gate](DASHBOARD-UX-METADATA.md#ux-b--日期折疊與流程視圖) 通過；不能把圖上的順序當自動執行或證據 |
| P1.3 | **UX-C — 顯示設定頁（之後做）** | 使用者自行編輯名稱／說明／市場／排序／依賴／隱藏／備註 | UX-A/B contract 穩定與獨立 write-design review；[UX-C Gate](DASHBOARD-UX-METADATA.md#ux-c--之後的顯示設定頁) 通過；UX-A/B 不預先做寫入 endpoint |
| P2.1 | **5C — Runner receipt API／UI** | 顯示 child 結果、duration、receipt phase 與不足證據原因 | 5A schema／reader 已有；可用隔離 fixtures 開發驗收，**不依賴 5B 成功 migration**；真實 pilot 覆蓋另列 |
| P2.2 | **6 — Logs／Error detail** | detail drawer 顯示可信、有限量 output／diagnostics | 5C 的來源／privacy contract；可先用明確配置的 log source；不能假裝現有 receipt 有 output text |
| P2.B | **5B final migration** | **BLOCKED：ai-stock-hunter weekly-check child exit 1** | 外部業務問題處理與 Manager 再授權；解鎖後可優先安排單一 pilot，不需等低優先項；不得由此規劃直接 rerun |
| P3.1 | **8A — Tray** | 日常開啟、狀態與安全停止 | 現有 launcher／Safe Stop；與 5B 無硬依賴 |
| P3.2 | **8B — Opt-in auto-start** | 登入自動啟動 Dashboard 的明確選項 | launcher；8A 有助 UX 但非技術硬依賴；機制、停用／移除與使用者同意另審 |
| P3.3 | **8C — Installer／upgrade／uninstall** | 普通雙擊安裝／升級、保留 config/history/receipts | 穩定 app-image、目錄與版本契約；不把既有 shortcut script 當 installer |
| P3.4 | **8D — Updater** | 之後才做可驗證來源、可回復的更新 | 8C upgrade／rollback contract；預設仍可離線使用，不引入必要雲端帳號 |
| P4.1 | **7 — 30-day reliability** | 七／三十日切換、觀察到的成功率／失敗／last failure／可用 duration | 3A/B；duration 需要 5C 等真實來源；MISSED metrics 等 Stage 4，其他 observed metrics 可先獨立交付 |
| P4.2 | **4R → 4A → 4B → 4C → 4D** | 自動 MISSED **DEFERRED**；另審 evidence strategy | 不能因有 receipts／auto-start 就解除 coverage 缺口；完整子 Stage 見下文 |
| P5 | **9 — 維護／規模／可攜性** | 保留已知缺口，按實際需要分批核准 | retention、collection 效能、identity 遷移與平台驗收皆需各自 Gate；不是一包必做的大改 |

## 既有功能後續 Stage 的驗收契約

### 5B final migration — 暫停與解鎖

- **Goal／scope**：完成唯一一個經核准 task 的正式 Runner migration，不擴展其他 tasks。
- **已知 blocker**：attempt 2 的 Scheduler／Runner／child 均為 `1`；報告記錄 `DAY_INCOMPLETE:2026-09-18`、`UNRESOLVED_REVALIDATION`。這是已觀察的業務失敗，尚未在此專案診斷／修復。
- **Dependencies**：由 ai-stock-hunter 工作範圍提供問題處置與可接受的新驗證證據；Manager 確認新的安全執行時機、唯一 task、授權次數、資料／通知邊界及 rollback。不能為讓 Gate 綠燈略過資料檢查或把非零改成成功。
- **Gate／done when**：重新確認 stable RunnerRoot、canonical SID／實際 Scheduler context、原始 task backup、protected data baseline；依核准計畫驗證等價參數／cwd／環境／帳號／副作用、完整三階段 receipt、child/Runner/Scheduler exit 0，以及離線 Dashboard 下可執行。只有 Manager 接受才保留該 task 的 Runner Action；失敗保存證據並 exact rollback，不自動 retry。
- **Self-QA**：既有 attempt 1／2 evidence 原封保留；核對 final Action/XML/ACL、資料與其他 tasks integrity。保留一份 baseline inventory、checkpoint summary 與 final diff；額外 drift 單獨說明，不換 baseline，不猜操作者。
- **證據**：[formal-live.json](evidence/stage-5b-retry/attempt-2/formal-live.json)、[rollback.json](evidence/stage-5b-retry/attempt-2/rollback.json)。Git 已合併失敗證據，不代表 migration 成功；本輪不重新執行舊 pilot scripts。

### 5C — Runner receipt API／UI

- **Goal／scope**：bounded read API 與 drawer／history 顯示 executionId、來源、phase、起迄、duration、child exit／Runner result；明確區別 Scheduler snapshot、process result、business result。
- **Dependencies**：沿用 5A authoritative files／reader；Runner `jobId` 與 Scheduler Base64URL ID 不同，須明確設定關聯，不能只靠名稱或時間猜 join。未對應 receipts 保留可診斷狀態。
- **Gate／done when**：primary/fallback 同 executionId 只呈現一份 logical receipt；沒有 terminal → `INCOMPLETE / UNKNOWN`；published corruption／identity conflict 拒讀並顯示錯誤；child exit 0 不稱 business success。未 migration 的 jobs 仍可正常顯示 Scheduler 資料。
- **Self-QA**：offline Dashboard 後重啟、phase advancement、重複來源、fallback、缺／壞／未知 schema、START_FAILED 與 child exit 127 的區別、bounded reads、隱私、UI 空／錯誤／窄版。不得改寫既有 Stage 3 runs 或重複計數。
- **儲存決策**：先審 reader/API；若需 SQLite ingestion/index，另列 schema migration／replay／executionId dedup Gate，不能默默改 V1。5C 不自帶 retention、排程 migration 或 rerun。

### 6 — Logs／Error detail

- **Goal／scope**：顯示來源標記與有限量 output；候選來源為 configured log tail、collector diagnostics、Scheduler error，以及未來經審核的 Runner output contract。
- **Dependencies**：目前 Runner 只存 stream byte counts／truncation flags，**沒有 stdout/stderr text**。新增 capture 必須另審 privacy、落地與版本策略。
- **Gate／done when**：一般失敗可從 drawer 追查，最多 200 行且不超過 64 KiB，截斷與讀取失敗可辨；只讀 allowlisted 路徑，無瀏覽器任意檔案／命令能力。
- **Self-QA**：missing／locked／huge／rotated logs、Unicode、多行錯誤、敏感資料遮蔽、HTML injection；不讀取整份巨大 log、不因 UI 讀取改動來源。

### 8A–8D — Windows 日常使用

| Stage | Goal／scope | Dependencies | Gate／done when | Self-QA |
| --- | --- | --- | --- | --- |
| 8A Tray | 開啟 UI、顯示服務狀態、安全停止 | launcher singleton、Safe Stop identity | 同一服務／鎖；停止仍 fail closed；關閉 browser 與停止 server 語意清楚 | 重複雙擊、tray crash、stale PID、錯誤 listener、重啟及 data 保存 |
| 8B Auto-start | 使用者 opt-in 的登入啟動、可查目前設定並停用 | approved startup 機制；預設 off | 登入只啟動單一 Dashboard；取消選項能完整移除自己建立的入口；不啟動股市 jobs | 登入／登出、重複設定、移動安裝路徑、啟動失敗；若選 Scheduler，須獨立授權自己的 entry，既有 tasks 不變 |
| 8C Installer | 安裝、升級、解除安裝、捷徑／版本與簽章策略 | 穩定 app-image、外部 home、Safe Stop | 新機雙擊可用；升級保留 config/history/receipts；解除安裝預設保留使用者資料；失敗可回復 | 中文／空白路徑、無 admin 使用情境、執行中升級、權限不足、磁碟不足、取消、中斷、舊版相容 |
| 8D Updater | 可選版本檢查／下載／更新／rollback | 8C；來源／完整性驗證與版本政策 | 先驗證可信來源與 artifact，再經核准安裝；失敗不毀損現用版本／資料；無強制 telemetry／帳號 | 離線、下載中斷、錯誤簽章／hash、版本倒退、更新中斷、schema 與 binary rollback 相容 |

### 7 — 30-day reliability

- **Goal／scope**：七／三十日切換、observed success rate、failed count、last failure；duration 僅計有量測值的 runs，標示樣本數。
- **Dependencies**：3A/B 實際資料；若合併 receipt executions，先完成 5C 去重與 source semantics。時間範圍 API 支援不等於 30-day UI 已完成。
- **Gate／done when**：分母明確為觀察到的 completed executions，不能宣稱所有預期排程可靠率；coverage 不足可見。MISSED count 未解鎖時顯示 unavailable，不顯示假 `0`。
- **Self-QA**：空資料、部分 coverage、同日 failure→success、來源重複、null duration、UTC／local／DST 邊界、多筆與查詢負載。

### 4R–4D — Reliable MISSED（全部 Deferred）

保留 [event research 的提案](STAGE-4-EVENT-RESEARCH.md)，不跳過失敗的 readiness Gate：

| Stage | Goal／scope | Dependencies | Gate／done when | Self-QA |
| --- | --- | --- | --- | --- |
| 4R | Evidence readiness／受控研究 | Manager 核准策略與樣本／隔離環境；log enable／測試 task 需另行授權 | 真實 execution XML、來源到 instance 關聯與缺口；修正原研究 Gate 3，仍不得偷換 MISSED 定義 | demand／time／catch-up／IgnoreNew、event versions、missing coverage |
| 4A | 正向 event evidence、availability、durable ingest | 4R、schema／privacy review | unknown／disabled／expired source 可辨；replay／dedup 不補造證據 | crash/cursor、log generation、late／orphan／duplicate／unknown version |
| 4B | definitions／occurrences／matching／evaluation | 4A 的 evidence contract | negative evidence 足夠才 MISSED；manual 不清掉 scheduled verdict | clock jump、recreation、retry attribution、catch-up、sleep/offline、unsupported triggers |
| 4C | current／execution／occurrence／coverage API/UI | 4B domain review | missed count 只計合格 verdict；empty history 仍中性 | unknown／disabled／collector failure／legacy history／coverage explanation |
| 4D | Windows 行為 end-to-end 驗收 | Manager 核准 controlled tasks／環境 | 正常、未到期、disabled、真實未執行都以可信證據驗收；不足就不 release MISSED | midnight／DST、grace、StartWhenAvailable、queued、permission、restart、retention gaps |

15 分鐘 grace 只是一個參數，**不是完整判定策略**。elapsed time、LastRunTime gap、empty history/event query、NumberOfMissedRuns、缺 receipt、持續開機都不足以單獨判定 MISSED。Deadline alert 若另做須另命名，不冒充 Windows no-start 判定。

### 9 — 其他仍保留的 backlog

以下各項均為未開始；Manager 應按需求拆成獨立 Stage，勿順手擴充到 UX 或 5C。

| 項目 | 前置／範圍 | Gate／done when 與 Self-QA |
| --- | --- | --- |
| 9A Retention／archive／backup | receipts、history、server.log／launcher.log 目前持續增長；與 ingestion／版本策略協調 | 核准保留政策、可回復備份；incomplete／conflicting evidence 保留；驗證輪替、中斷與 restore；不自動清正式資料 |
| 9B Collection／UI 韌性與效能 | 現為 on-demand；視需要考慮 multi-tab coalescing、fetch timeout／取消、可選刷新與 midnight 更新 | 保留清楚 collectedAt／staleness，不把錯誤當成功；併發、取消、網路掛住、跨日驗收；auto-start 不等於背景 collection 已完成 |
| 9C History pagination／query scale | 目前 bounded time range，無 row cap／pagination | 以實測資料量決定需要；大資料查詢與分頁無漏／重複，維持 read-only history；必要 schema migration 另審 |
| 9D Task rename／move／recreation linkage | 目前 path/name 決定 ID，display rename 不改 ID，實體 rename/move 是新 ID | 若要連結需使用者明確對應，歷史可追溯，不靠相似名稱猜合併；同名不同 folder／刪除重建驗收 |
| 9E Platform／accessibility acceptance | 歷史多為此 Windows/JDK 25／Edge；JDK 21、新機、其他 browser／實體 mobile／screen reader 未完整驗證 | 宣告支援矩陣後逐項驗收；鍵盤／讀屏／窄版與權限失敗；避免把 fixture 通過稱全平台完成 |
| 9F Runner 進階政策 | timeout／termination／retry、descendant tracking、business-result schema、occurrence association、profile versioning 皆未做 | 若需求成立，先審 side-effect／identity／idempotency／privacy contract；取消、crash、重試不重複副作用，非零不改成功；不同於 5A 已完成的 direct-child exit contract |
| 9G 手動 Run／Stop job 或背景 Service | 僅保留為候選，非目前產品承諾 | 必須獨立需求／權限／allowlist／審計／防重複執行與 rollback review；不得藉 metadata／Refresh 加入 generic command API |

## Manager Review 與下一步

1. Review 此 backlog、UX requirements 與新的 Stage 順序；未核准前不開始 implementation。
2. 單獨處置 43871 分支；本次保持 latest-main 基準與 docs-only diff。
3. 建議下一個實作指派為 **UX-A only**，核准後開新的 Implementation Chat；UX-B、UX-C 各自過 Gate 再開始。
4. Stage 5B 保持 **BLOCKED**；Stage 4 保持 **DEFERRED**。不因接受規劃而解鎖正式執行、排程異動或業務資料修復。
