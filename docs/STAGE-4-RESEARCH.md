# Stage 4 Research — Windows triggers 與可靠 MISSED 判定

日期：2026-09-21，Asia/Taipei。角色：Research Agent；本文件是建議，沒有實作 detector。
Repository / Manager Plan 基準：**0a9e00295b369f91b8932b5e9a77cdf0ac2eeec1**。
分支：**research/stage-4-triggers**。Research Gate：**PASS（研究交付；不代表 Stage 4 implementation PASS）**。
須由 Manager Review 決定範圍及下一個 Implementation Chat；不 merge main。

## 1. Executive summary

1. 範例設定的 **5/5 個真實 tasks** 均已唯讀盤點：3 daily、2 weekly，都是單一 calendar trigger，沒有 repetition。
2. **全部 StartWhenAvailable=true、MultipleInstances=IgnoreNew、LogonType=Interactive、WakeToRun=false**。
   因此沒有一個現有 task 是可無條件套用「時間 + 15 分鐘 → MISSED」的 Class A。
3. 第一版建議支援「單一 fixed-offset daily（DaysInterval=1）／weekly（WeeksInterval=1 + weekday mask）」的
   **expected-time generation**；這不等於每個 occurrence 都具備 MISSED 判定資格。
4. 已有可靠 matching execution 時，保留 SUCCESS／FAILED；正在執行時保留 RUNNING。
   未啟動且仍可能補跑、條件未知、觀測空洞、歸屬歧義時，回 **UNKNOWN + reason**。
   WAITING_FOR_CATCHUP 建議先作 evaluation reason，不自行新增 top-level enum。
5. **目前 collector + SQLite v1 不足以對這五個 tasks 一般性證明 MISSED。**
   可先做 generation、positive matching、due/grace 與保守 UNKNOWN；要啟用可信 MISSED，
   Implementation Gate 必須先證明 observation coverage、settings/principal evidence 與 absence evidence。
6. 保留全域 grace=15 分鐘作「啟動容忍」，不是完成期限，也不是 Windows 補跑 SLA。
   沒有證據支持現在把 SEC 任意調成 30 分鐘。catch-up 等待政策須與 grace 分開。
7. 不回補 Dashboard 未觀測期間的歷史 MISSED，不把 inferred occurrence 寫成 job_run。

### 研究流程、範圍與 evidence

| 階段 | Goal / Scope | Dependencies | Gate / Done when | Self-QA |
| --- | --- | --- | --- | --- |
| 基準 | checkout main、fetch、pull --ff-only、確認指定 commit 與乾淨工作樹，閱讀文件及資料流 | Git、repository | HEAD 等於指定 commit，建立研究分支 | 無較近 AGENTS.md；不引用其他 Chat 作證據 |
| 盤點 | 真實 selectors、trigger/settings/conditions、XML 對照 | ScheduledTasks 唯讀權限 | 5/5 exact identities 皆取得完整相關欄位 | allowlist sanitization；PowerShell 7 / 5.1 交叉讀取、XML hash |
| 語意 | Microsoft 官方文件與現有資料限制 | 官方 reference / troubleshooting | 已知／推論／未驗證分開 | 不為行為驗證操作真實 tasks |
| 交付 | 模型、matching、precedence、fixtures、Gate | 上述證據 | docs-only diff、JSON 驗證、commit / push | 無 production/schema/task mutation；停止等 Manager |

讀過：PLAN.md、README.md、STAGE-0-1/2/3A/3B 文件、完整 collector、JobNormalizer、Models、
PowerShellCollector、TaskSelection/SchedulerProperties、JobService、scheduler/history controllers、
HistoryObserver/Repository/Range/Response、V1 schema、scheduler fixtures 與相關 normalization/selection/API/process/history tests。
沒有啟動 application、呼叫會持久化 observation 的 /api/jobs、開啟或修改任何 operational SQLite。

證據檔案：

- [task-inventory.json](evidence/stage-4/task-inventory.json)：13:00:12–13:00:13 +08:00 實際 snapshot，CIM 欄位與 sanitized XML leaves。
- [validation.json](evidence/stage-4/validation.json)：PowerShell 5.1 交叉比對與交付檢查。
- [collect-research.ps1](evidence/stage-4/collect-research.ps1)：research-only 重現工具，僅 Get-ScheduledTask / Get-ScheduledTaskInfo / Export-ScheduledTask。

**Verified** 指本次讀取的實際值、目前 repository code，或明示引用的官方契約。
**Inferred / Proposed** 指本研究建議，不宣稱 Windows 已照此執行。
**Not verified** 包含實際睡眠、關機、reboot、登出、重試／補跑／碰撞時間線及任何新演算法。

## 2. Actual monitored task inventory

### 2.1 設定來源與精確 identity

**Verified：** packaged application.yml 的 include 為空；repository 的 config/application.yml 不存在；
config/application.example.yml 列出下方五個完整 task keys，exclude 為空。
本次 shell 沒有 DASHBOARD_* / SPRING_CONFIG* 環境變數；可讀取的 java.exe process 中沒有辨識到 local-dashboard。
因此本次 inventory 的範圍是「repository 範例所選、實機確實存在的五個 tasks」，
**不是聲稱有一個正在運行且已解析所有外部 override 的 production dashboard**。
不建立本機設定、不啟動服務來改變這個現況；其他帳號／不可見 process 的設定未驗證。

全部 TaskPath 都是 scheduler 根目錄（反斜線），下表名稱沒有縮寫 identity。
主機時區為 Taipei Standard Time（UTC+08:00，無 DST），Windows 11 build 26200。
所有時間以下均為 **+08:00**，不是從 task name 推導的市場時區。

| TaskName | Enabled / State | 實際 schedule / trigger | StartBoundary | 下一次 scheduler 時間 |
| --- | --- | --- | --- | --- |
| InsiderTracker-Market | true / Ready | 每日 06:30；MSFT_TaskDailyTrigger | 2026-09-19T06:30:00+08:00 | 09-22 06:30 |
| InsiderTracker-SEC | true / Ready | 每日 11:15；MSFT_TaskDailyTrigger | 2026-09-19T11:15:00+08:00 | 09-22 11:15 |
| InsiderTracker-SyncImport | true / Ready | 每日 10:40；MSFT_TaskDailyTrigger | 2026-09-19T10:40:00+08:00 | 09-22 10:40 |
| AIStockHunter-UnexplainedVolume-HealthCheck | false / Disabled | 每週一至五 13:35；MSFT_TaskWeeklyTrigger | 2026-09-14T13:35:00+08:00 | 09-21 13:35（仍有值，不能當成 enabled 證據） |
| AIStockHunter-Accumulation-Weekly-Check | true / Ready | 每週五 22:00；MSFT_TaskWeeklyTrigger | 2026-09-18T22:00:00+08:00 | 09-25 22:00 |

### 2.2 每個 trigger 的完整相關欄位與適用性

