# Windows app-image / launcher

## 日常使用

把整個 `dist/LocalDashboard` 資料夾放在固定位置（不要只複製 EXE），雙擊
`LocalDashboard.exe`。它使用內含 runtime，等待 HTTP readiness 後以 Windows
預設瀏覽器開啟 `http://127.0.0.1:8080`。使用者不需 Java、JAVA_HOME、Maven 或 command line。
預設 jpackage application icon；沒有 installer、WiX、Service、登入自動啟動或 updater。

連續雙擊會等待同一次啟動，已執行時則直接開既有 Dashboard，不建立另一個 Spring instance。
若其他程式占用 8080，會顯示錯誤，不會終止該程式。啟動最多等待 90 秒，失敗顯示 log 路徑。
包裝版固定 loopback / 8080；YAML 不能把它改成 LAN listener 或另一個 port。

關閉瀏覽器不會停止服務。需要停止時，雙擊桌面的 **Stop Local Dashboard**。
它執行 `LocalDashboard.exe --stop`，核對記錄的 PID、建立時間、bundled executable/JAR、完整命令形狀、
8080 listener 的 PID 與 readiness 身分後才停止；不關閉瀏覽器、不終止其他 Java 或 descendants。
已停止時顯示 `Local Dashboard is not running.`。身分無法確認時會拒絕並提示 log 位置。
下次雙擊 **Local Dashboard** 可重新啟動。更新 app-image 前先停止服務。
停止行為、Windows termination 限制與驗收詳見 [Safe Stop](WINDOWS-SAFE-STOP.md)。

## 設定與資料

穩定工作目錄預設是 `%LOCALAPPDATA%\LocalDashboard`，與 EXE 所在位置、shortcut 工作目錄無關：

```text
%LOCALAPPDATA%/LocalDashboard/
  config/application.yml       # 缺少時自動建立；使用者可修改，既有檔案不覆寫
  data/local-dashboard.db       # 預設 observed history，重啟/重建後保留
  logs/server.log               # 原 Spring/server stdout + stderr，append
  logs/launcher.log             # 啟動 PID、browser dispatch 與錯誤
  logs/stop.log                 # 停止驗證、拒絕、PID 清理及終止結果
  launcher.lock                # OS file lock；殘留空檔不表示仍在執行
  server.pid                   # PID + start time；防止 PID reuse 被誤認
```

第一次缺少 `config/application.yml` 時，EXE 自動建立設定，選取五個既有 tasks，UI 沿用中文顯示名稱。
不需要使用者手動建立 YAML。唯一範本是 [`config/application.example.yml`](../config/application.example.yml)，
Maven 將這份檔案原樣放進 launcher JAR 的 `bootstrap/application.example.yml`；不打包私人設定。
使用預設 home 或 `LOCAL_DASHBOARD_HOME` 時行為相同。若想調整監控清單，編輯外部檔案並重啟。

**已有檔案絕不覆寫**，包括自訂設定、空檔、格式錯誤的設定及既有 symlink。
使用者原本設定 `include: []` 時仍會顯示 NOT_CONFIGURED，必須自行修改；bootstrap 不把它當成缺少檔案。
若 task 不存在／不可讀，使用原有 collection diagnostics，不建立或修改 Windows tasks。

發布方式：在同一 config 目錄寫入專屬暫存檔、force 完整內容，再以 hard-link create-only 操作建立
`application.yml`，最後移除自己建立的暫存名稱。目標已存在時只保留既有檔案；兩個 launcher 競爭時僅一個發布成功，
讀者看見的設定已完整。此方式適用 Windows 預設 NTFS，不需 Administrator；不支援 hard links 的 filesystem
會明確失敗，沒有不安全的覆寫或直接寫入 final file fallback。重啟不重新寫入設定，history/data 路徑不變。

**從既有 JAR 部署移轉**：先停止舊服務，再把自己的 `config/application.yml` 與既有 `data/`
複製到此工作目錄，或透過 Windows 使用者環境變數設定 `LOCAL_DASHBOARD_HOME` 為原本 repository／
既有部署工作目錄的絕對路徑。後者會直接沿用原 config、DB 和相對路徑，不自動搬移或修改它們。
設定有絕對 database-path 時保持原指向；不要指向 image 的 `app/`、`runtime/` 或 `dist/`。
修改設定後重啟服務。多份 image 共用同一個本機服務；已有服務時會開既有服務，不切換其設定。

