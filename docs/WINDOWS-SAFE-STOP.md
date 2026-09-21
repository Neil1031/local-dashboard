# Safe Stop Local Dashboard

範圍僅 Windows 一鍵停止；不包含 Stage 5B、Runner migration、Service、tray、auto-start 或 scheduler 修改。

## Plan / Stage / Gate

| Stage | Goal / Scope | Dependencies | Gate / Done when | Self-QA |
| --- | --- | --- | --- | --- |
| 1 | 確認 baseline、現有 launcher 與協調方式 | git、專案文件 | main=`f4bd7b62ae03e899b94960c0e848f9df52a6674e`、clean、指定 branch | 實際 fetch / switch / ff-only pull / HEAD |
| 2 | 正式停止入口、身分驗證、雙捷徑與封裝 | bundled JDK、既有 PID/start time/lock/readiness | 無法確認身分絕不終止、兩個捷徑可重複安裝 | 對抗性 policy/command tests、封裝 smoke |
| 3 | Windows 實機停止、重啟、資料及排程完整性 | 8080 可用、唯讀 tasks、isolated home | 下列 15 gates 有實測證據，commit/push，等待 review | 真實 EXE、獨立 process/listener/SQLite 檢查、桌面 UI、前後 hashes |

## Architecture

沿用 jpackage `LocalDashboard.exe`，新增 `--stop` entry point；沒有另一套 runtime、原生 build chain 或安裝器。
`--stop --quiet` 供自動驗收使用，只抑制提示對話框，不放寬驗證。
一般停止以獨立標題與工作列視窗顯示成功／已停止／安全拒絕提示，可用 OK 或關閉按鈕結束。
成功及已停止回傳 0，拒絕或失敗回傳 1。
Start 不帶參數，保留原設定 bootstrap、固定 loopback/8080、ready 後開啟 browser 的行為。

Start/Stop 共用 `%LOCALAPPDATA%/LocalDashboard/launcher.lock`。競爭者等待取得 lock，再重新評估狀態，
上限 120 秒；啟動持有 lock 直到 readiness/browser dispatch 結束。兩個 Stop 串行完成，第二個是 no-op。
Stop 在釋放 lock 後才顯示提示，因此未關閉對話框不會阻擋下次啟動。

停止端不執行 ConfigBootstrap、不讀取或寫入 application.yml、history/receipts，不呼叫 `/api/jobs`。
它只寫共用 `logs/stop.log`，及清理匹配的 `server.pid`，即使 Start 使用 `LOCAL_DASHBOARD_HOME` 也相同。

## Stop identity verification

持有 lock 後，依序要求：

1. `server.pid` 必須是正 PID + ISO start instant 兩行格式。損壞紀錄拒絕，不猜 PID。
2. 該 PID 仍存在，且 ProcessHandle 的 start instant 完全相同。PID 已消失時清理 stale 檔；
   PID 重用時清理 stale 檔並拒絕，不動新程序。無法讀取 start time 時保留紀錄並拒絕。
3. ProcessHandle executable 與 CIM executable 必須指向這份 image 的 `runtime/bin/javaw.exe`。
4. CIM command line 必須符合 launcher 的完整六個 token：bundled Java、`-jar`、此 image 的
   `app/dashboard.jar`、固定 address/port、唯一絕對 file URI 的外部 config location。
   不是子字串搜尋；拒絕額外參數、不同 JAR、不同 port、引號混淆。支援空白及中文路徑。
5. 8080 必須只有一個 `127.0.0.1` listener，OwningProcess 等於記錄 PID。
6. 直接 loopback、無 proxy、無 redirect 的 readiness 必須 HTTP 200 且 body 完全等於 `local-dashboard:ready:v1`。
7. 驗證後再次核對原 ProcessHandle 的 alive/start instant；若需要強制終止，全部重驗。

Windows JDK 不提供完整 process arguments，因此 Java 以絕對路徑呼叫內建 Windows PowerShell，
唯讀查詢 CIM 與 TCP owner。helper 無 profile、非互動、hidden，15 秒上限；不更改 execution policy，
不執行 task mutation 或 process termination。逾時／權限不足／查詢不完整都安全拒絕。
使用者日常只雙擊捷徑，不需要操作 PowerShell。命令列只在記憶體驗證，不寫入 log。