各 task **恰好一個 trigger**，Enabled=true；XML 為 CalendarTrigger/ScheduleByDay 或 ScheduleByWeek。
表中的 M / S / I / H / W 依序為上表五個 task；共同值也適用於每一個 task，原始逐筆值保留於 JSON。

| 欄位 | M | S | I | H | W |
| --- | --- | --- | --- | --- | --- |
| DaysInterval | 1 | 1 | 1 | 不適用 | 不適用 |
| WeeksInterval | 不適用 | 不適用 | 不適用 | 1 | 1 |
| DaysOfWeek | 不適用 | 不適用 | 不適用 | 62＝Mon–Fri | 32＝Friday |
| Months / MonthsOfYear | 不適用 | 不適用 | 不適用 | 不適用 | 不適用 |
| DaysOfMonth / WeeksOfMonth / last-day flags | 不適用 | 不適用 | 不適用 | 不適用 | 不適用 |
| EndBoundary | 未設定 | 未設定 | 未設定 | 未設定 | 未設定 |
| RandomDelay | 未設定 | 未設定 | 未設定 | 未設定 | 未設定 |
| Repetition.Interval | 未設定 | 未設定 | 未設定 | 未設定 | 未設定 |
| Repetition.Duration | 不適用（無 repetition） | 同左 | 同左 | 同左 | 同左 |
| Repetition.StopAtDurationEnd | false；無 repetition 故不作用 | 同左 | 同左 | 同左 | 同左 |
| trigger ExecutionTimeLimit | 未設定（另有 task limit） | 同左 | 同左 | 同左 | 同左 |
| Delay | 不適用於本次 daily/weekly 類別 | 同左 | 同左 | 同左 | 同左 |
| Trigger Id | 未設定 | 未設定 | 未設定 | 未設定 | 未設定 |