`LOCAL_DASHBOARD_HOME` 必須在 app-image 之外且可寫；可包含空白／中文。
覆寫 home 時 config/data/logs 跟隨該目錄；跨 image 協調的 `launcher.lock`、`server.pid`
仍固定放在 `%LOCALAPPDATA%\LocalDashboard`，避免不同 home 同時啟動兩個 server。
Runner Core 與 receipts 路徑完全未改動，也不會把使用者 config、DB、receipts 放入 image。
重新 packaging 只產生程式檔，既有 image 會另存 `dist/LocalDashboard.previous-<id>`；
確認不再需要後可自行刪除舊 image。外部工作目錄不受影響。

## 桌面捷徑（一次設定，不需 Administrator）

在 repository 根目錄執行：

```powershell
.\scripts\install-shortcut.ps1
```

已發佈的 image 也內附 `install-shortcut.ps1`，若該 PowerShell 的 execution policy 允許，可右鍵「使用 PowerShell 執行」。
它在目前使用者 Desktop（包括 Windows 重新導向的桌面）建立 `Local Dashboard.lnk` 與
`Stop Local Dashboard.lnk`，皆指向 EXE；後者帶 `--stop`。
先檢查兩份捷徑，再更新；相同 target/arguments 安全更新，不重複建立。
不同 target 或 arguments 會拒絕覆寫，檢查後可傳 `-Replace` 明確更換。
搬移 image 後重新執行並指定 `-ExecutablePath 'D:\Apps\LocalDashboard\LocalDashboard.exe' -Replace`。
遵循系統既有 PowerShell execution policy，腳本不修改 policy。
若預設 Windows PowerShell 5.1 要求簽章，使用已允許執行此腳本的 PowerShell 7，或依組織流程簽章；不自動繞過政策。

## 建置與 debug

在 Windows、JDK 21–25（含 jpackage）環境下：

```powershell
.\scripts\package-windows.ps1
# 若 JDK 不在 JAVA_HOME/PATH 或使用者 .jdks：
.\scripts\package-windows.ps1 -JdkHome 'C:\path\to\jdk-21'
```

腳本依序執行 Maven Wrapper `clean verify`、`jpackage --type app-image`、isolated runtime/HTTP/SQLite smoke check。
建置需下載 Maven/依賴，產物正常使用不需這些工具。輸出：

```text
dist/LocalDashboard/
  LocalDashboard.exe           # 無參數啟動；--stop 安全停止
  runtime/                     # jlink runtime，保留 java/javaw 供 server/debug
  app/launcher.jar             # 純 JDK bootstrap
  app/dashboard.jar            # 既有 Spring Boot dashboard
  install-shortcut.ps1
  README.md
```

正常模式使用 GUI subsystem EXE 與 javaw，沒有常駐 CMD；既有 server log 原樣追加到外部 `logs/server.log`。
Debug 可先停服務，使用內含 Java 在 PowerShell 中執行（Ctrl+C 停止）：

```powershell
$image = 'D:\Apps\LocalDashboard' # 改成 image 的絕對位置
Set-Location "$env:LOCALAPPDATA\LocalDashboard" # 或自己的 LOCAL_DASHBOARD_HOME
& "$image\runtime\bin\java.exe" -jar "$image\app\dashboard.jar" --server.address=127.0.0.1 --server.port=8080
```

readiness endpoint `GET /api/launcher/status` 不收集 tasks、不寫 DB；在 ApplicationReadyEvent 前回 503，
ready 時回固定身分字串。Launcher 使用 OS 檔案鎖協調冷啟動、PID/start-time 偵測未完成的既有啟動，
HTTP polling 驗證 ready，再呼叫 `Desktop.browse`。Log 記錄 `READINESS_POLLING`、
`READY_CONFIRMED polls=N`、`BROWSER_OPEN_REQUESTED Desktop.browse`、成功返回後的 `BROWSER_DISPATCHED`；
熱啟動記錄 `EXISTING_INSTANCE_READY`，冷啟動競爭者記錄 `WAIT_EXISTING_INSTANCE`。
每行包含 Java launcher PID 與 parent PID，因為 jpackage 可能先啟動外層 EXE 再 re-exec Java launcher。
`BROWSER_DISPATCHED` 是實際 OS browser-open 呼叫成功返回，搭配 HTTP 200 作為 browser integration Gate，
不宣稱已讀取瀏覽器 address bar 或完成 GUI 視覺驗收。關閉或崩潰會釋放 OS lock，舊 PID 不阻止重新啟動。