終止使用最初取得的 ProcessHandle，不重新依 PID 搜尋來 kill。OpenJDK Windows native implementation
在同一 native process handle 上比較 creation time 後才 TerminateProcess，避免檢查後 PID 重用誤殺。
參考 [OpenJDK Windows ProcessHandle implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/windows/native/libjava/ProcessHandleImpl_win.c)。

缺少 PID 紀錄但 8080 有服務時拒絕，不採取 listener-only fallback。尚未 ready、無法存取身分、
從另一份 image 啟動的 server 也拒絕。應使用啟動該 server 的 image；更新前先停止。
產品不會自動修復或猜測不一致的 PID 紀錄。

## Stop behavior and Windows limitation

先呼叫 `ProcessHandle.destroy()`，等候最多 10 秒；若仍在執行，完整重驗身分後
才呼叫 `destroyForcibly()`，再等最多 5 秒。身分資訊一旦無法確認，不再發出終止。
只針對一個已確認的 server，從不列舉／終止 descendants 或其他 Java。
程序退出後移除匹配 PID 紀錄，確認 8080 無 listener；若 port 被其他服務接手，提示錯誤但不終止它。

**Windows bundled JDK 的 `supportsNormalTermination()` 為 false：`destroy()` 本身就是強制程序終止，
不保證 Spring graceful shutdown。** 因此初次 destroy 前也完整重驗，並明確寫入 `FORCED_TERMINATION`。
沒有新增 HTTP shutdown endpoint；不宣稱 shutdown hooks 已執行。
參考 [ProcessHandle termination contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ProcessHandle.html#supportsNormalTermination())。

log 包含 `STOP_REQUESTED`、`IDENTITY_CONFIRMED pid=...`、`GRACEFUL_STOP_REQUESTED supported=...`、
`FORCED_TERMINATION reason=...`、`EXITED`、`STALE_PID_CLEANUP`、`REFUSED_IDENTITY_MISMATCH`。
`GRACEFUL_STOP_REQUESTED supported=false` 代表一般 termination API 的請求，絕不是 graceful 完成證据。
拒絕時不保存 probe 原始錯誤或命令列，避免不必要的資訊外洩。

## Shortcut behavior

`scripts/install-shortcut.ps1` 在目前使用者真正 Desktop（含重新導向）建立：

| Name | Target | Arguments |
| --- | --- | --- |
| Local Dashboard | `dist/LocalDashboard/LocalDashboard.exe` | 空白 |
| Stop Local Dashboard | 同上 | `--stop` |

無 Administrator。重跑更新相同捷徑，不製造副本。先檢查兩個，再開始儲存；任一個同名但
target 或 arguments 不同就拒絕，兩份都不改。只有明確 `-Replace` 才覆寫衝突。
封裝附同一安裝腳本；既有 Start shortcut 不必變更 target。

## Reproducible verification

```powershell
python scripts/verify-safe-stop.py --prepare
.\scripts\package-windows.ps1
# Node 22+ and Playwright, as documented in README
node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
python scripts/verify-safe-stop.py
git diff --check
```

Prepare 記錄所有目前使用者可讀 tasks 的完整 XML SHA-256，以及真實 user home 的 config/data hashes。
Windows acceptance 使用隔離 LOCALAPPDATA 與含中文／空白的 home，有限壽命的自建 unrelated Java fixture；
不動其他系統程序。測試 absent PID、reuse、wrong Java、真正 ready Dashboard + wrong PID、
normal stop、port closed、restart、並行 stop、cold start 與 stop 競爭、捷徑衝突及 -Replace。
比對停止前後 config/history/receipt marker bytes/hash、SQLite integrity/row identity；
重啟只允許新增真實觀測 history，已有 identity 不可消失。真實 user data 與 task definitions 前後必須不變。
測試只讀 Scheduled Tasks，不 register/enable/disable/run/reschedule/delete。
quiet 的相同 EXE 入口用於自動測試；另以 Windows UI 驗證桌面捷徑和訊息。

## 2026-09-21 Gate result: PASSED (15/15)

實測 Windows 非 Administrator、OpenJDK/jpackage 25.0.2（target Java 21）、Windows PowerShell 5.1 identity probe、
PowerShell 7 shortcut installer、Python 3.11、Node 24/Playwright/Edge。

| Gate | Result / evidence |
| --- | --- |
| 1. Start shortcut | Verified：Computer Use 在真正 Desktop 資料夾雙擊；ready 200，browser dispatch 成功 |
| 2. Stop shortcut | Verified：實際雙擊，看到 `Local Dashboard has stopped.` 並點 OK 關閉；另看到 already-stopped 訊息 |
| 3. 正常停止流程 | Verified：完整 identity confirmed 後單一 server 退出；Windows 為有記錄的 forcible OS termination，非 graceful shutdown |
| 4. 8080 closed | Verified：獨立 Get-NetTCPConnection 與 process 查詢均確認退出 |
| 5. 無 Administrator | Verified：acceptance WindowsPrincipal elevated=False；真實使用者桌面安裝/執行成功 |
| 6. 無關 Java 保留 | Verified：同 bundled Java 的 finite fixture 從 negative cases 經 Dashboard stop/restart 全程仍存活 |
| 7. stale PID | Verified：自行啟動後已退出 child 的 PID 紀錄清理、exit 0、無 termination |
| 8. PID reuse | Verified：存活 fixture PID 搭配錯誤 start time，exit 1、fixture 存活、stale record 清理 |
| 9. wrong process | Verified：正確 fixture PID/start time 仍拒絕；真正 Dashboard readiness 為 ready 時也不會授權 wrong PID |
| 10. concurrent stop | Verified：兩個真實 Stop EXE 同時執行，兩者 exit 0、最後無 listener；另驗 cold start 持鎖時 Stop 等待 |
| 11. restart | Verified：start→ready→stop→無 listener→另一 PID ready；既有 history identity 保留 |
| 12. config/history/data | Verified：隔離 config/DB/receipt marker stop 前後 bytes/SHA-256 一致；真實 UI stop 前後同樣一致、8 筆 history identity/outcome 保留 |
| 13. shortcut idempotence | Verified：真桌面重裝兩次；隔離 target/arguments 衝突兩份皆不寫；明確 -Replace 成功；恰有兩份捷徑 |
| 14. Scheduled Tasks | Verified：234 個目前身分可讀 tasks 的完整 XML SHA-256，包含 GUI 驗收後，前後全部一致；沒有 task mutation/run |
| 15. regression/package | Verified：Maven clean verify 133 tests、frontend/browser 32 tests，0 failure/skip；jpackage 與 bundled-runtime/stop smoke 通過；diff check 通過 |

Data detail：隔離 DB 停止前後 SHA-256 `3f3b46fca49fbf9168503ec4a1fd1a416436660b2a5560a80e1dfe517c6c5adf`，
7 筆已觀測 history 保留。最後真實桌面 stop 前後 DB SHA-256
`a962e27cd966359747ddde0ff9d0b0a9bd2f3f206c85f696aacc3b7f20998a17`，8 筆 identity/outcome 一致，integrity_check=ok。
GUI 重新啟動、網頁載入之後，DB 相對啟動前 baseline 的 hash 有改變；Stop 前後 hash 則完全一致。
既有 collector 會更新觀測時間，跨 start/browser collection 不要求 DB bytes 永遠固定；沒有宣稱整輪 GUI 工作完全沒有 DB 寫入。
config 與既有備份 bytes 保持不變；沒有 Runner receipt 寫入或 Runner 工作。

本次最初有一個舊 server 的 PID record 與真實程序不一致。新入口正確拒絕；經使用者**明確一次性授權**後，
保留原 PID 紀錄、核對實際 creation time，在共用 lock 內修復記錄，再經全部新 Stop checks 停止。
該一次性修復只在忽略的本機驗收檔中，不屬於產品功能、不提交；修復/停止前後正式資料 hashes 一致。

本機證據（不提交 config/DB/process/task artifacts）：

- `.tools/safe-stop-acceptance/fc32c447117446a59f83a162de4c2200/verification.json`
- 同目錄 `gui-before-stop.json`、`gui-after-stop.json`、`gui-final.json`
- `.tools/safe-stop-package.log`、`.tools/safe-stop-frontend.log`、`.tools/safe-stop-acceptance.log`
- 更早的一次性 repair baseline：`.tools/safe-stop-acceptance/b2bd6cc1a9d7403daeac287cf89233a5/`

Not verified：Windows graceful shutdown／Spring hooks（不支援，未宣稱）；10 秒後才發生的 force fallback
以 policy fixtures 驗證再次核對及拒絕行為，沒有刻意讓真實 Dashboard 卡住；未驗未來其他 Windows/JDK 組合。
沒有 merge main，交付分支後等待 Manager Review。
