# Stage 4 Event Evidence Research

日期：2026-09-21（Asia/Taipei）。Manager baseline：`b33961338dad2d04e5f2bb5df60955cae2b9b9da`。
分支：`research/stage-4-event-evidence`。Repository 是 source of truth；未使用之前對話作研究證據。

## 1. Executive conclusion

**選 Option C — Event Log insufficient：目前不可可靠宣判五個 tasks 的 scheduled occurrence = MISSED。**

Operational log 目前 **disabled**，所有五個 exact task queries 都沒有 events；設定可讀不等於有歷史 coverage。
本機安裝的 Microsoft provider metadata 確實提供時間觸發、按需啟動、補跑、instance lifecycle、IgnoreNew 等有價值的正向證據。
然而，**execution instance identity 不等於 scheduled occurrence identity；retained-record continuity 不等於所有 execution 都被記錄**。
即使日後啟用，也不能僅以空 query、完整 RecordID 區段或 grace 過期證明沒有啟動。

Hybrid 是值得採用的未來 **positive evidence 儲存架構**，但本研究沒有證明它足以提供可信的 no-start verdict，故不選聲稱「已足夠」的 B。
目前維持 `UNKNOWN`；`StartWhenAvailable=true + no execution = UNKNOWN`。Manual/demand execution 不得自動滿足或洗掉 scheduled MISSED。

**嚴格 Research Gate：FAILED（第 3 項 Operational execution XML 實證不足）。**
研究交付與可執行的唯讀檢查已完成；實際讀到 TaskScheduler **Maintenance 800** 及 System XML，
但沒有 Operational execution XML，不能把 metadata template 或 Maintenance event 當成 107→100→200→201→102 的實機驗證。
不啟用 log、不製造 events 來通過 Gate。交付失敗 Gate 的研究紀錄供 Manager Review，並停止；不表示已獲實作或 merge 授權。

標記定義：**Verified**＝本次 live read／repository code／有引用的官方契約；
**Inferred**＝依證據推論；**Proposed**＝未實作的設計；**Not verified**＝缺實機樣本或契約保證。
Metadata verified 只證明本 OS 有該 schema/message，不保證所有 runtime 路徑必定發出它。

## 2. Plan / Stage / Gate / Self-QA

已先列出計畫後直接研究，無等待確認。Workspace AGENTS.md 適用；repository 下未找到較近 AGENTS.md。

| Stage | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| Baseline | checkout main、fetch、pull --ff-only、ancestry、clean tree、建立指定分支 | Git / remote | HEAD 為指定 baseline | 保留原檔；不依其他 Chat |
| Context | PLAN、README、Stage 3A/3B、Stage 4 research/evidence、collector/normalization/history/tests | repository | 確定現有 observed-run 邊界 | 不啟動 app、不碰 operational DB |
| Local read | config/permissions/retention/provider XML、五 task、其他可用 Windows sources | 現有唯讀權限 | 每個成功／空／拒絕查詢均有收據 | 不 enable、clear、resize、run task、reboot |
| Semantics | Event IDs/fields、correlation、provenance、negative evidence、coverage | Microsoft docs + metadata + existing events | 區分能力與實機驗證 | 不把 schema、時間接近或 absence 當 execution proof |
| Delivery | 報告、去識別化 samples、read-only helper、Gate | 上述發現 | 可 review 的結論与限制 | syntax、PS7/5.1、XML、hash、privacy、Git diff |

檢查資料流：`collect-scheduler.ps1 → PowerShellCollector → JobNormalizer → JobService → HistoryObserver → HistoryRepository`；
另檢查 V1 SQL、History API/read-only path、normalizer/history/restart/API tests。
`PLAN.md` 最後的 Manager assignment 以 Event Evidence research 為範圍；本次不修改 PLAN 或舊研究。

## 3. Operational Log state（Verified）

證據：[inspection.json](evidence/stage-4-event/inspection.json)。本機 Windows build 26200，primary PowerShell 7.6.5；另用 Windows PowerShell 5.1 交叉讀取。