參考：[Oracle jpackage packaging overview](https://docs.oracle.com/en/java/javase/25/jpackage/packaging-overview.html)。
本版明確保留 runtime native Java commands，不採預設 `--strip-native-commands`。

## 可重現驗收

```powershell
.\scripts\package-windows.ps1 # 含 Maven full clean verify 與 packaged-runtime smoke check
node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
python scripts/verify-windows-launcher.py
git diff --check
```

Node/browser tests 的 Node 22+／Playwright 設定沿用主 README。Python 3.11+ 僅用於驗收。
驗收優先使用 PATH 中的 `pwsh.exe`，否則使用 Windows PowerShell，保持原 execution policy。
`verify-windows-launcher.py` 要求 8080 空閒，以及範例設定中五個既有 tasks 有可讀取的 completed history；
缺少這些前置條件會明確失敗，不建立 tasks 或偽造 history。它會：

- 在忽略的 `.tools/windows-launcher-acceptance/<id>/external home 中文` 建立隔離設定與資料，保留證據於同層 `verification.json`。
- 移除 JAVA_HOME，PATH 僅留 Windows 系統目錄；從不同 cwd 啟動真實 EXE。
- 驗證 GUI subsystem、HTTP HTML/API、polling→ready→實際 browser dispatch、重複 launch 與兩個同時冷啟動。
- 使用自訂 `data/launcher-history.db` 證明外部 YAML 生效，獨立讀取 SQLite history identity、size、SHA-256。
- 停止並重啟隔離 server，再停止並執行完整 package rebuild；比對 history、DB hash 與 receipt 目錄中的明示測試 marker。
- 在目前使用者真實 Desktop 執行兩次 shortcut installer，驗證相同 target/cwd、沒有重複捷徑；保留正常可用的捷徑。
- 比對五個既有 tasks 的完整 XML definition、Actions、Triggers SHA-256；只讀取，不執行／修改 tasks。
- 依 executable、完整 command line、PID、creation time 與 listener 核對身分後清理自己啟動的 server。

驗收會實際要求 Windows 預設瀏覽器開啟幾次 Dashboard，但不操控／關閉其他 Chrome 或 Java process。
測試資料不會提交，也不會碰 repository 私人 config 或正式 DB。

## 2026-09-21 Gate：PASSED

實測環境：Windows、OpenJDK/jpackage 25.0.2（編譯 target Java 21）、PowerShell 7、
Python 3.11、Node 24 / Playwright / Edge。全程以 shell、HTTP、process、SQLite 與實際
`Desktop.browse` 成功返回驗收；本輪沒有使用 Computer Use／解析瀏覽器 address bar。

| Gate | Verified evidence |
| --- | --- |
| 1. clean build | `package-windows.ps1` 內 Maven `clean verify` BUILD SUCCESS |
| 2. app-image | jpackage 成功；輸出 `dist/LocalDashboard/LocalDashboard.exe` |
| 3. self-contained | EXE 與 bundled javaw 在沒有 JAVA_HOME、PATH 僅 Windows 目錄時成功啟動 |
| 4. EXE / HTTP | `/` 回 Local Dashboard HTML、`/api/jobs` contract 正常，均 HTTP 200；只監聽 127.0.0.1 |
| 5. ready → browser | cold start 實測 12 次 polling；READY_CONFIRMED 後才呼叫 Desktop.browse 並成功返回 |
| 6. duplicate server | 第一次／第二次 listener 均 PID 49672，packaged server count 均為 1 |
| 7. open existing | 第二次 log 為 EXISTING_INSTANCE_READY → BROWSER_OPEN_REQUESTED → BROWSER_DISPATCHED，沒有 Server started；含 HTTP/process 驗證共 6.406 秒 |
| 8. external config | 空白／中文外部 home 的 YAML 生效，五個已存在 tasks 被讀取；指定的 launcher-history.db 建立，預設 local-dashboard.db 未建立 |
| 9. writable external data | SQLite 28,672 bytes、integrity_check=ok；image 內沒有 DB 或私人 application.yml |
| 10. restart persistence | PID 49672 停止、listener 消失；新 PID 39604 ready/HTTP 200，既有 5 筆 history identity/outcome 全保留 |
| 11. rebuild persistence | 停服務後再次完整 clean package；DB SHA-256 與 receipt 目錄測試 marker hash 相同；新 image 仍讀得到原 history |
| 12. Desktop shortcut | installer 實際執行兩次，只有一份 Local Dashboard.lnk，target 為目前 EXE，cwd 為 image 目錄，arguments 空白 |
| 13. Scheduled Tasks | 五個既有監控 tasks 的完整 definition、Actions、Triggers SHA-256 前後全部相同 |
| 14. regression | Maven 112 tests、Node/browser 30 tests，全部通過，0 skipped；git diff --check 通過 |
| 15. safe cleanup | 核對舊 PID 48752 的 executable/config/listener 後才停止；新驗收僅清理匹配 PID/creation time/executable/config 的 process，最終無 8080 listener／packaged server |

額外冷啟動競爭：兩個 EXE 同時啟動，一個記錄 `WAIT_EXISTING_INSTANCE lock=held`，
兩個皆在 14 次 polling 後完成 browser dispatch，共用單一 server PID 31520，最後安全停止。
正常 EXE 和 javaw 的 PE subsystem 均為 Windows GUI（2），無常駐 console。

重建前／後 DB SHA-256：`e6eceb91bdeca49b6d83b3f9733005431c05c2252d3a2391b1ccb97d69d21c7b`。
完整本機證據（不提交 runtime artifacts）：
`.tools/windows-launcher-acceptance/be364b9904b84223ae2d5a53477cc9a9/verification.json`、
同目錄 `rebuild.log`、`external home 中文/logs/launcher.log` 與 `.tools/windows-node-tests.log`。
實際捷徑位於目前使用者重新導向的 Desktop：`C:\Users\qwe74\OneDrive\桌面\Local Dashboard.lnk`，保留供日常使用。

## 限制

- app-image 未簽章；Windows 下載來源標記／組織安全政策可能需要使用者核准。沒有自動繞過。
- 預設瀏覽器必須可用。瀏覽器啟動失敗時服務仍保留，錯誤對話框提供網址與 logs。
- Launcher 不自動管理 log retention；server.log/launcher.log 持續追加。
- 舊版（沒有 readiness endpoint）的手動 JAR 服務需先停止再改用此版本。
- 不提供安裝器、背景服務、自動更新、托盤或新的停止 API；沒有更動 Windows Scheduled Tasks。

## First-run config bootstrap 驗收

```powershell
.\scripts\package-windows.ps1
node --test tests/dashboard.test.mjs tests/history.test.mjs tests/browser.test.mjs tests/history-browser.test.mjs
python scripts/verify-config-bootstrap.py
git diff --check
```

Python 驗收沿用前述 Node 22+／Playwright 設定。所有 case 使用獨立 home，連 LOCALAPPDATA 的
launcher lock／PID 檔也重導向至驗收目錄；不修改使用者真正的 `%LOCALAPPDATA%\LocalDashboard`。
Case A 從空 override home 執行實際 EXE，確認 packaged template、五個 jobs、真實 browser DOM 中文名稱。
Case B 驗證自訂單一 task 設定 bytes/hash/mtime 不變；Case C 同 home 兩個 EXE 競爭，只發布一次完整設定；
Case D 重啟後 config hash/mtime 與既有 history identity 保留。另外驗證沒有 override 時的預設 home 路徑。
前後比較五個 tasks 的 definition/Actions/Triggers hashes，並只清理驗收自己啟動的 server。
輸出 `.tools/config-bootstrap-acceptance/<id>/verification.json`、`case-a/ui.json` 與 screenshot，均不提交。

2026-09-21 實測結果（Windows/NTFS，JDK 25.0.2）：A/B/C/D 及無 override 的預設 home 路徑全部通過。
Case A `/api/jobs` 回傳 5 個原名 tasks，collectionStatus=OK；Playwright 真實 HTTP/DOM 與截圖確認五個中文名稱。
Case B 只讀到自訂的 1 個 task，config bytes/SHA-256/mtime 不變。
Case C 兩個 EXE 共用一個 server，只出現一次 CONFIG_CREATED，只有一份完整且等於唯一範本的 YAML，沒有殘留 temp file。
Case D config SHA-256/mtime 不變，5 筆既有 history identity/outcome 保留。
116 Maven tests、31 frontend regression tests、1 opt-in live browser test 均通過；app-image 成功。
五個 tasks 的 definition/Actions/Triggers hashes 前後完全一致；驗收 server 已安全清理。
使用者真正 home 的 5 個既有檔案 path/size/SHA-256 全部未變，桌面捷徑 target 正確且未重建。
本機證據：`.tools/config-bootstrap-acceptance/497eaa087a6e4d64954ad68f1b7de8ad/verification.json`，
建置及回歸 logs 為 `.tools/bootstrap-package-build.log`、`.tools/bootstrap-frontend-tests.log`。
