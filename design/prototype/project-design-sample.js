// Generated from docs/PROJECT-DESIGN.md; do not edit. SHA-256: 7cca615d8c44670c12e2ab3bbd64423477dbb00c429ad8298b5174257a9629ff
window.PROJECT_DESIGN_SAMPLE = Object.freeze({
  "metadata": {
    "project_id": "local-dashboard",
    "project_name": "Local Dashboard",
    "repository": "Neil1031/local-dashboard",
    "design_version": 1,
    "overall_status": "IN_PROGRESS",
    "baseline_commit": "085757affe2c2dc0c1de45663395e418ad702e3e",
    "last_reviewed_at": "2026-09-28",
    "purpose": "本機投資研究資料與自動化流程總控制台",
    "original_design": "Windows Scheduled Task monitoring Dashboard",
    "current_design": "Local investment research and automation console"
  },
  "features": [
    {
      "id": "desktop-launcher",
      "area": "Desktop / Runtime",
      "name": "Launcher",
      "originalIntent": "雙擊開本機監控畫面",
      "implementation": "包裝版 EXE 啟動 loopback Spring server，完整驗證既有 instance 才開頁面",
      "status": "DONE",
      "limitation": "43871 已核准並合併 main `eba1003`；安裝版本須另有 deployment evidence，非 Windows Service／installer／updater",
      "remaining": "正式部署須獨立核准並驗證 installed version／rollback",
      "evidence": "docs/WINDOWS-LAUNCHER.md"
    },
    {
      "id": "desktop-browser",
      "area": "Desktop / Runtime",
      "name": "Browser auto-open",
      "originalIntent": "啟動後可直接看畫面",
      "implementation": "readiness 成功後交給 Windows 預設瀏覽器",
      "status": "DONE",
      "limitation": "關瀏覽器不停止服務",
      "remaining": "維持 readiness 與錯誤提示",
      "evidence": "docs/WINDOWS-LAUNCHER.md"
    },
    {
      "id": "desktop-stop",
      "area": "Desktop / Runtime",
      "name": "Safe Stop",
      "originalIntent": "安全結束本機服務",
      "implementation": "PID、建立時間、命令與 listener 身分核對後停止",
      "status": "DONE",
      "limitation": "Windows 不保證 graceful termination；身分不明會拒絕",
      "remaining": "維持安全拒絕與回歸檢查",
      "evidence": "docs/WINDOWS-SAFE-STOP.md"
    },
    {
      "id": "desktop-runtime",
      "area": "Desktop / Runtime",
      "name": "Bundled runtime",
      "originalIntent": "使用者無須安裝 Java",
      "implementation": "app-image 內含 Java runtime 與 Dashboard JAR",
      "status": "DONE",
      "limitation": "不是 installer 或 updater",
      "remaining": "依部署 gate 更新 image",
      "evidence": "docs/WINDOWS-LAUNCHER.md"
    },
    {
      "id": "desktop-bootstrap",
      "area": "Desktop / Runtime",
      "name": "Config bootstrap",
      "originalIntent": "首次啟動自動有監控設定",
      "implementation": "只在缺檔時由範本建立外部 application.yml",
      "status": "DONE",
      "limitation": "已存在的空白／錯誤設定不覆寫",
      "remaining": "保持 create-only 與資料外置",
      "evidence": "docs/WINDOWS-LAUNCHER.md"
    },
    {
      "id": "auto-collector",
      "area": "Automations",
      "name": "Scheduler Collector",
      "originalIntent": "看到已選 Windows tasks 現況",
      "implementation": "PowerShell 唯讀收集，JobNormalizer 輸出 /api/jobs",
      "status": "DONE",
      "limitation": "LastRunTime 只是一筆最近值，非完整事件紀錄",
      "remaining": "持續呈現 PARTIAL／收集錯誤",
      "evidence": "docs/STAGE-0-1.md"
    },
    {
      "id": "auto-today",
      "area": "Automations",
      "name": "Today",
      "originalIntent": "一眼看目前排程狀態",
      "implementation": "正式 UI 讀單次 /api/jobs 快照與狀態摘要",
      "status": "DONE",
      "limitation": "READY 不證明今日已執行",
      "remaining": "保留現況與最後結果分離",
      "evidence": "docs/STAGE-2.md"
    },
    {
      "id": "auto-workflow",
      "area": "Automations",
      "name": "Workflow",
      "originalIntent": "看工作間的研究流程",
      "implementation": "Today 依 metadata 顯示台／美股與依賴文字",
      "status": "DONE",
      "limitation": "只展示，不調度或阻擋下游",
      "remaining": "維持 Automations 搬移後的回歸，保留 Workflow 語意",
      "evidence": "docs/STAGE-UX-2.md"
    },
    {
      "id": "auto-grouping",
      "area": "Automations",
      "name": "Job grouping",
      "originalIntent": "找到相關排程",
      "implementation": "依市場／順序分組，未知工作仍顯示",
      "status": "DONE",
      "limitation": "分組不更改 Scheduler 身分",
      "remaining": "保留原始名稱與 ID",
      "evidence": "docs/STAGE-UX-1.md"
    },
    {
      "id": "auto-history",
      "area": "Automations",
      "name": "7-day History",
      "originalIntent": "追查最近工作結果",
      "implementation": "SQLite job/job_run 與 /api/history 的七天格",
      "status": "DONE",
      "limitation": "沒刷新可能漏存較早的 LastRunTime；空格非 MISSED",
      "remaining": "保留 evidence 與 null 語意",
      "evidence": "docs/STAGE-3A.md; docs/STAGE-3B.md"
    },
    {
      "id": "auto-metadata",
      "area": "Automations",
      "name": "Metadata defaults",
      "originalIntent": "讓工作名稱／用途可理解",
      "implementation": "dashboard.mjs 依原始 TaskName 套用版本化預設",
      "status": "DONE",
      "limitation": "顯示名稱不是 task identity",
      "remaining": "更新預設須核對來源名稱",
      "evidence": "docs/STAGE-UX-1.md"
    },
    {
      "id": "auto-settings",
      "area": "Automations",
      "name": "Editable display settings",
      "originalIntent": "調整顯示而不改排程",
      "implementation": "metadata JSON 與 GET/PUT /api/settings/job-metadata",
      "status": "DONE",
      "limitation": "只改畫面，不改排程或 Runner config",
      "remaining": "維持 revision／依賴驗證",
      "evidence": "docs/STAGE-UX-3.md"
    },
    {
      "id": "auto-folding",
      "area": "Automations",
      "name": "Legacy folding",
      "originalIntent": "避免舊排程淹沒日常畫面",
      "implementation": "日期型累積檢查摺疊舊日期，legacy 可切換顯示",
      "status": "DONE",
      "limitation": "不刪除歷史或原始 job ID",
      "remaining": "未來頁面延續展開控制",
      "evidence": "docs/STAGE-UX-2.md"
    },
    {
      "id": "runner-core",
      "area": "Runner",
      "name": "Runner Core",
      "originalIntent": "看見子程序真實啟動與退出",
      "implementation": "獨立一次性 Runner 依可信 profile 啟動 child",
      "status": "DONE",
      "limitation": "只涵蓋採用 Runner 的工作",
      "remaining": "每個正式映射另做部署驗收",
      "evidence": "docs/STAGE-5B.md"
    },
    {
      "id": "runner-receipts",
      "area": "Runner",
      "name": "Receipts",
      "originalIntent": "留下執行階段證據",
      "implementation": "STARTED／PROCESS_STARTED／TERMINAL 獨立 receipt",
      "status": "DONE",
      "limitation": "缺 terminal 或未啟動 child 是不完整證據",
      "remaining": "維持 bounded、不可覆寫紀錄",
      "evidence": "docs/STAGE-RUNNER-RECEIPTS-UI.md"
    },
    {
      "id": "runner-fallback",
      "area": "Runner",
      "name": "Primary / fallback",
      "originalIntent": "主要 receipt 目錄失效仍可保留證據",
      "implementation": "primary 寫失敗轉獨立 fallback spool",
      "status": "DONE",
      "limitation": "兩處都失敗時 child 仍可能執行但無 receipt",
      "remaining": "顯示保存失敗診斷",
      "evidence": "docs/STAGE-5A.md"
    },
    {
      "id": "runner-ui",
      "area": "Runner",
      "name": "Runner UI",
      "originalIntent": "在工作詳情看 Runner 結果",
      "implementation": "/api/runner/executions 與 Today drawer 顯示最近證據",
      "status": "DONE",
      "limitation": "Scheduler 結果與 child outcome 不能互代",
      "remaining": "保留原生 execution identity",
      "evidence": "docs/STAGE-RUNNER-RECEIPTS-UI.md"
    },
    {
      "id": "runner-coverage",
      "area": "Runner",
      "name": "Runner coverage",
      "originalIntent": "知道哪些工作有 receipt 覆蓋",
      "implementation": "Today 顯示映射、receipt roots 與 coverage state",
      "status": "DONE",
      "limitation": "MAPPED_NO_RECEIPT 不等於沒執行",
      "remaining": "後續加入來源新鮮度政策需另審",
      "evidence": "docs/STAGE-RUNNER-COVERAGE-DIAGNOSTICS.md"
    },
    {
      "id": "runner-diagnostics",
      "area": "Runner",
      "name": "Runner diagnostics",
      "originalIntent": "排查 config、profile、root 問題",
      "implementation": "API 回傳安全裁剪的 config/root/mapping warnings",
      "status": "DONE",
      "limitation": "不曝露私有路徑；不能替代原始 log",
      "remaining": "依正式映射逐案驗收",
      "evidence": "docs/STAGE-RUNNER-COVERAGE-DIAGNOSTICS.md"
    },
    {
      "id": "schedule-snapshot",
      "area": "Schedule semantics",
      "name": "Schedule Snapshot History",
      "originalIntent": "保存看過的排程定義",
      "implementation": "/api/jobs 觀察時寫 schedule_version 與 schedule_observation",
      "status": "BACKEND_READY",
      "limitation": "無正式讀取 UI／API；觀察時間不是生效時間",
      "remaining": "設計唯讀版本檢視與空檔呈現",
      "evidence": "docs/STAGE-SCHEDULE-SNAPSHOT-HISTORY.md"
    },
    {
      "id": "schedule-version",
      "area": "Schedule semantics",
      "name": "Schedule versioning",
      "originalIntent": "避免以今天規則倒推舊日",
      "implementation": "sanitized definition fingerprint 產生版本 episode",
      "status": "BACKEND_READY",
      "limitation": "版本觀察間隔可能含不明修改時刻",
      "remaining": "將 gap 清楚顯示",
      "evidence": "docs/STAGE-SCHEDULE-SNAPSHOT-HISTORY.md"
    },
    {
      "id": "schedule-correlation",
      "area": "Schedule semantics",
      "name": "Occurrence correlation shadow",
      "originalIntent": "研究執行可對上哪個 trigger",
      "implementation": "唯讀模型為支援的 trigger 產生 occurrence 並保留歧義",
      "status": "BACKEND_READY",
      "limitation": "研究 heuristics，無正式 API／UI 或 provenance guarantee",
      "remaining": "實測來源與發佈 gate 後才考慮呈現",
      "evidence": "docs/STAGE-OCCURRENCE-CORRELATION.md"
    },
    {
      "id": "schedule-availability",
      "area": "Schedule semantics",
      "name": "Machine availability evidence",
      "originalIntent": "分辨漏跑與電腦／服務不可用",
      "implementation": "需求與研究邊界已有文件；無正式證據時間線",
      "status": "NOT_STARTED",
      "limitation": "缺 boot、sleep、service、session、條件連續性",
      "remaining": "建立可驗證 availability contract",
      "evidence": "docs/STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md"
    },
    {
      "id": "schedule-shadow-missed",
      "area": "Schedule semantics",
      "name": "Shadow MISSED",
      "originalIntent": "先以研究方式測量誤判",
      "implementation": "Stage B 只關聯已執行證據，沒有缺席評估器",
      "status": "NOT_STARTED",
      "limitation": "availability／catch-up closure 未解",
      "remaining": "在獨立 gate 評估 WOULD_BE_MISSED 與 UNKNOWN",
      "evidence": "docs/STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md"
    },
    {
      "id": "schedule-prod-missed",
      "area": "Schedule semantics",
      "name": "Production MISSED",
      "originalIntent": "可相信的自動漏跑狀態",
      "implementation": "正式程式不產生新 MISSED",
      "status": "BLOCKED",
      "limitation": "缺真實來源證據與 shadow false-positive review",
      "remaining": "先過 availability、provenance、shadow 與 Manager gate",
      "evidence": "docs/STAGE-OCCURRENCE-CORRELATION.md"
    },
    {
      "id": "product-shell",
      "area": "Product expansion",
      "name": "Product Shell",
      "originalIntent": "原本只需 Today／History",
      "implementation": "Release 1B 九頁主要導覽，desktop sidebar／mobile 水平導覽，Automations／Settings 使用既有功能；已合併 main 654fc84",
      "status": "PARTIAL",
      "limitation": "四頁只有 DESIGNED 入口；新 preferences 與後續資料頁未實作，實際安裝狀態由獨立 deployment evidence 確認",
      "remaining": "後續來源功能另行 gate",
      "evidence": "docs/STAGE-RELEASE-1B.md"
    },
    {
      "id": "product-overview",
      "area": "Product expansion",
      "name": "Overview",
      "originalIntent": "原本由 Today 看排程摘要",
      "implementation": "現有 jobs 全快照計數／未來 next run、七天已觀察 History、Runner coverage／diagnostics；Release 1B 已合併",
      "status": "PARTIAL",
      "limitation": "僅 operations；無股票 findings／freshness／reports。PARTIAL／unavailable 明示；缺 History 不推 MISSED",
      "remaining": "跨來源 normalized feeds 後續另審",
      "evidence": "docs/STAGE-RELEASE-1B.md"
    },
    {
      "id": "product-projects",
      "area": "Product expansion",
      "name": "Projects",
      "originalIntent": "原設計無跨專案設計檢視",
      "implementation": "Release 1A-1 正式入口讀本專案建置設計快照，共用 v1 parser 並呈現功能／狀態數量",
      "status": "PARTIAL",
      "limitation": "最小切片已通過獨立初審及 Manager Review，合併 main `9e3c8cb`；安裝版本須另有 deployment evidence；完整閱讀面板／跨專案 aggregation 未完成",
      "remaining": "後續完成完整 Projects 閱讀面板／跨專案 aggregation，後續另審與驗證",
      "evidence": "docs/STAGE-PROJECTS-VIEWER-R1A1.md"
    },
    {
      "id": "product-us",
      "area": "Product expansion",
      "name": "US Stocks",
      "originalIntent": "原設計只看 Insider 相關排程",
      "implementation": "Release 2A reports Signals 已合併；Release 2B fixed SEC CLI v1 adapter／API／filter／分頁／明細已實作",
      "status": "PARTIAL",
      "limitation": "SEC 為 partial facts，P／candidate 尚未認證，4/A 未對帳，來源位置 ID 非 immutable event ID；Ticker Detail 未接；跨頁非 PIT，無 freshness policy；2B 已合併 main `4acd568`；實際安裝狀態另由 deployment evidence 確認",
      "remaining": "Ticker Detail／amendment reconciliation／broader analytics 另行 gate",
      "evidence": "docs/STAGE-RELEASE-2B.md"
    },
    {
      "id": "product-tw",
      "area": "Product expansion",
      "name": "TW Stocks",
      "originalIntent": "原設計只看 AIStockHunter 排程",
      "implementation": "Daily Scan／Accumulation／Candidates 已設計",
      "status": "DESIGNED",
      "limitation": "AIStockHunter 尚無穩定 Dashboard-facing export",
      "remaining": "來源 repo 另審 ai-stock-hunter-export-v1",
      "evidence": "docs/DASHBOARD-DATA-CONTRACTS.md"
    },
    {
      "id": "product-performance",
      "area": "Product expansion",
      "name": "Performance",
      "originalIntent": "原設計不分析選股效果",
      "implementation": "時距與觀測成熟度畫面已設計",
      "status": "DESIGNED",
      "limitation": "現有 performance-summary 非核准唯讀介面",
      "remaining": "取得來源唯讀 contract 後接入",
      "evidence": "docs/DASHBOARD-DATA-CONTRACTS.md"
    },
    {
      "id": "product-reports",
      "area": "Product expansion",
      "name": "Reports",
      "originalIntent": "原設計不集中報告",
      "implementation": "來源、版本、警告與 sanitized Markdown 畫面已設計",
      "status": "DESIGNED",
      "limitation": "正式 report adapter 與 revision 比較尚無",
      "remaining": "建立唯讀輸出與安全呈現",
      "evidence": "docs/DASHBOARD-DESIGN-SPACE.md"
    },
    {
      "id": "product-evidence",
      "area": "Product expansion",
      "name": "Data & Evidence",
      "originalIntent": "原設計只在工作詳情看狀態",
      "implementation": "原型規劃跨來源診斷、版本與 correlation",
      "status": "DESIGNED",
      "limitation": "Runner 診斷已存在，其他畫面未正式發佈",
      "remaining": "以現有證據建唯讀檢視",
      "evidence": "docs/DASHBOARD-DESIGN-SPACE.md"
    }
  ],
  "issues": [
    {
      "id": "runner-filesystem",
      "problem": "Scheduler 找不到從某些 AppData 路徑部署的 Runner Java",
      "cause": "建立程序看到的 redirected／package AppData 視圖與 Scheduler 可見實體路徑不同",
      "resolution": "同一二進位在 physical path 與未重新導向測試位置成功；正式 weekly migration 當時未由該研究證明完成",
      "lesson": "部署前用相同 Scheduler principal 驗證實體可見性與 hashes，不用建立程序看得到來推定排程看得到",
      "state": "RESOLVED IN DIAGNOSTIC",
      "evidence": "docs/STAGE-5B-R.md; docs/STAGE-5B-RETRY.md"
    },
    {
      "id": "runner-identity",
      "problem": "Scheduler job ID 與 Runner native job ID 容易被誤認為同一個",
      "cause": "兩套來源有不同 identity namespace",
      "resolution": "用完整 Scheduler path 的可信 mapping 回推 Dashboard canonical ID，保留 Runner job／profile／execution ID",
      "lesson": "不直接比較 native Runner job ID 與 Dashboard job ID",
      "state": "RESOLVED",
      "evidence": "docs/STAGE-OCCURRENCE-CORRELATION.md"
    },
    {
      "id": "missed-evidence",
      "problem": "無法可信宣稱某個預定時段漏跑",
      "cause": "LastRunTime、receipt 缺席與時間視窗都沒有 trigger-origin／可用性連續證據",
      "resolution": "production MISSED 維持封鎖；先設計 availability、shadow 與誤判評估 gate",
      "lesson": "不把「沒有看到」當成「沒有發生」",
      "state": "BLOCKED",
      "evidence": "docs/STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md"
    },
    {
      "id": "old-trigger",
      "problem": "舊 13:35 假設會誤導雙 trigger 配對",
      "cause": "舊例子屬停用 HealthCheck，不是目前 Daily 工作",
      "resolution": "唯讀 inventory 與 fixture 改用 Daily 的 14:30／17:00 兩筆 weekday trigger",
      "lesson": "用當次來源定義和版本，不從工作名稱或舊截圖猜時段",
      "state": "RESOLVED",
      "evidence": "docs/SCHEDULER-SELECTION.md; docs/STAGE-OCCURRENCE-CORRELATION.md"
    },
    {
      "id": "absent-selection",
      "problem": "Exact include 未命中時，缺席很容易被誤寫成 task 已刪除",
      "cause": "監控範圍／權限／部分收集與真實 absence 有不同原因",
      "resolution": "只有完整收集、無 unmatched include、仍被選取的已知 task 才寫 ABSENT_OBSERVED；它仍不證明刪除",
      "lesson": "保留 PARTIAL 與觀察空檔，不把 absence 轉成 MISSED",
      "state": "GUARDED",
      "evidence": "docs/STAGE-SCHEDULE-SNAPSHOT-HISTORY.md"
    }
  ],
  "changes": [
    {
      "date": "2026-09-21",
      "previous": "無統一工作畫面",
      "current": "Windows Scheduler Monitor",
      "reason": "需要集中看選定 task 的當前與最近結果",
      "impact": "建立 Collector、/api/jobs、Today 的原始邊界",
      "evidence": "docs/STAGE-0-1.md; docs/STAGE-2.md"
    },
    {
      "date": "2026-09-21",
      "previous": "只看 Scheduler 最近一次",
      "current": "Observed execution history",
      "reason": "需要跨刷新／重啟查看已見的執行",
      "impact": "SQLite job/job_run 與七天 History；仍非完整事件紀錄",
      "evidence": "docs/STAGE-3A.md; docs/STAGE-3B.md"
    },
    {
      "date": "2026-09-26",
      "previous": "Scheduler 結果為主",
      "current": "Runner execution evidence",
      "reason": "Scheduler exit code 不足以驗證 child 階段",
      "impact": "加入 receipt、唯讀 UI 與 coverage，保留兩套 identity",
      "evidence": "docs/STAGE-RUNNER-RECEIPTS-UI.md"
    },
    {
      "date": "2026-09-26",
      "previous": "只能看當前 trigger",
      "current": "Schedule Snapshot History",
      "reason": "不能以今天設定倒推歷史",
      "impact": "保存版本 episode、完整／部分觀察與空檔",
      "evidence": "docs/STAGE-SCHEDULE-SNAPSHOT-HISTORY.md"
    },
    {
      "date": "2026-09-27",
      "previous": "無 nominal occurrence 對照",
      "current": "Occurrence Correlation shadow",
      "reason": "雙 trigger、晚到與版本變更不能硬配",
      "impact": "唯讀生成、歧義分類；不發佈 MISSED",
      "evidence": "docs/STAGE-OCCURRENCE-CORRELATION.md"
    },
    {
      "date": "2026-09-28",
      "previous": "排程監控產品",
      "current": "Investment Research Console",
      "reason": "使用者需同時理解 US／TW 研究、報告與資料品質",
      "impact": "Scheduler 收入 Automations；八頁產品設計與外部 adapter 邊界",
      "evidence": "docs/DASHBOARD-DESIGN-SPACE.md"
    },
    {
      "date": "2026-09-28",
      "previous": "設計資訊散在 Stage／長文件",
      "current": "Living Project Design pilot",
      "reason": "專案擁有者需要從 Projects 畫面看清現況",
      "impact": "每 repo 一份主檔；本次只做 Local Dashboard 靜態試點",
      "evidence": "docs/PROJECT-DESIGN.md"
    }
  ],
  "remaining": [
    {
      "horizon": "NEXT",
      "work": "Complete Projects Viewer / remaining Release 1 implementation",
      "gate": "Release 1A-1 最小 Viewer 已通過獨立初審及 Manager Review，合併 main `9e3c8cb`；安裝版本須另有 deployment evidence；後續完整面板／aggregation 與其他 Release 1 能力仍須獨立 gate",
      "evidence": "docs/DASHBOARD-DESIGN-SPACE.md"
    },
    {
      "horizon": "PARTIAL",
      "work": "Overview operations slice",
      "gate": "現有真實 API 已接入且 Release 1B 已合併；不含股票 metrics",
      "evidence": "docs/STAGE-RELEASE-1B.md"
    },
    {
      "horizon": "PARTIAL",
      "work": "US Stocks Signals／SEC Transactions",
      "gate": "2A reports Signals 已合併；2B SEC partial 已合併 main `4acd568`；Ticker Detail、4/A reconciliation／broader analytics 另審",
      "evidence": "docs/STAGE-RELEASE-2B.md"
    },
    {
      "horizon": "DESIGNED",
      "work": "TW Stocks／Performance／Reports",
      "gate": "來源版控唯讀 contract、adapter、partial/null/provenance gate",
      "evidence": "docs/DASHBOARD-DATA-CONTRACTS.md"
    },
    {
      "horizon": "DESIGNED",
      "work": "Data & Evidence／Schedule view",
      "gate": "對已保存版本與 Runner coverage 建唯讀檢視，保留 UNKNOWN",
      "evidence": "docs/STAGE-SCHEDULE-SNAPSHOT-HISTORY.md"
    },
    {
      "horizon": "BLOCKED",
      "work": "Production MISSED",
      "gate": "availability、trigger provenance、shadow 誤判與獨立 Manager gate",
      "evidence": "docs/STAGE-SCHEDULE-SEMANTICS-MISSED-READINESS.md"
    },
    {
      "horizon": "LATER",
      "work": "Tray／auto-start／updater",
      "gate": "包裝與 rollback/security review，並非此 pilot 範圍",
      "evidence": "docs/DASHBOARD-DESIGN-SPACE.md"
    }
  ]
});