| 項目 | 實際結果 / 意義 |
| --- | --- |
| Channel / provider | `Microsoft-Windows-TaskScheduler/Operational` / `Microsoft-Windows-TaskScheduler`，存在 |
| Enabled | **false**；研究前後相同 |
| Current token | 非 elevated Administrator；不輸出 account identity |
| Configuration read | Get-WinEvent -ListLog、wevtutil gl 均成功 |
| Event query access | 全 channel newest/oldest 與五 task queries 回 `NoMatchingEventsFound`，沒有 AccessDenied；目前 query 可執行，無實際 Operational record 可測 payload read |
| 一般使用者權限 | ACL 有 Interactive Users read、Event Log Readers read ACE，與 [channel access contract](https://learn.microsoft.com/en-us/windows/win32/wes/eventmanifestschema-channeltype-complextype) 一致；只驗證目前 token，不推廣到所有使用者或部署帳號 |
| Log mode / max | Circular / **10,485,760 bytes（10 MiB）** |
| Retention / overwrite | retention=false、autoBackup=false；容量到達時可覆寫舊記錄，不承諾保留幾天 |
| Current file size | **null / 未提供**，不是 0；Get-WinEvent 與 EventLogSession.GetLogInformation 均無數值 |
| Record count / oldest RecordID / IsLogFull | **null / 未提供**；查詢回 0 records 不等於 API 回報 recordCount=0 |
| Oldest / newest event time | **無可取得 event，null**，不能宣稱保留範圍包含任何 schedule |
| Scheduler / Event Log services | 本次讀取均 Running；不代表整個歷史窗口都 Running |
| Historical enabled / clear / overwrite | **UNKNOWN**；disabled now 不證明從未啟用，也不能斷言舊事件已覆寫或已清除 |
| Current evidence gap | execution coverage **UNKNOWN**，現在 channel 不記錄；所有過往 nominal windows 均不具此來源的 negative eligibility |

[wevtutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wevtutil) 區分 gl/config 與 gli/log information，並說明 retention 行為。
本次額外 `wevtutil gli` 無資訊輸出；未把空輸出轉為零。沒有直接讀取或提交 `.evtx`。

**Reboot persistence：** channel 是 file-backed，不是 Dashboard 記憶體。
現有 System 同時保存關機與稍後開機 events，實證該 System file 保留跨啟動紀錄；不能據此聲稱目前無資料的 Operational 已通過相同實機驗收。
一般持久化 log 可跨 reboot 存留（file-backed 模型推論），仍受 clear、overwrite、損壞及 retention 限制；不保證 reboot 前未 flush 的尾端事件。
本次沒有 reboot/sleep/logout 操作。沒有「重開機後永不遺失 event」的可靠契約可採用。

## 4. Relevant Event IDs / payload inventory

本機 [provider-metadata.json](evidence/stage-4-event/provider-metadata.json) 保存 **152 個 event/version 定義**，其中 Operational 109。
每筆包含 provider、channel、ID、version、level、opcode、Task symbol/display、message template、typed payload 與 template XML。
這是 Windows 安裝的 provider metadata，**不是 live event samples**。中文 message 有本地化差異，collector 應依 named XML fields/version 解析，不解析翻譯後文字。
實際交叉讀取發現 PS7 與 PS5.1 的 137 個 message templates 分別為中文／英文；排除 localized description 後，所有 typed schemas、IDs、versions、symbols 相同。

以下除特別註明，provider 都是 `Microsoft-Windows-TaskScheduler`、channel 都是 Operational。
Level：I=4 Information、W=3 Warning、E=2 Error。**以下 Operational IDs 本機 sample 全部為「無」；actual timestamp 均 unavailable。**
若未來有 event，event time 取 `System/TimeCreated/@SystemTime`，不是 nominal scheduledAt。
`System/Correlation/@ActivityID`、`@RelatedActivityID` 是可選 envelope 欄位，不出現在 payload template 不代表一定 absent，也不能假定存在。
[Microsoft event schema](https://learn.microsoft.com/en-us/windows/win32/wes/eventschema-systempropertiestype-complextype) 定義其位置與 envelope ProcessID 意義。

表中 `T=TaskName`（可能含完整 scheduler path），`Iid=InstanceId`、`TI=TaskInstanceId`、`A=ActionName`、`R=ResultCode`。
未列之 payload 欄位即該表列版本沒有，不能填入虛構 TriggerId/ActionId。完整原名、順序、types 見 JSON。

| ID / version / level | Payload | 能證明的正向事實（若取得有效事件） | 不能證明 |
| --- | --- | --- | --- |
| 107 v0 I | T, Iid | time-trigger source；symbol `task:TimeTrigger` | 沒有 TriggerId、nominal time；不能證明 action 已開始或多個積欠 occurrence 的歸屬 |
| 110 v0 I | T, Iid, UserContext | user/demand source；`task:Run` / Task triggered by user | 不是「人必定點 UI」；程式 API 也能按需啟動；不是 calendar occurrence |
| 114 v0 W | T, Iid | missed schedule 後的 launch / catch-up provenance | 沒有原 nominal timestamp、補跑數量、pending/cancel deadline |
| 108/109/117/118 v0 I | T, Iid | event / registration / idle / boot source | 非 calendar proof；118 不是一般 retry marker |
| 119–125 v0 I | T, UserName, Iid | logon、console/remote connect/disconnect、lock/unlock source | session-trigger 類別不是所有 interactive 可用性的完整 audit |
| 100 v0 I | T, UserContext, Iid | task instance 已啟動 | 不是 action 已啟動、完成或原定排程已满足 |
| 102 v0 I | T, UserContext, Iid | scheduler instance completion | 無 exit/result payload；「完成」不可獨自轉 business SUCCESS，亦不可忽略 201 非零 |
| 101 v0 E | T, UserContext, R | task launch failure | **沒有 instance GUID**；無法單靠它連一個 execution / nominal occurrence |
| 103 v0 E | T, Iid, UserContext, R | 特定 instance 啟動失敗 | 不證明 action run 或完成 |
| 104/105 v0 E | UserName, ErrorDescription, R / Context, R | logon / impersonation failure | 無 task identity；不能直接套給五個 tasks |
| 129 v0 I | T, **Path**, ProcessID, Priority | process launch 診斷 | **無 payload instance GUID**；message 的「instance %2」其實是 Path，不可錯當 GUID |
| 200 v0/v1 I | T, A, TI；v1 加 EnginePID | action start，具 task instance key | A 是名稱/路徑，不是唯一 action execution ID；EnginePID 不是 action PID 保證 |
| 201 v0/v1/v2 I | v0 T,A,TI；v1 T,TI,A,R；v2 再加 EnginePID | action completion；v1+ 提供 result | v0 無 result；Information / successful wording 不保證 R=0 或業務成功 |
| 202 v0/v1 E | T,TI,A,R；v1 加 EnginePID | action completion failure | 不能虛構缺失的 start；非 MISSED |
| 203 v0 E | T,TI,A,R | action launch failure | action 未成功啟動；與 action 執行後失敗分開 |
| 111 v0 I | T,Iid | instance termination | 無完整原因 / business result |
| 126 v0 W / 127 v0 I | T,R / T | restart attempt / shutdown race restart intent | **無 previous/new GUID edge、retry ordinal、nominal time**；不得按 timestamp 自動合併 attempts |
| 128 v0 I | T | 超過 task end time 而未啟動 | 無 occurrence key；不是所有 future catch-up 已取消的通用證據 |
| 130 E / 131 E / 133 E | T,R / T,CurrentQuota / T,TaskEngineName,UserName | service busy / queue quota / engine capacity 阻擋 | 不提供可靠 calendar association |
| 112 W / 135 W | T | network unavailable / not idle 阻擋 | 無 instance / occurrence key；absence 不等於條件成立 |
| 153 v0 W | T | scheduler 明確說 missed schedule 未 launch | **沒有 scheduledAt / TriggerId / Iid**；不是直接可入庫的 occurrence MISSED |
| 151 v0 E | T,LogPoint,R | task instantiation failure | 沒有 creation GUID；**未找到通用且獨立的成功 instance-created payload contract** |
| 322 v0 W | T,TI | 新 launch request 因同 task 既有 instance running 被忽略 | **TI 是既有 running instance**，沒有被拒新 instance、TriggerId 或來源；不能把既有 run 算第二次 |
| 323 v0 W | T,StoppedTaskInstanceId,NewTaskInstanceId | StopExisting 的兩端 instance 關係 | 不表示 IgnoreNew 或 queued |
| 324 v0 W | T,QueuedTaskInstanceId,RunningTaskInstanceId | queue 等待前 instance 完成，雙端 key | 不等於 StartWhenAvailable catch-up；無原定時刻 |
| 325 v0 W | T,QueuedTaskInstanceId | instance 已 queued | queue 原因、啟動期限、是否仍 pending 未必可得 |
| 326 v0 W | T | battery gate 阻擋 | 無 occurrence GUID；不能從缺事件排除 battery |
| 327/328/329 v0 I | T,TI | battery / idle end / runtime-limit termination | runtime-limit 不表示原定時間的 overlap；非 start deadline |
| 330 v0 I | T,TI,UserContext | user requested stop | 非 manual-start source |
| 331 v0 W | T,TI,R | timeout mechanism 建立失敗，task 繼續 | **ExecutionTimeLimit 不是可靠已停止證據** |
| 332 v0 W | T,UserName | launch conditions met 時 user 未登入 | 無完整 session timeline 或 instance；absence 不保證已登入 |
| 333/334 v0 W | T | RemoteApp / worker session gate | 無 nominal attribution |
| 106/140/141/142 v0 I | T,UserContext / T,UserName | register / update / delete / disable lifecycle | 無完整 definition XML、精確 trigger/settings diff 或通用 immutable registration ID；無專用 enable ID 可據此假定完整 |
| 400/402 v0 I | empty | Scheduler service start / shutdown | 沒有事件不表示一直在線 |
| 403 v0 E / 410 v0 E / 411 v0 I | ErrorDescription,R / R / empty | service error / wake timer failure / time change notification | 411 無 old/new clock values；不能單靠此建立 UTC 校正 |
| 317/318/319/320 v0 I | TaskEngineName / 同左 / TaskEngineName,T / TaskEngineName,TI | engine start/stop / 收到 launch / stop request | engine lifecycle 不是 scheduler service lifecycle；收到要求不是 action started |

其他直接相關 channels：System 的同 provider `401,404–409,412–414` 是 service/init/definition failures；
`719` 表示 scheduler 為效能停用 logging。它们也只有正向診斷意義；沒有 719 不能證明未停用。
Debug / Diagnostic 本機 disabled；Maintenance enabled 且有 800，但 idle/maintenance events 不是這五個 calendar tasks 的替代 audit trail。
本研究未開啟這些 channels，也未假設 debug 有更可靠的 occurrence ID。

## 5. Correlation result

**Verified metadata capability / Not verified live Operational chain：** `InstanceId` 與 `TaskInstanceId` 都是 GUID；
107/110/114/100/102 使用前者，200/201/202/203 使用後者。本機 payload 無 TriggerId，核心 action events 無 ActionId。
未見可把每個 nominal occurrence 唯一串接到 GUID 的欄位。

**Proposed execution key：** `(local source identity, provider, full task identity, instance GUID)`；另外保存 channel/log generation 與 definition association，
避免外部匯入主機、task recreation、未知版本混用。GUID 不含 task name；不要把 `EventRecordID` 當 execution ID。
例如以下是 **schema-derived illustration，非本機執行**：

```text
107 TaskName=T, InstanceId=G (time source)
100 TaskName=T, InstanceId=G (task started)
200 TaskName=T, TaskInstanceId=G, ActionName=A (action started)
201 TaskName=T, TaskInstanceId=G, ActionName=A, ResultCode=R (action ended)
102 TaskName=T, InstanceId=G (task ended)
```

若取得這組 payload，GUID equality 可作直接 execution 關聯，優於 timestamp heuristic；不要求每次都按此排序或齊全。
保留 orphan terminal、missing-start、multiple actions 與 conflicting provenance；不補出不存在的事件。
`System/Execution/ProcessID` 是**發出事件的 process**，不能當 action PID；129 的 payload `ProcessID` 是另一欄位。
PID 會重用，EnginePID 可能服務多個動作，UserContext 也不唯一。ActionName 可能重複，不能單憑它跨 retry/multi-action 配對。
ActivityID / RelatedActivityID 僅在實际存在、且 controlled acceptance 證明 mapping 時作輔助 edge；不可預設 ActivityID=Iid。
本次 Maintenance 800 及 System samples 的 Correlation 為空，不能外推為 Operational 一定為空。

[Consuming Events](https://learn.microsoft.com/en-us/windows/win32/wes/consuming-events) 明示 query 非原子 snapshot，跨 thread events 可能次序不同。
因此 GUID 關聯與 bounded ingest checkpoint 優先；時間接近、文字相同、PID 相同只有 heuristic。
**回答：schema 有可靠 execution key 的候選直接欄位，但本機 execution lifecycle 未驗證；occurrence correlation 仍 Partial。**

## 6. Scheduled vs manual

| 分級 | 判斷 |
| --- | --- |
| Reliable（有適用版本的實際 source event 時） | 同 task、同 GUID 的 107 與 110 能區分 time-triggered 和 user/demand source；114 明示 catch-up launch。這是 metadata 語意能力，尚非本機 live acceptance |
| Partial | 只有 100/200/201/102 或缺 source event，可證 execution，不能知道來源；107 也不提供 nominal occurrence / trigger identity；110 不保證 UI click |
| Impossible with current evidence | 五個 tasks 沒有 Operational events，LastRunTime 接近 06:30/11:15 不能證明 source；無法對這些真實 runs 判 scheduled/manual |

[IRegisteredTask.Run](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-iregisteredtask-run) 提供按需啟動 API，故 user marker 不等同人為操作證明。
**06:30 expected、06:35 demand G2：**只新增 G2 的 execution evidence；不關聯原 scheduled occurrence、不修改其 MISSED/UNKNOWN。
之後若取得 scheduled G1 的直接證據，依 G1 修正原 occurrence 並保留 evaluation revision；不是由 G2 洗掉。
這項決策取代舊研究 §7.1/§10/§12 曾提議的 TIME_WINDOW demand satisfaction。不能僅以同日或 nearest-time match。

## 7. Negative evidence / MISSED

**沒有 event 只有在可證明「如果開始就必然被這個來源完整記錄且可讀」時，才是 execution 的 negative evidence。**
目前沒有這種 TaskScheduler Operational 端到端無遺失保證。
[EventWrite](https://learn.microsoft.com/en-us/windows/win32/api/evntprov/nf-evntprov-eventwrite) 官方列出 buffer/disk 壓力下事件可被丟棄、以及無 recording session 時可回 success 而不記錄。
這不是聲稱本機發生過 loss，也不是斷言每個 TaskScheduler 路徑使用相同底層 call；它否定「一般 ETW success/連續 RecordID 足以證明全 execution 捕捉」的假設。

**Proposed 必要條件（全部滿足才有資格再評估，非已充分的 Windows contract）：**

1. 在 scheduledAt 之前已知道受支援、當時有效且 task/trigger enabled 的 definition version；同名重建/中途停用已排除。
2. 事件來源在整個相關區間已啟用，無未知 provider/service/clock/OS gaps；permissions、filter/version/schema 支援正確。
3. 相關 records 未被覆寫、清除或漏讀，且有可恢復的 ingest cursor；查詢非 truncated、非 tolerant partial success。
4. deadline 後取得可信 checkpoint，讀完到 high-water mark，再處理 late/out-of-order delivery；單一較晚 event **不是所有較早 events 都已送達的 watermark**。
5. 有受支援 execution emission contract／受控驗收與可監控 loss policy，足以把 records absence 連到 execution absence。否則 `executionCoverage=UNKNOWN`。
6. 無 matching **start**（不只完成）、沒有無法解釋的 orphan completion/source/launch failure、queue、suppression、retry 或 source 歧義。
7. machine、scheduler、principal session 及相關 condition eligibility 有必要證據；缺任何必要條件為 UNKNOWN。
8. StartWhenAvailable=false 或有明確、可歸屬的 catch-up closed evidence。不能以固定等待 10/15/30 分鐘取代。

例 `06:30 expected / 06:45 grace`：即使 06:46 空 query 且 newest event 是 06:46，也不能推 MISSED。
`153` 是正向「scheduler 報告 missed launch」證據，可呈現 `SCHEDULER_REPORTED_MISSED_START`；
但沒有 nominal time/GUID，遇積欠、多 trigger、definition 變更仍不可指定為 06:30。不要讓 event 名稱跳過 occurrence Gate。
`322` 則是已知 policy suppression，`203` 是 action launch failure，均不應被概括為 unexplained MISSED。

目前安全輸出：**有正向 evidence 就保存其事實；缺足夠 evidence 則 UNKNOWN。**
不回補 Dashboard 之前的 inferred MISSED，不把 legacy job_run FAILED 當 action 必定啟動，也不把 102/201 Information 當業務成功。

## 8. Coverage model（Proposed）

建議區分 `recordCoverage`（已發佈/保留 records 的讀取）與 `executionCoverage`（對 execution inference 是否充分）。
每個 coverage verdict 必須限定 source、channel、log epoch、time/record interval、definition epoch、filter/schema version，不能只是全域 boolean。

| Coverage | 定義 | 可否 negative inference |
| --- | --- | --- |
| COMPLETE | 對指定區間有完整 ingestion、必要 provider/emission、definition/availability、loss/clock 證據；明確列出契約假設且 acceptance 通過 | **唯一可能允許者**，仍須 §7 的 occurrence/catch-up gates；不是 COMPLETE 就必定 MISSED |
| PARTIAL | 已知可用區段與已知 gap/truncation；正向 records 仍可信 | 否 |
| UNKNOWN | 起點、啟用史、權限、provider emission 或 completeness 不可確認 | 否；本機 executionCoverage 屬此類 |

在目前來源能力下，可以設計 retained-record ingestion 的 COMPLETE，但**不得將它自動升格為 executionCoverage COMPLETE**。
只觀察到 disabled 是確定的缺口；對未知歷史範圍整體仍是 UNKNOWN，不憑空設定 gap 起始時間。

| 情況 | 模型處理 |
| --- | --- |
| oldest / newest | 是可見 retained endpoints；oldest 晚於窗口即無法重建前段；端點包住窗口也不證中間一直 enabled |
| EventRecordID | 是 channel record number；task-filtered IDs 跳號正常。只有 channel-wide cursor/retained-range 檢查才有診斷價值；連號無法偵測尚未寫入就丟棄的 events |
| clear / overwrite | System Microsoft-Windows-Eventlog 104、Security 1102（Security 自己的 clear）可提示，還要 bookmark validity、oldest/high-water、generation evidence；沒 clear event 不證沒 clear |
| RecordID reset/reuse | `(channel, RecordID)` 不跨 log epoch 唯一；不由 ID 大小推断 event time。無法驗證原 anchor 時開新 epoch、保留 gap |
| retention mode | Circular 有 overwrite 風險；Retain/full 可能停止新寫入；兩者都不是完整性保證。autoBackup 無法代替已驗證 archive read |
| provider/service restart | 結束可信 epoch；400/402、719、error diagnostics 只是可用正向訊號，無訊號不證連續 |
| Windows reboot / sleep | 保留 records 可續讀；availability 與 emission 重新評估。Reboot 不必表示已保存 record gap，也不等於 coverage 可無條件延續 |
| Dashboard restart | [bookmark](https://learn.microsoft.com/en-us/windows/win32/wes/bookmarking-events) 可恢復 retained records；transactional cursor + replay dedup，不用 first_seen/last_seen |
| Event Log unavailable / denied / query fail | 明確 error、UNKNOWN，保留既有正向 evidence；不可回傳 empty-success |
| clock/timezone jump | 同時保存 source UTC、ingestion UTC、monotonic elapsed/boot context；Kernel-General 1、Security 4616 或 411 提示後取消跨跳動 absence inference |
| newest 在 deadline 後 | 只是觀察進度，沒有 delivery completion SLA 時不構成 closed watermark |

未來 reader 可使用 [EvtSubscribeStrict](https://learn.microsoft.com/en-us/windows/win32/api/winevt/ne-winevt-evt_subscribe_flags) 偵測 missing bookmark/records，
處理 [ERROR_EVT_QUERY_RESULT_STALE](https://learn.microsoft.com/en-us/windows/win32/wes/windows-event-log-error-constants)（clear/rollover 使 query stale）。
Strict 是 **missing record detection，不是 execution emission completeness**。不要使用 tolerant-query-errors 來掩蓋不支援 filters。
本次只 research，沒有啟動 subscription 或實作 coverage store。

## 9. Sleep / shutdown / login / other sources

[supporting-metadata.json](evidence/stage-4-event/supporting-metadata.json) 保存本機其他 provider 的特定 ID/version schemas。
Live queries 有界：一般 7-day filter、最多 501 records，收據標示 limitReached；TaskScheduler/System query 為目前 retained records。
**7-day filter 不表示 log 真正保留七天。** System oldest 只到 `2026-09-20T19:01:47.1477451Z`，
LocalSessionManager 本次最舊為 `2026-09-21T05:54:24.0971415Z`；均以最後一次 inspection supportingBounds 為準。

| Evidence / sources | 本機結果 | Stage 4 necessity |
| --- | --- | --- |
| OS startup/shutdown：System Kernel-General 12/13；EventLog 6005/6006；abnormal Kernel-Power 41 / EventLog 6008 | 12、13、6005、6006 真實 XML 已讀；其餘查詢無匹配 | 若跨 off/reboot 推理則 mandatory availability boundary；positive execution display 可 optional |
| Sleep/resume：Kernel-Power 42/107；Power-Troubleshooter 1；Modern Standby 506/507 | metadata 已驗；查詢無匹配，不代表無睡眠 | 宣稱全程 awake 的 negative inference 必須有可靠證據；v1 不完整就 UNKNOWN |
| Scheduler service：400/402、System 同 provider errors、SCM 7036/7031/7034 | current Running；歷史相關查詢無匹配 | negative eligibility mandatory；SCM ID 需檢查 service identity，不能把任何 service event 當 Schedule |
| Log clear/time：Eventlog 104、Security 1102/4616、Kernel-General 1 / TaskScheduler 411 | 104/Kernel-General 1 無匹配；Security denied | 用於 invalidation，沒有事件不保證未發生；negative coverage mandatory 能力 |
| Interactive session：Security 4624/4634/4647，含 LogonType、TargetLogonId；LSM 21/23/24/25 | Security **UnauthorizedAccess**；LSM 雖 enabled/可讀但選定 IDs 無匹配 | 本機五 task 都 Interactive：若要證「應啟動」則 principal/session eligibility mandatory；v1 先 UNKNOWN，不新增 Security 特權需求 |
| Definition：Operational 106/140/141/142；Security 4698–4702 | Operational 無樣本、Security denied | definition lifecycle mandatory；完整 task XML 含敏感 Actions，不可任意持久化／輸出 |
| Maintenance/Diagnostic/Debug | Maintenance 800 有三個 samples，payload hc_stateid/LastRunDateTime，**沒有 task instance key**；其他兩 channel disabled | 不適合作這五 task execution coverage；v1 不值得收集 |

[Microsoft reboot troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/performance/troubleshoot-unexpected-reboots-system-event-logs)
支持 12/13/6005 的用途；41/6008 是異常後回報，不能精確定位所有斷電起點。
[4624](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4624) 的 Network/Batch/Service logon 不能當 Interactive；
[4634](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4634) 的 logon session correlation 也需 boot 範圍。
Disconnect、lock、logout 不等同；[Principal.LogonType](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype) 要求 interactive token 的既有 session。
[4698](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4698) 有 TaskContent，但受 audit policy/讀取權限限制；不能當預設人人可用的 definition audit。

現有 timeline（**event timestamps，非刻意測試**）：

```text
2026-09-20 19:44:34.0410358Z   EventLog 6006 (service stopped)
2026-09-20 19:44:41.2013928Z   Kernel-General 13 (OS shutdown)
2026-09-21 01:28:48.1367002Z   Kernel-General 12 (OS startup)
2026-09-21 01:29:31.9804609Z   EventLog 6005 (service started)
```

精確時間以 JSON 為準；此組 events 提供開關機邊界線索，**不證明 06:30 occurrence 的定義/登入/補跑歸屬**。
RecordID 與 timestamp 的排序並不完全一致；6005 RecordID 小於較早 timestamp 的 12。不可按 RecordID 推定所有時間排序。
v1 不值得重建所有 Windows sessions、battery/network/idle/modern-standby 狀態機；遇必要來源缺失直接 UNKNOWN。

## 10. StartWhenAvailable

**Verified：**五個 tasks 當下設定均 true。本機 metadata `114 (TaskName, InstanceId)` 明示 missed task launch。
[官方 StartWhenAvailable](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable) 說明 service queue 及預設 delay，
並限定 time-based/end-boundary/infinite-repeat 類型；沒有最大 catch-up latency SLA。
本機 recurring CalendarTrigger + UnifiedSchedulingEngine 的所有延期路徑仍需受控 acceptance，不能套用舊版 one-time task 經驗。

| 問題 | 結論 |
| --- | --- |
| 原 nominal 被錯過 | 114/153 是 missed-schedule 正向訊號，但未含原定時間；不能定位多日 backlog |
| catch-up queued | 325 可證 instance queued、324 可證等另一 instance；**沒有 catch-up reason**，不能據此稱補跑 |
| 最後啟動 | 若 114 與 100/200 同 GUID，可證 catch-up execution；本機無樣本 |
| 取消 | 沒有已驗證的 catch-up occurrence cancellation / abandonment schema；111/330 是 instance termination，不等於所有 pending nominal obligations 關閉 |
| 條件未滿仍 pending | blocking events 可作當時原因，缺 event/缺 run 不足以證 pending 或 ended |
| catch-up vs manual | 有 114 vs 110 可區分 source；沒有 source event 則 UNKNOWN |

**不發明 catch-up timeout，不把下一次 schedule 到來當作原補跑自動失效。**
Market 09:38 LastRunTime 與開機時間接近只是線索；沒有 114，不能稱已驗證補跑。

## 11. IgnoreNew

**Verified：**五個 tasks 當下均 IgnoreNew；[TASK_INSTANCES_POLICY](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_instances_policy)
定義既有 instance 執行時不啟動新 instance。Metadata 322 能明確記錄這類拒絕。

**Proposed：**有效 322 可直接建立 task-level `SUPPRESSED_BY_INSTANCE_POLICY` **launch-request evidence**，引用既有 TI。
但要標在「06:30 scheduled occurrence」，還需要被拒 request 的 source/nominal association；322 本身沒有這些欄位，
也可能是使用者再次 Run 被拒。Timestamp 接近 06:30 不補足這個缺口；沒有可靠 association 則 occurrence UNKNOWN。
不能用 existing TI 去匹配新 occurrence，不能從 LastRunTime、ExecutionTimeLimit 推 overlap，不能把 324 Queue 套成 IgnoreNew。
本機沒有 322 sample，五 task 都不能宣稱已觀察 suppression。

## 12. SQLite Stage 3 implications / architecture options

**Verified code：**V1 `job_run` 只允許 SUCCESS/FAILED，identity=`job_id + normalized lastRunAt`；
HistoryObserver 只在 collection 後持久化，沒有 event stream/cursor/definition history；first_seen/last_seen 是觀察 metadata。
History GET 另開 read-only connection，純 range SELECT；本次完全未開啟 operational DB 或呼叫會寫 observation 的 API。
Normalizer 的一般非零 result 可能包括 launch errors；不能把所有 legacy FAILED 視為實際 action completion。

| 選項 | Correctness / retention | Complexity / duplicates / restart | Privacy / migration / performance |
| --- | --- | --- | --- |
| A 每次即時 query | positive troubleshooting 可用；已覆寫不可恢復；absence 仍不充分 | 最低；每次重讀，無 durable cursor | 少落地但 raw XML 仍需 sanitize；無 migration；反覆掃 log 成本較高 |
| B 只存 correlation summary | 正向 timeline 可留，之後 schema修正/重算缺原 evidence；仍需 coverage | 中；GUID upsert，但孤立/順序異常難重建 | 少資料；需 migration/version；讀取快但 correctness debug 弱 |
| C relevant events 存 SQLite | 保存已收事件、防未來 retention loss；不能恢復從未記錄的事件 | 中高；需要 log epoch+RecordID dedup、late arrival、cursor/replay | 白名單 payload，禁止 whole XML dump；需 migration；bounded batches/index |
| D 新 observation/evidence tables | 可分開 record coverage、definition、attempts、occurrences、gap/evaluations | 高但可明確表達 UNKNOWN/部分證據與 restart | schema/version/retention policy 必須 review；volume 可控，不收全部 Windows logs |

**推薦未來採 C + D（設計提案，不是 Option B sufficient 結論）：**

```text
current scheduler snapshot + definition observations
Operational allowlisted events + source/ingestion coverage epochs
Stage 3 observed completed runs (保留既有語意)
        → execution evidence graph
        → occurrence matching / conservative evaluator
        → independent evaluation API/UI
```

最小資料契約（未建 table）：

- `event_evidence`：sourceOpaqueId、channel、logEpoch、recordId、provider/ID/version、sourceTime、ingestedAt、safe jobId、instance GUID、typed allowed results、presence/provenance。
- `ingestion_checkpoint / coverage_epoch`：anchor/bookmark、bounds、config/schema version、last successful ingestion、gap/error/clock reasons；cursor 與批次 events 同 transaction commit。
- `definition_observation`：task identity、safe settings fingerprint、observed interval、變更訊號；不把第一次看到的 StartBoundary 當歷史 validFrom。
- `execution_summary / occurrence_evidence_link`：derived summary 可重建、association kind、evidence refs、orphan/conflict flags；不直接重寫 legacy `job_run`。
- `occurrence_evaluation`：schedule version、nominal instant、coverage refs、decision/reason、revision；只有受支援直接 association 才影響 scheduled verdict。

Dedup 建議 `(sourceOpaqueId, channel, logEpoch, recordId)`，比對 payload fingerprint 防 ID reuse；
replay 允許 overlap，checkpoint 不可先於 evidence commit。Restart 無有效 anchor 時新 epoch + UNKNOWN，不把缺 records 填成 MISSED。
Task rename/recreate 跟 source event identity 分開；同 GUID 不能跨不明 host 搬移。Legacy timestamp row 与 event instance **只可候選連結**，有歧義則保留兩種來源、不自動計成兩次或硬 merge。
新 migration 要追加 V2+，不能改 V1；本次未改 schema，也未選擇實際儲存 policy。

## 13. Privacy / security

Helper 只用 Get-WinEvent、wevtutil **gl**、Get-Service、Get/Export-ScheduledTask/Get-ScheduledTaskInfo；
Windows XML 在記憶體處理，寫出的 live XML 每個 payload leaf 都改為 equality token，System computer/SID/process/correlation 同樣去識別化。
保留 provider、channel、ID/version、level、time、RecordID、field names/presence；本次 task 名稱限 repository 已公開五個 keys。
Provider **template** 的 `%1` 等不是實際資料。Redacted XML 保留結構，但 GUID/numeric token 不再符合原 datatype，**不是 raw replay fixture**。

| 欄位 | Production collector 建議 | Frontend |
| --- | --- | --- |
| provider/channel/ID/version/level、UTC、recordId/logEpoch、result numeric | 本機安全白名單可保存；結果碼需明示來源 | 可以透過明確 DTO 呈現 |
| task full path/name | runtime exact mapping；只保存已配置 identity，任意其他 task 不收 | 已配置 safe display name/jobId，不顯示全機 task inventory |
| InstanceId/TaskInstanceId、ActivityID | 按需要本機保存；不推定 GUID 含秘密，但它們是可關聯 identifiers | 預設 opaque evidence ID；不需公開所有 raw IDs |
| ActionName/Path、exe/script、arguments/command line、TaskContent、message/free text、ErrorDescription | runtime 解碼/比對；原文預設不持久化。需要 action equality 時用 install-scoped keyed token；不是裸 hash 低熵 path | 不輸出原文 |
| username/SID/UserContext、session/user/network identity、host name/IP | 最小 runtime principal matching；只留 presence/eligibility 或安裝範圍 keyed token；避免收集無關帳號 | 不輸出 |
| ProcessID/EnginePID、LogonId | 如有明確 diagnostic 需求才存 boot-scoped runtime relation；非永久 identity | 預設不輸出 |
| secrets/tokens/passwords、whole raw XML/evtx | 不存、不記 log、不 commit | 絕不輸出 |

這次 commit 的 equality tokens 只在一次 helper run 內一致，沒有 account dictionary；不是可跨機器追蹤的 username hash。
安全邊界是目前受信任本機 OS/log；並非防本機 administrator 竄改的 cryptographic audit。
權限不足直接呈現 unavailable，不自行提權、改 ACL 或啟用 Security auditing。

## 14. Current five tasks / actual timelines

範圍來自 `config/application.example.yml`，未宣稱是已解析所有 overrides 的執行中 Dashboard 設定。
五個 root-path task 都存在，definitions 在研究兩次讀取一致，且與上一份 inventory 指紋一致（見 validation）。

| 完整 TaskName（TaskPath 都是根目錄） | LastRunTime（+08:00）/ result | Operational query / lifecycle |
| --- | --- | --- |
| InsiderTracker-Market | 09-21 09:38:37 / 0 | 0 events；無 source、instance、action timeline |
| InsiderTracker-SEC | 09-21 11:15:01 / 0 | 同上；接近 schedule 不證 107 |
| InsiderTracker-SyncImport | 09-21 10:40:01 / 1 | 同上；result failure 保留，不轉 MISSED |
| AIStockHunter-UnexplainedVolume-HealthCheck | 09-14 14:19:11 / 0；目前 Disabled | 同上；不對停用期間創造 active MISSED |
| AIStockHunter-Accumulation-Weekly-Check | 09-18 22:00:00 / 1 | 同上；無 retry instance attribution |

**每一 task 的相同限制：** Operational oldest/newest unknown；無法證明涵蓋其 LastRunTime 或 nominal time；
當時 enabled 狀態 unknown；是否 overwritten unknown；目前僅能說查不到資料。沒有可建立的 execution lifecycle timeline，沒有假造五條時間線。
System reboot 與 Maintenance 800 timeline 已另列，不能借用作五 task correlation。

## 15. 與前次 Stage 4 gaps 對照

| 舊研究缺口 | 分類 | 這次進展 / 剩餘限制 |
| --- | --- | --- |
| trigger provenance | Partially solved | 107/110/114 等提供 source class + GUID；沒有 trigger/nominal key，本機無樣本 |
| instance lifecycle key | Solved by Event Log（schema capability） | 100/102 與 200/201 等有 GUID direct link；live Operational chain 尚未驗收 |
| absence evidence | Still unsolved | 沒事件不代表没 execution；emission/loss/watermark 契約缺口 |
| observation coverage | Partially solved | retained bounds/bookmarks/errors 可管理 record coverage；不等於 semantic execution coverage |
| manual ambiguity | Partially solved | 有 source event 可辨；本機無資料。舊 TIME_WINDOW demand satisfaction 提案取消 |
| retry ambiguity | Partially solved | 126/127 證 restart intent；缺 parent/child/attempt index，跨 occurrence 仍不明 |
| IgnoreNew | Partially solved | 322 證 request ignored + existing GUID；新 request/source/nominal 不明 |
| StartWhenAvailable | Partially solved | 114 證 catch-up launch；pending/cancel/nominal backlog/上限仍 unknown |
| machine off/sleep | Partially solved | positive boundaries 可讀；缺失/覆写/modern standby 不可當完整 timeline |
| interactive session | Not worth solving in v1（缺能力即 UNKNOWN） | Security denied、LSM window 有限；需 principal-specific session/boot 關聯 |
| definition lifecycle | Partially solved | 106/140/141/142 可 invalidation；無 full definition history；Security audit 非預設可用 |
| non-atomic snapshot | Partially solved | events 可獨立具 GUID，但 snapshot+events+definition 仍非 transaction；要 capture interval/conflict handling |

## 16. A / B / C recommendation / proposed next Stage

**唯一架構 sufficiency 選擇：Option C。**
A 沒有完整 occurrence/absence contract；B 可以是未來資料管線，但不能把多個不完整來源相加就稱充分。
即使 Manager 日後核准啟用 logging，也只開始新的 evidence epoch，不回補現在缺失的 Operational events。
其他 strategy（外部 heartbeat、deadline alert、runner receipts）應明確定義成「deadline 未收到 receipt」，不冒稱 Windows 沒有啟動；
涉及 runner/Stage 5 的選擇需 Manager 另立範圍，本次不做。

建議在原 4A–4D 前新增 **4R Evidence Readiness / Controlled Research**。以下均是 proposal，尚未開始：

| Stage | Goal / scope | Dependencies | Gate / done when | Self-QA |
| --- | --- | --- | --- | --- |
| 4R readiness | Manager 決定保守 v1／是否在另行授權環境取得真實 execution XML | 另行授權 logging/隔離測試，或既有有效樣本來源 | 107 vs 110、114、322、201 versions、source→instance XML 與缺口實證；修正本次 Gate 3 | 不改五個原 tasks；不為 acceptance 偷換 MISSED 定義 |
| 4A evidence | read-only positive event collection + source availability + durable ingest contract | 4R/Manager scope；schema/privacy review | 讀不到/停用/過期 bookmark 明確 UNKNOWN；transactional replay、dedup、sanitize | crash between evidence/cursor、log generation、unknown version、orphan/late/duplicate events |
| 4B domain | definition/occurrences、直接匹配、保守 evaluation | 4A accepted contract | manual 不洗掉 scheduled verdict；absence 未充分不 MISSED | catch-up backlog、suppressed manual request、retry attribution、clock jump、definition recreation |
| 4C API/UI | separate current、execution、occurrence、coverage reason | domain review | missed count 只計合格 verdict；history neutral empty 不變 | no-data vs no-run、unknown/disabled、legacy failures |
| 4D controlled acceptance | 所承諾的 Windows行為與 UI 端到端 | Manager 另行授權 test tasks/環境 | 以真實 XML / evidence records 驗證；若沒有可信 negative contract，MISSED 仍不 release | normal/demand/queued/IgnoreNew/catch-up、missing records、permission、restart、retention |

## 17. Commands / validation / Research Gate

已執行：git checkout main、fetch origin、pull --ff-only origin main、baseline ancestry/clean-tree checks、建立指定分支；
Get-WinEvent ListLog/ListProvider/FilterXPath、wevtutil gl/gli、EventLogSession.GetLogInformation、Get-Service、唯讀 task XML/hash，
Microsoft 官方文件查證、helper PowerShell AST、PS7/5.1 實際執行及 evidence compare、XML/JSON/privacy/diff 驗證。
具體收據：[validation.json](evidence/stage-4-event/validation.json)。
未重跑 Java/frontend regression：production code/test/schema 均未改；也未啟動 app 或開 operational SQLite。

重現（repository root；先 review helper；重新執行會更新指定 evidence files）：

```powershell
& ./docs/evidence/stage-4-event/collect-event-research.ps1
New-Item -ItemType Directory -Force target/stage-4-event-ps51
powershell.exe -NoProfile -NonInteractive -Command "& ([scriptblock]::Create((Get-Content 'docs/evidence/stage-4-event/collect-event-research.ps1' -Raw))) -OutputDirectory 'target/stage-4-event-ps51'"
& ./docs/evidence/stage-4-event/validate-research.ps1
git diff --check b33961338dad2d04e5f2bb5df60955cae2b9b9da
git diff --exit-code b33961338dad2d04e5f2bb5df60955cae2b9b9da -- PLAN.md README.md src tests config index.html dashboard.mjs
```

| # | Required Research Gate | Result / evidence |
| --- | --- | --- |
| 1 | Operational availability/config/retention | PASS：disabled、Circular、10 MiB、null metrics/access limits 明示 |
| 2 | Event IDs researched | PASS：本機 152 definitions + Microsoft reference；重要 payload/versions/limits 列明 |
| 3 | actual event XML / fields inspected | **PARTIAL → strict FAILED**：System、TaskScheduler Maintenance 800 actual XML 已讀；**Operational execution XML unavailable**，不能用 template 取代 |
| 4 | correlation documented | PASS：GUID execution key、existing-vs-new instance、缺 occurrence ID、heuristic 邊界 |
| 5 | scheduled/manual evaluated | PASS：能力分三級，五 task live attribution unknown |
| 6 | negative requirements | PASS：no event 非 MISSED、emission/ingest/definition/conditions/catch-up gates |
| 7 | coverage model | PASS：COMPLETE/PARTIAL/UNKNOWN，record vs execution 分離 |
| 8 | StartWhenAvailable | PASS：114 positive；pending/nominal/timeout 未解 |
| 9 | IgnoreNew | PASS：322 positive request suppression；不硬配 occurrence |
| 10 | machine/session | PASS：sources/permissions/retention/mandatory vs optional/v1 UNKNOWN |
| 11 | Stage 3 implications | PASS：比較 A–D 儲存；C+D proposal，不改 V1 |
| 12 | privacy | PASS：allowlist + redaction、scan、raw/runtime/frontend 分界 |
| 13 | five tasks sampled where exists | PASS：5 exact queries，0 events 如實記錄，無假造 lifecycle |
| 14 | previous gaps mapped | PASS：§15，manual matching 舊提案已指出不採用 |
| 15 | architecture recommendation | PASS：Option C，不混同 hybrid positive storage 與 sufficiency |
| 16 | no task mutation | PASS：唯讀命令 + definition hashes；hash 相同只是兩次觀察，非全程外部 mutation audit |
| 17 | no log mutation | PASS：只有 read commands；前後 config hash 相同；未執行 enable/clear/resize/retention |
| 18 | no production implementation | PASS：只新增本報告與 research evidence/helper |

**Overall：FAILED，僅因缺少必要 Operational execution XML 實機證據而不能宣稱全部 Gate 通過。**
不以 Windows 關閉 log 當研究程式錯誤，不越權改 log。結果可供 Manager 決策；本次完整交付調查與未解項，不作 production release claim。

## 18. Known unknowns / handoff

- Operational 何時停用、有無先前啟用/清除/覆寫，無法從當前 null metrics 判斷。
- 本機 107/110/114/322 的 actual ActivityID、RelatedActivityID、event emission frequency/order、GUID equality 與 Unified engine 邊界未驗證。
- Catch-up pending/cancel/原 nominal association、retry parent/child、suppressed demand vs scheduled request attribution 未解。
- No-loss execution logging、delivery deadline/watermark、歷史 principal/session/definition continuity 沒有充分證據。
- PS7/5.1 reads 是同一個非 elevated 身分，不是 fresh-user/fresh-machine 權限 acceptance。
- 沒有睡眠、關機、登入切換、清除、覆寫或故意失敗的受控實驗；未承諾透過一般事件歷史完全重建這些情境。

交付：本文件、read-only collection/validation helpers、inspection/provider/supporting metadata、validation receipt。
只提交研究分支並 push；**不 merge main，不開始 4A 或 Stage 5，等待 Manager Review**。