RandomDelay / Repetition / EndBoundary / trigger limit 均為 CIM null，XML 也未出現；
這是 **NOT_CONFIGURED**，不是 collector 失敗造成的 unknown。未知來源的 null 不得直接套用此結論。
未收錄的其他 trigger property names 為空；未發現多 trigger、monthly、TimeTrigger、event、boot、logon、idle trigger。
DaysOfWeek 解碼經 XML weekday leaves 交叉驗證，也符合 [Microsoft bit mask 定義](https://learn.microsoft.com/en-us/windows/win32/taskschd/weeklytrigger-daysofweek)。

### 2.3 Settings（共同與差異）

**每個 task 共同值：**

| Setting | 實際值 | 對 MISSED 的意義 |
| --- | --- | --- |
| StartWhenAvailable | true | 存在延後啟動可能；不可僅以 nominal grace 宣判 |
| MultipleInstances | IgnoreNew | 前一個 instance 尚在執行時，新 instance 不會啟動 |
| RunOnlyIfIdle | false | IdleSettings 的存在不表示有 idle start requirement |
| IdleSettings | IdleDuration=PT10M、WaitTimeout=PT1H、StopOnIdleEnd=true、RestartOnIdle=false | 保存但不把這組值當作實際 idle deadline |
| RunOnlyIfNetworkAvailable | false | 沒有 scheduler network-start gate；action 需要網路與否未研究 |
| NetworkSettings | Name / Id 均未設定 | JSON 僅存 presence，避免洩漏網路識別 |
| WakeToRun | false | task 不要求 scheduler 為它喚醒機器；不是證明當時睡眠 |
| AllowDemandStart | true | 手動／按需執行可能改變 LastRunTime；timestamp 不能證明 trigger provenance |
| DeleteExpiredTaskAfter | 未設定 | 沒有自動刪除延遲；本次亦無 EndBoundary |
| Compatibility | Win7 | 相容性設定，不是本機 OS 版本 |
| UseUnifiedSchedulingEngine | true | 行為驗收應與實際 engine/settings 配合，不套用所有舊版範例 |
| AllowHardTerminate / Hidden / Priority | true / false / 7 | termination/result、呈現、資源競爭相關；不能單獨證明漏跑 |
| DisallowStartOnRemoteAppSession / Volatile | false / false | 無這兩個額外限制；不代表其他 runtime condition 必然成立 |
| MaintenanceSettings | Period / Deadline / Exclusive 未設定 | 無 maintenance schedule；不自行產生 expected windows |

| Task | task ExecutionTimeLimit | RestartCount / RestartInterval | DisallowStartIfOnBatteries / StopIfGoingOnBatteries | task Enabled |
| --- | --- | --- | --- | --- |
| Market | PT2H | 0 / 未設定 | false / false | true |
| SEC | PT2H | 0 / 未設定 | false / false | true |
| SyncImport | PT2H | 0 / 未設定 | false / false | true |
| HealthCheck | PT30M | 2 / PT5M | true / true | false |
| Weekly-Check | PT10M | 2 / PT5M | false / false | true |

ExecutionTimeLimit 約束的是啟動後的執行時間；不應轉成 start grace 或假定時間一到 instance 已消失。
RestartOnFailure 是失敗重試，不是 trigger repetition；可能有多筆 actual attempts，但不能額外創造 scheduled occurrences。
若先失敗後重試成功，保留已知失敗記錄，不以成功覆蓋日摘要。

### 2.4 Conditions 與 user/session

五個 task 的 Principal 都是 **Interactive / Limited**（username、SID 未保存）。
官方規則要求 principal 已登入且有現存 interactive session；光是電腦開機或 Dashboard 正在運作，不足以證明目標 session 存在。
鎖定畫面與登出也不能當成同一件事。參考 [Principal.LogonType](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype)。

| 條件 | 本機設定 | 本次能／不能證明 |
| --- | --- | --- |
| Idle | 五個均不要求 RunOnlyIfIdle | 能排除這個 start gate；沒有量測歷史 idle |
| AC power | HealthCheck 要求 AC，切換電池會停止；其餘均否 | 沒有讀取原定時間的 power timeline |
| Network | 五個 scheduler gate 均 false | 不代表業務請求成功或主機當時 online |
| Wake | 五個 WakeToRun 均 false | 沒有 power/wake history；不推斷漏跑原因 |
| User/session | 五個均 Interactive | session 是否在 occurrence 期間持續可用未知 |

**Expected trigger time 已到 ≠ Windows 一定應立即啟動 action。**
本次實際 conditions 不能只用「沒有 network/idle gate」概括成 unconditional。

### 2.5 Current observations 與 classification

| Task | LastRunTime (+08:00) | LastTaskResult | NumberOfMissedRuns | 研究時可確認的分類 |
| --- | --- | ---: | ---: | --- |
| Market | 09-21 09:38:37 | 0 | 0 | Class B：daily + catch-up + session；有已知 scheduler success，但不能證明 06:30 如何觸發 |
| SEC | 09-21 11:15:01 | 0 | 0 | Class B；有貼近 nominal time 的 success 候選；trigger provenance 未知 |
| SyncImport | 09-21 10:40:01 | 1 | 0 | Class B；已觀察到 failure，不應替換成 MISSED |
| HealthCheck | 09-14 14:19:11 | 0 | 4 | Class D + B，現已 DISABLED；不能將 counter=4 當今日 MISSED |
| Weekly-Check | 09-18 22:00:00 | 1 | 0 | Class D + B，另有 retry；最近 failure，下一次週五尚未到 |

沒有 Class A（簡單且無 catch-up）或 Class C（repetition）實例。
Class E 是 **evaluation evidence 不足** 的分類，可與 B / D 的 trigger class 同時成立。
Market 的 09:38 可能是補跑或 demand start，但本次 **無原因證據**，不能稱為已驗證補跑。
counter=0 也不證明每個 occurrence 都準時完成。

## 3. Supported trigger classes

以下是 **建議的 v1 能力**，不是已完成實作。

| 類別 | Expected generation | Safe MISSED evaluation |
| --- | --- | --- |
| Daily，DaysInterval=1，單 trigger，明確 offset，無 random/repetition/end boundary | 支援，依 StartBoundary 日期與時間，不從 LastRunTime 倒推 | 僅通過第 7 節 absence / coverage / conditions / catch-up gates |
| Weekly，WeeksInterval=1，有效 weekday mask，其餘同上 | 支援；weekday 非工作日不產生 occurrence | 同上；包含本機 Friday 與 Mon–Fri 形狀 |
| Disabled task / disabled trigger | 可解析定義，不產生停用期間的 active expectation | DISABLED 或 NO_ENABLED_TRIGGER，不判 MISSED |
| StartWhenAvailable=true | 支援標示 catchupAllowed 與 pending reason | v1 對仍有補跑可能的缺席不作 final MISSED |
| Retry 設定存在 | 可產生基礎 calendar occurrence | 失敗／重試不能變成 MISSED；attempt attribution 不足則 UNKNOWN |

第一版可以可靠支援 **正向執行證據** 及 **安全拒判**。
真正 MISSED 的窄支援案例是：事先觀察到的受支援 occurrence、當時 enabled、無 condition／instance-policy 歧義、
catch-up 不允許或其結束有獨立可靠證據、期限後有可信 no-start evidence。
本次五個 tasks 的單次 snapshot **都不足以通過全部條件**；不能把「支援 daily」宣傳成「五個 task 全可判 MISSED」。

## 4. Unsupported / ambiguous cases

- Monthly / monthly DOW、event、boot、logon、registration、idle trigger；沒有可從時鐘單獨產生的 schedule 或本機需求。
- TimeTrigger 雖可表示單次時間，但本機沒用；v1 不先擴大支援，特別是沒有 EndBoundary 的 missed-start 差異。
- Repetition、nonzero RandomDelay、多 trigger、重疊 occurrence、Parallel / Queue / StopExisting：v1 UNKNOWN / unsupported missed evaluation。
- DaysInterval > 1、WeeksInterval > 1、EndBoundary 邊界：可另做 fixtures，v1 不假裝已驗證 anchor / expiry 語意。
- 無 offset 且缺 scheduler timezone、DST transition、時區或時鐘跳動：UNKNOWN；不能套用瀏覽器 timezone。
- Catch-up 多日堆積、login / AC / network / idle conditions 未知、policy suppression 未知。
- task rename / move / delete / 同名重建、definition hash 改變、enabled 在窗口中改變且時間未知。
- collector failure、stale/non-atomic snapshot、history unavailable、Dashboard restart／長時間未 Refresh。
- 只存在 SQLite 空洞、counter 或已前進的 NextRunTime，沒有 absence evidence。
- LastRunTime 已被較晚手動／retry run 蓋過：較早窗口不能因此判缺席；現在 RUNNING 也不能反推每個舊窗口都執行過。

UNKNOWN 是 evaluation 結果，不是抹掉已保存的 FAILED / SUCCESS；不同資料層同時保留。

## 5. Windows behavior findings（官方文件查證）

### 5.1 Trigger、timezone、repetition

[DailyTrigger](https://learn.microsoft.com/en-us/windows/win32/taskschd/dailytrigger) 使用 StartBoundary 時刻與 DaysInterval；
[WeeklyTrigger](https://learn.microsoft.com/en-us/windows/win32/taskschd/weeklytrigger) 使用 WeeksInterval / DaysOfWeek。
[TimeTrigger](https://learn.microsoft.com/en-us/windows/win32/taskschd/timetrigger) 指定一次日期時間，不可因同一天有 LastRunTime 就當成 daily。

[ITrigger.StartBoundary](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itrigger-get_startboundary)
區分 explicit offset / Z 與無 offset 的本機 timezone/DST。這五個 task 全部明寫 +08:00；
SEC 不能因名稱就被重解釋成美東 DST 時間。未來要改排程屬其他工作。
Weekly 文件亦描述 DST 春季不存在時刻的延後行為；Java 預設 DST 解析不能未經測試就當作 Windows 等價。

[RepetitionPattern](https://learn.microsoft.com/en-us/windows/win32/taskschd/repetitionpattern)
以 Interval / Duration / StopAtDurationEnd 表達 trigger 內的重複。
官方現代版本例子：1 分鐘間隔、4 分鐘期間會啟動 **5 次（含初次與尾端）**，舊版例子是 4 次。
因此未來不能隨意用排除尾端的 duration loop；本次無 repetition，v1 只明確拒判並留 fixture。

### 5.2 StartWhenAvailable、machine off / asleep

[StartWhenAvailable](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable)
允許 scheduled time 過後啟動；官方描述服務佇列的預設延遲為 10 分鐘，並有 time-based task 的適用範圍限制。
**它沒有承諾所有條件下的最晚啟動時間、每個 missed occurrence 一對一補跑，或從任意 Dashboard refresh 起算的 timeout。**
對本機無 EndBoundary、持續 daily/weekly calendar recurrence 的精確 reboot/catch-up 行為，
本次只確認設定 true；不以文件中「repeat infinitely」自動等同 Repetition.Interval，也未做斷電驗收。

[Microsoft KB 2437520](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/scheduled-task-not-run-upon-reboot-machine-off)
描述特定舊版 Windows 的 one-time task 在關機錯過後可能不會於 reboot 補跑，以及 expiry 的影響。
該 KB 的 Symptoms 明列舊版；不能將其直接外推為此 Windows 11 主機的完整行為契約。
此研究不照 KB 操作任何現有 trigger。

[WakeToRun](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-waketorun)
描述 sleep/hibernate 喚醒，不能拿它保證已關機的 PC 自動開機。
「電腦離線」須區分關機、睡眠、無網路、服務不可用；四者證據及限制不同。

### 5.3 Conditions、disabled 與 instance policies

[Task idle conditions](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-idle-conditions)
說明 idle 與停止／重啟條件，且指出 Duration / WaitTimeout 已 deprecated。
不可看到 PT1H 就假定現在 Windows 必定等一小時後放棄。
[Network gate](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-runonlyifnetworkavailable)
只允許網路可用時執行；有 profile 時還需指定 profile 可用。
[Battery start gate](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-disallowstartifonbatteries-settingstype-element)
可阻止啟動。這些設定不提供歷史 condition timeline，也不證明解除條件後的精確補跑時間。

[ITaskSettings](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nn-taskschd-itasksettings)
另記 battery saver 可能延後某些 task 類型。只觀察目前電源狀態不能推回原定時間的狀態。
[Enabled](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-enabled)
決定 task 是否可依 triggers 執行；停用不刪除先前 outcome/counter，亦不代表先前 RUNNING 已終止。

[TASK_INSTANCES_POLICY](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_instances_policy)
定義 Parallel（並行）、Queue（等既有 instances 完成）、IgnoreNew（既有 instance 執行時不啟動新 instance）、
StopExisting（停止既有再啟動）。**IgnoreNew 不是 Queue。**
06:30 的 instance 到 07:30 還在執行時，07:30 不另啟動符合 IgnoreNew 規則；
Dashboard 建議記為 SUPPRESSED_BY_INSTANCE_POLICY reason，不算 unexplained MISSED，也不稱為第二次 SUCCESS。
但要聲稱「確實 suppressed」，需 occurrence 當時的 instance overlap 或 scheduler 事件；只看到稍晚 RUNNING 不足以證明。

### 5.4 NumberOfMissedRuns：能知道與不知道什麼

[IRegisteredTask.NumberOfMissedRuns](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-iregisteredtask-get_numberofmissedruns)
僅定義為註冊 task 錯過 scheduled run 的次數。[RegisteredTask](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask)
也只提供 aggregate property，沒有 occurrence timestamps 或 trigger IDs。

| 問題 | 研究結論 |
| --- | --- |
| 實際代表什麼？ | Scheduler 提供的 missed-run aggregate；不是 Dashboard 自己的窗口 verdict |
| 何時增加？ | 官方已查閱 reference 未定義所有 condition / IgnoreNew / disabled / catch-up 路徑的增量時機；不猜測 |
| reboot 後如何？ | 已查閱文件未保證 reset、保留或重新計算規則；本次未 reboot，Not verified |
| 能直接定位某窗口 MISSED？ | 不行：沒有 occurrence 身分、時間、原因或觀測涵蓋範圍 |
| 能用差值嗎？ | 可當診斷 anomaly；不能假設 monotonic，也不能把 +N 任意分配給最近 N 個窗口 |

Live counter 為 0/0/0/4/0，第二次唯讀取值相同；只證明兩次取樣間數值相同。
HealthCheck 已停用仍有 4，沒有 disabled / re-registration / reboot timeline，無法知道它們何時發生。
**演算法不得以 counter>0 → MISSED 或 counter=0 → not missed。**

### 5.5 結果碼、restart 與「有執行」證據

[Result constants](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-error-and-success-constants)
區分 running、never-run、queued、user-not-logged-on、constraint-blocked attempt 等情況。
0x80041320 / 0x80041324 可以表達沒有真正啟動的 scheduler failure；非零不必然是 action 已完成的 exit code。
[AllowDemandStart](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-allowdemandstart)
允許獨立於 trigger 的 demand start；[RestartCount](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-restartcount)
及 [RestartInterval](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-restartinterval) 是 restart 設定。
[ExecutionTimeLimit](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-executiontimelimit)
與 [DeleteExpiredTaskAfter](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-deleteexpiredtaskafter)
分別管理 runtime limit 與所有 triggers 過期後的刪除，不是 missed-start timeout。

**Code finding：** 現有 JobNormalizer 在有效 LastRunTime + 非 informational 非零結果時分類 FAILED；
Stage 3A 依該分類保存 run。Stage 4 不應直接把每筆 legacy FAILED row 都升格為「action 確定啟動」或「特定 trigger 確定觸發」。
保留既有 failure；若結果是 launch/constraint error、timestamp 配對有疑義，occurrence evaluation 應 UNKNOWN / START_FAILURE，
不另創 MISSED，也不在本 Research 改 normalization。一般 exit code=1 且有可靠 execution 的案例仍明確是 FAILED。

## 6. Proposed expected-execution model

設計分三層：**schedule definition → nominal occurrence → evidence evaluation**。
PowerShell 只提供 evidence，Java domain layer 才生成／比對／判定；frontend 只呈現結論與原因。
不要在 collector 裡直接寫 MISSED 邏輯。

### 6.1 模型提案（非既有 API）

| 欄位 | 定義與取得方式 |
| --- | --- |
| jobId | 沿用 lowercased TaskPath+TaskName 的 Base64URL identity |
| definitionFingerprint | 相關 trigger/settings/principal 的版本指紋；不把 Actions 或帳號識別傳前端 |
| definitionObservedAt / validFromKnown | 定義觀測時間；不知道歷史有效起點時不能假定自 StartBoundary 就一直存在 |
| triggerKey | 定義版本內的 trigger identity；原始 Id 缺省則由完整 canonical trigger + version 建立穩定 key |
| occurrenceId | jobId + definitionFingerprint + triggerKey + scheduledAt；不能只有日期 |
| scheduledAt | 原定啟動 instant；保存原始 offset/time basis，內部 UTC |
| nextScheduledAt | 同 job 下一個 active occurrence 的 instant；不是本次 LastRunTime + 24h |
| windowStart / windowEndExclusive | 候選 execution start 的半開區間；v1 單 trigger 為 [scheduledAt, nextScheduledAt) |
| graceUntil | scheduledAt + start grace；包含邊界，只有 now > graceUntil 才算超過 grace |
| catchupAllowed | TRUE / FALSE / UNKNOWN；來源為 settings，不以 null 推成 false |
| catchupReviewAt | 可選的 UI 提醒時間，不是「Windows 不再補跑」的證據；缺 evidence 則 null |
| observationEpoch / coverage | Dashboard 這次可信觀測區段、失敗／restart／clock/definition gaps |
| availabilityEvidence | session/power/network/idle/service 是否可用及其時間範圍；可 UNKNOWN |
| overlapEvidence | instance 是否跨越 scheduledAt；需可靠 start/end 或事件，不能用 runtime limit 猜 |
| matchedRunIds / association | 0..N actual attempts；TIME_WINDOW / DIRECT_TRIGGER / AMBIGUOUS |
| evaluationStatus / reason | 與 current scheduler state、lastRunStatus 分離；如 UNKNOWN / WAITING_FOR_CATCHUP |
| evaluatedAt / evidenceRefs | 結論有效時間與來源引用，可追查，避免永久 stale MISSED |

下面只是 **synthetic model illustration**，不是替真實 task 宣判：

~~~json
{
  "jobId": "synthetic-daily",
  "definitionFingerprint": "fixture-v1",
  "triggerKey": "daily-1",
  "scheduledAt": "2026-09-21T06:30:00+08:00",
  "nextScheduledAt": "2026-09-22T06:30:00+08:00",
  "windowStart": "2026-09-21T06:30:00+08:00",
  "windowEndExclusive": "2026-09-22T06:30:00+08:00",
  "graceUntil": "2026-09-21T06:45:00+08:00",
  "catchupAllowed": true,
  "catchupReviewAt": null,
  "coverage": "UNKNOWN",
  "matchedRunIds": [],
  "evaluationStatus": "UNKNOWN",
  "reason": "INSUFFICIENT_OBSERVATION"
}
~~~

### 6.2 現有資料能力與缺口

| 目前實作 | 有什麼 | 缺什麼／Stage 4 建議 |
| --- | --- | --- |
| collect-scheduler.ps1 | task identity、state、enabled、last/next time、result、NumberOfMissedRuns、StartWhenAvailable、全部 CIM trigger properties | 缺 MultipleInstances、其他 settings、principal logon requirement、timezone context、definition version、每 task sample interval |
| JobNormalizer | UTC time、狀態、raw、warnings；scheduledAt/duration=null | 未產生 occurrences；先驗證 evidence 完整性，不猜觸發時刻 |
| JobService / JobsController | 每個 GET list/detail 都收集且觀測入庫 | on-demand，沒有 background coverage；不能用 server 正在運行等同每個窗口已觀測 |
| HistoryObserver / Repository | jobId+UTC lastRunAt 去重；first/last observed metadata | 不保存逐次 snapshot、RUNNING instances、conditions 或 definition history；first_seen/last_seen 不是連續 coverage |
| SQLite v1 | job_run 僅 SUCCESS/FAILED；observed_run_at 是 LastRunTime | 不可將 MISSED、WAITING 或 expected timestamps 塞進 completed-run table |
| GET /api/history | UTC bounded half-open range，純唯讀 | 空集合不是 no-execution 證明；不能在 history GET 觸發 collector 或補寫推論 |

推薦 v1 在 Java 中以**有限的目前 observation epoch**管理新 evaluation evidence；restart、clock jump、
collector gap 或 definition 變更後清除否定推論資格。可不改 v1 schema，代價是不能跨 restart 保留 MISSED 推論。
若 Manager 要求跨關機／restart 的可靠歷史，需另明確設計 versioned observation/coverage storage 或可靠事件來源，
不得假裝現有 SQLite 已提供。這是 Implementation dependency，**本次沒有實作或改 schema**。

## 7. Proposed matching algorithm

以下是可供 Implementation Review 的判斷規則，不是程式碼。

### 7.1 Candidate windows 與 run association

1. 僅對受支援的定義版本生成 bounded occurrences。自 StartBoundary 起算，先檢查 task/trigger enabled；
   不從今天日期、NextRunTime 減一天或 previous success 倒推。
2. 每個 occurrence 的候選 start interval 為 **[scheduledAt, nextScheduledAt)**。
   graceUntil 是準時／遲到界線，**不是候選 run 的硬性截斷**，否則會把已經遲到執行的 task 錯判 MISSED。
3. 沿用 jobId + lastRunAt 的 run identity；採 actual start timestamp，不用 firstObservedAt 或完成時刻配對。
   不接受 timestamp future、sentinel、collection warning、inconsistent running/result 作可靠 completed execution。
4. 一筆 run 最多關聯一個 occurrence；同一 occurrence 可以有多筆已觀察 attempts（例如 failure→retry success）。
   同日多次不能只做 DATE equality，亦不能用 nearest-time 把 06:25 強配給 06:30。
5. 單一無積欠 occurrence、沒有其他觸發來源歸屬衝突時，TIME_WINDOW association 可用來表示
   **這段時間觀察到該 task 執行**，不聲稱是該 trigger 因果觸發。即使 demand run 落在窗口，
   建議也能滿足「有 execution」的產品需求，但要保留 provenance=UNKNOWN，需 Manager 確認這個語意。
6. 如果需要證明「原 scheduled trigger 真的 fire」，僅 timestamp 不足，須額外 trigger/instance correlation。
   catch-up 積欠數個 occurrences、跨 nextScheduledAt 的補跑／retry、重疊 triggers 必須 AMBIGUOUS；
   不把同一 run 分給每一天，也不預設 oldest 或 nearest 贏。
7. Window 超過 nextScheduledAt 只關閉 **v1 自動 association**，不證明 Windows 已放棄補跑。
   後續直接 correlation 若出現，可更新 evaluation；原有 actual history 不刪改。

| Expected 06:30（next 為次日 06:30） | 建議結論 |
| --- | --- |
| actual 06:30:03，已完成且 exit 0 | 唯一窗口候選 → observed SUCCESS；非 trigger provenance 證明 |
| actual 06:25，06:30 前已結束 | 不 match 06:30；不因同一天而滿足 |
| actual 06:25，可靠證明持續 RUNNING 跨 06:30，IgnoreNew | current RUNNING；06:30 為 policy-suppressed，非第二次執行 |
| actual 06:45:00，已完成 | match；在 15 分鐘 grace 邊界，非 MISSED |
| actual 06:45:01，已完成且 exit 1 | match；FAILED + late，不是 MISSED |
| 06:30 啟動，07:30 仍 RUNNING | 該 occurrence 已有 start；RUNNING，不能等完成才排除 MISSED |
| 次日 06:31 才看到一筆 run | 可能是新 occurrence，也可能舊 catch-up；有積欠時 UNKNOWN association |
| 只知較晚一次 LastRunTime，DB 沒有 06:30 | 資料可能被覆蓋，不能證明 06:30 沒跑 |

### 7.2 Absence evidence：何時才能發出 MISSED

一個 candidate 要判 MISSED，必須**全部**成立：

| Gate | 必要證據 |
| --- | --- |
| Schedule | 完整、受支援、事先已知的定義；occurrence 確實存在且原定期間 enabled |
| Due | now > graceUntil；時鐘及 timezone 無未解釋跳動 |
| Observation | observation epoch 在 scheduledAt 前已開始；未跨不明 collection/restart/definition gap |
| No matching start | 沒有 completed、running 或其他可靠 started evidence；不是只查 completed rows |
| No policy suppression | occurrence 當時沒有未解釋的既有 running／queued instance 或 conditions |
| Catch-up closed | StartWhenAvailable=false，或具可靠的補跑結束／不適用證據；v1 不靠任意等待分鐘數滿足此項 |
| Reliable negative receipt | deadline 後可信新 snapshot，LastRunTime 仍早於 windowStart，無跨窗口 running，沒有 task recreation/reset；或完整事件 coverage 能證明區間沒有 start |
| Consistency | snapshot 非原子讀取疑慮已排除；在關鍵 deadline/transition 附近再讀確認，衝突則 UNKNOWN |

**缺 completed row 不等於 reliable negative receipt。**
若 post-deadline LastRunTime 已前進到較晚的窗口，則早期 run 可能已被覆蓋，無法從此欄位證明缺席。
定義 hash 前後相等只證明兩次 reads 相等，不是未曾短暫 disable/recreate 的完整 audit。
Implementation 必須明確訂出可信 epoch 的 evidence contract；只有間歇 polling、沒有 lifecycle/condition 證據時，
不能把 unknown 欄位預設成 satisfied。為避免猜測，v1 應拒判該 occurrence。

這套條件刻意使目前單次 inventory 無法產生 live MISSED；**研究成功不以一定產生 MISSED 為目標**。
對 catch-up=false 的受控完整 fixture 可驗證規則；對真實五個 tasks，先保留正向結果與 UNKNOWN。

### 7.3 Historical MISSED

同意使用者方向：只從 Dashboard 有足夠 observation 後開始，且「之後」仍須逐窗口通過 coverage Gate。
首次看到 task、first_seen_at、或目前 definition StartBoundary 不能代替過往 availability/definition history。
Dashboard 關閉期間的空洞仍為 **NO_OBSERVATION**，不補造 MISSED，也不當成成功。

v1 建議聚焦最近可評估 occurrence；下一個未到期 occurrence 顯示 next schedule。
若保留本次 session 的多個 evaluations，以 occurrence identity 分開；有缺口的舊窗口仍 UNKNOWN。
7-day History 維持既有 observed-runs 語意，沒有 run 的 cell 維持中性空格。
跨日、月底或 UTC 日界不是 reset proof；匹配依 instants，顯示才用瀏覽器本地日曆。

## 8. Proposed state precedence

**不要採用一條 RUNNING > FAILED > SUCCESS > MISSED > READY > UNKNOWN 全域排序。**
資料可信度、scheduler current state、特定 occurrence 結果、last completed outcome 是不同軸。
建議增加獨立 expected-evaluation 結構；以下為對外顯示的決策順序提案：

| 優先判斷 | Current / evaluation | 原因與保留資料 |
| --- | --- | --- |
| current collection 不可信／stale／欄位矛盾 | UNKNOWN；collection 全失敗仍現有 503 | 不以 stale RUNNING 掩蓋取樣失敗；保留已知歷史，標出 freshness |
| fresh 確認正在 RUNNING | current RUNNING | 包含 Enabled=false 但既有 instance 尚未停止；不做新的 job-level MISSED |
| fresh 確認 task disabled，且不在 RUNNING | current DISABLED | 已知歷史不消失；停用期間不產生 active MISSED |
| state QUEUED / 可能仍待啟動 | evaluation UNKNOWN / QUEUED | 不能視為 READY 或 completed；也不作 final MISSED |
| focus occurrence 有可靠 started / completed evidence | window RUNNING 或 FAILED / SUCCESS | 失敗代表有 attempt，不是 MISSED；late 作獨立標記 |
| 有直接 policy suppression / condition block 證據 | window UNKNOWN + 明確 reason | 不算 unexplained MISSED；若 start failure 保留 failure detail |
| 無 matching start，但 catch-up／coverage／definition／conditions 有疑義 | window UNKNOWN + reason | unsupported missed evaluation；不能 fallback 成正常未到期 READY |
| 有完整 absence evidence 且過 grace、catch-up closed | window MISSED；current 可呈現 MISSED | 只有此分支能增加 missed count |
| future 或 due-but-within-grace，且 schedule 可靠 | window READY / NOT_DUE 或 WITHIN_GRACE | 不以昨日 SUCCESS 稱今日 SUCCESS；fresh RUNNING/FAILED 仍在其自己的欄位 |

current scheduler state=Ready 的已完成 occurrence 可以 windowStatus=SUCCESS，current status 仍維持等待排程的概念；
不要把 future occurrence 染成 SUCCESS。舊的 FAILED 留在 lastRunStatus 或 history；
新的 occurrence 若有可靠 MISSED，舊 failure 不能遮掉新 MISSED，也不能移植成「這次 FAILED」。
若暫時未更改現有 current status 契約，至少提供獨立 windowStatus/reason，並把這項 UI/API 決策列入 Manager Gate。

同一 occurrence 中已觀察到 failure→success，attempts 全數保留；摘要建議 FAILED_WITH_RECOVERY reason，
top-level window attention 仍 FAILED，最新 attempt outcome 另外表示。與 Stage 3B 的 any-failure 日摘要一致。
只有無歧義的 attempts 才做此摘要；retry attribution 不明時只呈現 actual runs。

## 9. Grace / catch-up policy

### 9.1 Grace 15 分鐘的用途與限制

**Proposed：維持 global default=15，作用在 start，而非完成。**
Market/SEC/SyncImport 的 PT2H 不能使 15 分鐘 grace 不合理；它們允許長時間執行，RUNNING 自有保護。
Weekly-Check 的 retry=2/PT5M 不能成為放大 missed grace 的理由，因為 failure 已代表有 attempt。
HealthCheck 停用時 grace 不作用。

本次無長期 start-latency 分佈，不能聲稱 15 適合所有 tasks。
只在量得穩定、合理的啟動延遲或有業務期限時才新增 per-job override；
key 應用 full TaskPath+TaskName 或既有 jobId，避免不同 folder 的同名衝突。
不以「SEC 感覺比較重要」建議 30 分鐘；本次不改任何 YAML。

### 9.2 Catch-up 不與 start grace 混為一談

建議區分：

- **start grace**：nominal schedule 的容忍遲到時間。
- **catch-up review delay**：恢復可用後多久提示使用者仍無 execution。提案為 15 分鐘，容納官方預設 10 分鐘延遲並留餘量；
  這是 Dashboard UX policy，不是保證或實測上限。若 availability 未知則不建立計時起點。
- **final missed eligibility**：是否已具 no-start/coverage 且可排除尚待補跑；不是第二個 timer 超時就成立。

只有未關聯已執行窗口、schedule 已知且有可信恢復可用 evidence 時，使用 UNKNOWN / WAITING_FOR_CATCHUP；
如果只有 refresh 時間，不知道機器何時恢復或 principal 何時登入，使用 UNKNOWN / CATCHUP_AVAILABILITY_UNKNOWN。
超過 review delay 後仍無 run，顯示 UNKNOWN / CATCHUP_OVERDUE，提示需要調查，**不自動 MISSED**。
READY 應留給可靠未到期或 within-grace，不能讓已過期的未解狀態看起來一切正常。
以上 reasons 是建議，現有 enum/schema 沒有改動。

### 9.3 Sleep / shutdown 的產品定義

建議 Dashboard 的 MISSED 定義為：
**一個事先已知且應觀測的 nominal occurrence，在政策允許的窗口內沒有 start，並有足夠證據排除未觀測／合理延後／政策抑制。**
這是「排程未照原定執行」的觀測，不是指責 Windows 一定故障。

| 概念案例 | 產品語意 | v1 能否直接判 |
| --- | --- | --- |
| 06:30 schedule，06:00–09:00 已證實關機，StartWhenAvailable=false | 06:30 仍是原先存在的 obligation；若 enabled/definition/absence 全有證據，MISSED，reason=MACHINE_OFF；不是 Not expected anymore | 目前沒有 power/coverage history；通常 UNKNOWN / OBSERVATION_GAP |
| 同例但 StartWhenAvailable=true，09:00 恢復且 session/其他條件確知可用 | 等待補跑；09:15 作 review point，不是 final deadline | WAITING_FOR_CATCHUP；實際 Windows 啟動時間仍待驗證 |
| 09:10 有可靠且唯一的 matching run | outcome SUCCESS/FAILED + late；保留 scheduledAt=06:30 | 有 execution 不判 MISSED；不要假造 06:30 準時 |
| 09:15 還沒跑 | 補跑逾 review point，應受關注 | UNKNOWN / CATCHUP_OVERDUE；官方沒有最晚保證 |
| 只在 09:00 第一次打開 Dashboard | 沒有事先義務／定義／availability coverage | UNKNOWN，不能回補 06:30 MISSED |
| sleep + WakeToRun=true | 可以要求喚醒，但不是結果證據 | 仍需實際 wake/availability evidence |

將準時性表示為獨立 lateness 欄位，可在 late success 之後仍看出沒有按原時刻執行，
不需要把已執行的 run 同時算作 MISSED。若 Manager 希望「只要遲到就永久 MISSED」，
那是另一種 deadline-violation 指標，會混淆本次 no-execution 定義，建議不採用。

## 10. Proposed fixtures

以下 **尚未實作／執行**，是 Implementation Chat 的 acceptance matrix。
全部使用 synthetic identity 與 clock；真實 JSON 只能作 sanitized shape fixture，不能把 snapshot 複製成假的歷史。
每個 fixture 應同時斷言 status、reason、scheduledAt、association、history 是否完全未改寫。

| Fixture | 關鍵輸入 | 預期 |
| --- | --- | --- |
| daily normal | 06:30、actual 06:30:03 exit 0 | window SUCCESS；非今日所有 future SUCCESS |
| daily missed | catch-up=false、完整 coverage/conditions、deadline 後 LastRunTime 仍早於窗口 | MISSED |
| not due | 現在 06:20、schedule 06:30 | READY / NOT_DUE |
| exact grace boundary | now=06:45、無 run | WITHIN_GRACE；06:45 後才可能進 absence gates |
| running | 06:30 start，07:30 RUNNING，history 尚無 completed row | RUNNING、零 MISSED |
| disabled | task disabled、trigger enabled、counter=4、NextRunTime 仍有值 | DISABLED、零 MISSED |
| disabled trigger | task enabled、trigger disabled | NO_ENABLED_TRIGGER；不產生 occurrence |
| failed execution | 06:30:03，已確認 exit 1 | FAILED，不是 MISSED |
| launch blocked | 0x80041320 / 0x80041324 + 可疑 LastRunTime | 保留 failure；不可當成已完成 action 或憑空 MISSED |
| machine-off conceptual | known 06:00–09:00 off、catch-up=false、事先定義與完整 absence | MISSED / MACHINE_OFF |
| machine-off unknown | 同時間但無 pre-observation 或 power record | UNKNOWN / OBSERVATION_GAP |
| StartWhenAvailable | true、09:00 verified availability、06:30 missed nominal start | WAITING；09:15 後仍 UNKNOWN，不硬宣判 |
| late catch-up | 上例 actual 09:10、只有一個 candidate | outcome + late；不是 MISSED |
| catch-up backlog | 離線三天、只見一筆 run | 不滿足三個 occurrences；AMBIGUOUS |
| weekly Friday | WeeksInterval=1 / mask32 | 只 Friday 22:00；週六不額外生成 |
| weekly weekday mask | mask62 | Mon–Fri；週末不生成 |
| repetition | 1m/4m、StopAtDurationEnd true/false | v1 unsupported；未來需證明含端點 5 次與停止語意 |
| midnight | 23:55 schedule、00:05 actual | 同 occurrence matching，不因換日失配 |
| offset / UTC | +08:00 與等價 Z、browser 不同 timezone | 相同 instant / identity；不隨 browser 改 obligation |
| multiple triggers | 06:30、06:40，同一 job | v1 unsupported；不能同一 run 滿足兩個窗口 |
| early actual | 06:25 completed，06:30 expected | 不 match |
| at / after grace actual | 06:45:00、06:45:01 | 都 match；後者 late，不是 MISSED |
| IgnoreNew overlap | 06:30 instance 有證據跨 07:30 | current RUNNING，第二次 SUPPRESSED_BY_INSTANCE_POLICY |
| uncertain overlap | 只有 07:35 RUNNING snapshot，無開始/連續性 | 不回推 07:30 suppressed，也不 MISSED |
| retry failure→success | RestartCount=2、不同 actual starts | 保留兩筆 outcome；非兩個 nominal occurrences |
| demand start | 06:35、來源 demand known/unknown | TIME_WINDOW policy 可表示有 run；不能聲稱 scheduled trigger fired |
| overwritten history | 早期窗口未觀測，較晚 LastRunTime 已覆蓋 | UNKNOWN，DB 空洞不代表缺席 |
| counter delta / reset | 0→4、4→0、reboot 未知 | 診斷欄位，不改 occurrence verdict |
| changed definition / lifecycle | enabled 變更、同名重建、fingerprint 變化 | coverage reset，UNKNOWN；不沿用舊 obligation |
| unsupported timezone/DST/random | timezone-less、DST gap/fold、RandomDelay | UNKNOWN，不套預設 timezone/zero delay |
| collector/history failure | timeout、permission、stale 或 history 不可讀 | UNKNOWN / 明確 error；不產生 MISSED |
| restart / no coverage | 有 first_seen/last_seen 但中間關閉 | UNKNOWN；不把 min/max 當 continuous coverage |
| queued / contradictory reads | state/result/LastRunTime 在讀取間變化 | 再讀或 UNKNOWN，不使用混合證據 |
| prior failure vs new window | 舊 FAILED、今日未到期／已證實缺席兩例 | 分開 last outcome 與 READY/MISSED evaluation |

## 11. Proposed Stage 4 Gate

### 11.1 未來 Implementation 的分階段 Gate

| Stage | Goal / Scope | Dependencies | Gate / Done when | Self-QA |
| --- | --- | --- | --- | --- |
| 4A Evidence | 明確 collector evidence contract，null/presence、settings/principal/time basis/version | 本研究 + Manager 決定 observation 支援範圍 | 五個 task 值可逐欄對照；沒有預設 true/false 掩蓋缺資料 | sanitize、permission/partial、非原子讀取、definition 變化 |
| 4B Domain | pure expected generation / matching / precedence | 可注入 clock、受支援形狀、coverage contract | 上節 acceptance matrix；unsupported/unknown fail closed | 午夜、FAILED/RUNNING、catch-up、IgnoreNew、counter 無權決定 |
| 4C API/UI | current、last run、window evaluation 明確分開 | Review 通過的狀態語意 | missed count 只計可信 evaluation；unknown reason 可看；history 不假造 | 現有 Stage 2 / 3B 契約與多次執行摘要維持正確 |
| 4D 驗收 | 所承諾支援的真實 Windows 行為 | Manager 另外授權的隔離 controlled test tasks / 測試機 | normal / due-no-run / not-due / disabled、catch-up/conditions/overlap 有原始時間線證據 | 不動五個使用者 tasks；fixture 與 live acceptance 分開 |

PLAN Stage 4 的 controlled tasks Gate 留給**另行授權的 Implementation**，本次 Research 禁止建立或執行 tasks，
所以沒有進行這個 Gate。不能用研究 inventory 或既有測試數替它通過。

Production enablement 必須再滿足：

1. Manager 接受 v1 supported / unsupported 範圍，以及實機 catch-up 缺席可能長期 UNKNOWN 的限制。
2. 每個 MISSED 有 occurrence identity、deadline、coverage、negative receipt、conditions 和 catch-up decision 可追查。
3. 若只做 on-demand snapshots，無法滿足 coverage 的窗口必須 UNKNOWN；不能把「兩次 hash 相同」當完整 audit。
4. FAILED / RUNNING 不誤標 MISSED；舊 failure 與新 due window 分開。
5. 隔離 fixtures 使用既有 source precision / null / offset 形狀；新增實作要跑現有相關 regression tests。
6. /api/history 仍純唯讀；SQLite v1 不存假的 MISSED runs；restart coverage 行為寫入文件。
7. 對外說明 scheduler result，不宣稱 application-level success（Stage 5 仍未開始）。
8. 沒有 live validation 的 trigger/settings/OS 行為標示 Not verified，不能稱全部生產驗收完成。

### 11.2 本次 Research Gate receipt

| 要求 | 結果 / evidence |
| --- | --- |
| 1 全部 monitored selection inventory | PASS：example 5/5 exact keys；設定來源限制已明示 |
| 2 trigger types | PASS：3 Daily / 2 Weekly，CIM + XML |
| 3 repetition | PASS：五個均無 Interval / Duration，XML 無 Repetition |
| 4 StartWhenAvailable | PASS：五個 true，XML 對照 |
| 5 MultipleInstances / settings | PASS：五個 IgnoreNew；逐欄差異表與 JSON |
| 6 conditions | PASS：idle/network/power/wake/principal 設定清楚；歷史可用性未假造 |
| 7 官方 Windows 語意 | PASS：Microsoft reference / KB；counter reset 等未定義部分明確未知 |
| 8 可安全 MISSED 的範圍 | PASS：限定 evidence gates；未聲稱本次 snapshot 可判實機 MISSED |
| 9 不能判的情形 | PASS：第 4、7、9 節列明 |
| 10 模型不猜資料 | PASS：缺 coverage/conditions/correlation 時 UNKNOWN；依賴缺口列為 implementation prerequisites |
| 11 無 task mutation | PASS：只用讀取 cmdlets；前後 definition hashes 相同，交付再驗一次 |
| 12 未開始 production implementation | PASS：只新增 docs/evidence；source、frontend、schema、PLAN 皆與 baseline 相同 |

Research PASS 表示問題與安全邊界已可供 Manager 決策，**不表示 NumberOfMissedRuns reset 或 live catch-up 已實驗證明**。

## 12. Risks / open questions

1. **優先決策：產品是否接受在窗口內有 demand run 即算「有執行」？** 建議接受 TIME_WINDOW association 並明示來源未知；
   若必須 trigger-causal evidence，需不同證據來源，不能只用 Stage 3A lastRunAt。
2. **coverage 能力：** v1 可先 session-only + UNKNOWN；若要求關機後也追溯 MISSED，需額外持久化/事件與 lifecycle 設計。
   目前觀測庫不夠，不能在 implementation 中悄悄把 first_seen_at 當起點解決。
3. **Catch-up 最晚期限：**官方不給上限，本機未做 controlled reboot/login experiment。
   建議 CATCHUP_OVERDUE 只提示；若 Manager 選政策性 deadline，必須明稱 deadline violation，不能聲稱 Windows 不會再跑。
4. **Trigger generation 與 MISSED acceptance 分開：** 可以可靠計算五個 nominal schedules，但無法因而保證所有 actual windows 都可判。
5. **Launch error / legacy history：** Stage 3A 的一般非零分類不是 action start 的完全證據；不要改歷史資料來配合研究。
6. **Retry / demand / IgnoreNew：** snapshots 可能遺失 intermediate attempts；保留結果，對來源／次數的歧義不要補造。
7. **snapshot 非 atomic、短暫設定變更與同名重建：**本次 hashes 相同只提供 bounded read safety evidence，不是全機器 audit。
8. **版本限制：**文件涵蓋多版 Windows，本機為 Windows 11 + UnifiedSchedulingEngine；
   每個不確定的 OS 行為先保持 unsupported，不因 Win7 compatibility 字串而套用舊版實驗結果。
9. **Scope：**本次沒測 application business success、未分析或保存 Actions/credentials、沒修復實際任務失敗、沒改排程或部署 dashboard。
10. **驗證範圍：**本次驗證 JSON/schema completeness、CIM/XML agreement、PS7/PS5.1 evidence 一致、
    task hashes、sensitive-data exclusion、docs-only Git diff；未重新跑 Java/frontend regression，因 production code 沒變。

### 重現與交付檢查

從 repository 根目錄，先檢視 research helper，再於 PowerShell 執行：

~~~powershell
& ([scriptblock]::Create((Get-Content -LiteralPath 'docs/evidence/stage-4/collect-research.ps1' -Raw)))
~~~

Helper 刻意只接受目前已審閱的 example full identities；若本機 override 已建立或 selectors 改變，會停下要求重新檢視研究輸入，
不默默宣稱已解析全部 Spring configuration。它是研究工具，不是新的 production collector。
原始 XML 僅在記憶體中用於讀取及 SHA-256；提交檔案不含 Actions、帳號、SID、registration metadata、機器敏感路徑或命令參數。
有保留必要的 TaskPath（本次全為 scheduler 根目錄）。

本次實際完成 checkout/fetch/pull/ancestry/clean-tree 檢查、兩版 PowerShell 唯讀 inventory、CIM/XML 及 hash 比對。
交付 validation receipt 記錄最後 scope/privacy/inventory assertions 與 task definition 再確認。
提交及推送本研究分支後停止；不 merge main、不開始 Stage 4 code 或 Stage 5。
