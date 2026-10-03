# Dashboard Localization / I18N V1 — implementation evidence

## Goal / scope

將目前九個 Dashboard 產品區域的固定介面文字接上共享 zh-TW / en 語系層，預設繁體中文。範圍為 Overview、Projects viewer chrome、Automations、US Stocks、TW Stocks、Performance、Reports、Data & Evidence、Settings，以及表單、狀態、明細、aria-label、placeholder 與大型 Markdown 提示。

本 Stage 為 implementation only。基準與直接 parent 為 `c269fe720678a045bef9bf328df84bd4dd32b211`；branch 為 `implement/dashboard-i18n-v1`。candidate SHA / draft PR 與完整可重播紀錄由正式 handoff packet 記錄，避免文件自我指涉。

## Dependencies / seed verification

共享治理沿用 `docs/PERSONAL-PROJECT-GOVERNANCE.md`，重用既有管理與 Sol Works。獨立 fetch / 核對 `origin/chore/i18n-seed` = `15e9c5c807ffc11e9039c6c60a68c4373f350a58`；只取四檔作參考，沒有 ZIP、merge、rebase 或整段 cherry-pick。

| Seed file | Verified Git blob |
| --- | --- |
| README.md | 6a9e6d52f94f24960c7ba5de538360abc3bf55e1 |
| en.mjs | 56ddfb34f150d58c73eca1fa6556806b7ba8b038 |
| i18n-contract.json | 3f7dec9431b021ba55d483c83832a6aa6e6e9091 |
| zh-TW.mjs | 5a34947485eea1cfc3af7ebf06e48a72ba3a914a |

## Implementation / semantics

- `ui/i18n.mjs` 提供 getLocale / setLocale / t / message / codeText / subscribe / static translations。兩份 flat locale 模組各 1,066 keys；採 flat 路徑以沿用既有 Maven `ui/*.mjs` whitelist，不需 backend product 或 POM 變更。
- preference 僅存 browser localStorage `local-dashboard.locale.v1`。缺值、無效值預設 zh-TW；get/set exception 保持 in-memory zh-TW fallback，啟動不中斷。document.lang 與 Settings selector 同步。
- 固定文字使用 explicit key descriptor；named interpolation 使用 textContent / allowlisted text attributes。沒有 reverse-lookup、translation HTML 或 external i18n dependency。text / attribute bindings 分開；更新原 text node 以保留附加 time、details、controls。清除的明細 binding 不會復活。
- 語系切換只更新既有節點與 held values；不呼叫 navigation/show/load/refresh，不清掉 normalized data、filters、pagination、focus、native details 或 open dialogs。Performance 的 summary pending 使用 explicit flag，避免以 translated DOM text 控制 source reread；只在該 summary request settlement 清除。
- Known status / reason 顯示人類說明與 exact raw code；unknown future codes 保持原值。Evidence privacy formatter 以 explicit identity/code kind 決定，與翻譯後 label 無關。null / 0、UNKNOWN / NO、PARTIAL / SUCCESS、business FAILED / transport ERROR 的界線不變。
- report Markdown、公司名、AI reasons/risks、Projects canonical source、配置的 job display names / descriptions / dependency notes、IDs、hashes、timestamps 與 provenance 不翻譯。版本化 job metadata 預設資料保留原樣；en 下仍可見其中原有中文。既有本地日期格式與 timezone 規則保留。
- `ui/us-stocks.mjs` 是只負責裝配與 subpage state 的 orchestration；source parser `ui/project-design.mjs` 不含本次 chrome 變更。16 個 audited parser/identity/loader functions 與基準內容一致。
- root `AGENTS.md` 記錄持久 i18n 工程規則；僅本 Stage evidence doc 新增，沒有 Design Sync。

## Gate / done when / Self-QA

完成 shared layer、雙語 parity、預設/持久化/exception、安全 interpolation、九區 fixed chrome、zero-refetch、state/dialog/focus 保留、viewport/accessibility、package resources 與 installed protection；推送 exact candidate 並保持 worktree clean 後交管理獨立審查。這些是 implementation Gate，不代表 Manager FINAL PASS、owner acceptance、merge 或 deployment。

| Check | Result / evidence |
| --- | --- |
| Targeted i18n | 30 pass / 0 fail / 0 skip；之後新增 structured TW field coverage 與最後 parser-label 補齊，完整 ordinary 含 31 個新增 tests |
| Relevant browser regressions | 全部已於 ordinary suite 驗證；保留 source identity、privacy、race、pagination、keyboard assertions，既有 harness 固定 en |
| Full ordinary Node/browser | 225 tests：221 pass / 0 fail / 4 existing opt-in live skips；沒有新增 skip |
| Maven clean verify | PASS；273 tests / 0 failures / 0 errors / 0 skip；package resources / real isolated Spring HTTP / Projects UI smoke PASS |
| Generator --check | PASS；canonical Project Design 33 features |
| git diff --check | PASS；Windows existing CRLF normalization warning 不屬 whitespace failure |
| Source/installed protection | PASS；before=after exact；112 TW runtime assets、705 source files、8 formal opaque files、225 installed image files、6763 home files、2 shortcuts、Task definitions/config/receipts/history 保持原樣，source business reads = 0 |

Browser tests 包括：zh-TW → en → zh-TW、Settings 真實 selector / reload、invalid / get/set exception、zero extra API/source requests、Overview recent time / Runner details children、History cell aria / drawer Escape、未儲存 name/description/dependency/order/hidden 與 focus / 0 PUT、TW date / candidate dialog、US ticker / subpages / signal/SEC dialogs、Reports paging/date/revision/Markdown、TW daily/weekly subpage/paging/detail、Performance filter/horizon/page/snapshot/detail、Evidence completed cache / private ID / null / unknown code。fetch-pending 與 Response.json body-pending 都以 controlled synthetic gate 證明完成時使用最新語系；Summary settled / List pending 及 Summary still pending 的 replacement read count 分別維持 1 / 2。

首次 Maven 保留 `maven-first.log` 與 `maven-first-bounded-failure.txt`：既有 `BoundedSourceProcessTest.interruptedReadAlsoKillsConfirmedDescendantAndParent` 在 PID 檔已存在但尚未寫入內容時讀到空字串，NumberFormatException。fixture 使用 Files.writeString，測試只等待 Files.exists，可產生該競態；相同 code/environment 完整 clean verify 重跑全部通過。沒有修改、跳過或弱化該測試。

視覺與 accessibility：兩語系 × 1280/375/320 × 九區，另四種 open dialog；78 PNG，檢查無整頁 overflow、dialog fits viewport、wrap、navigation/buttons、focus。Sol 檢視 representative 桌面與手機畫面；管理的 independent exact-SHA visual review 仍待正式 handoff。

Private evidence 根目錄：`F:\AI workspace\local-dashboard-i18n-operations`；最終 screenshots 在 `F:\AI workspace\local-dashboard-i18n-v1\.tools\i18n\visual`。保留 ordinary-final.log、maven-final.log、targeted-final.log、coverage-shell-final.log、parser-and-loader-parity.json、visual-manifest.json、translation-resources.json、protection-before/after/comparison.json 與 final-handoff-packet.json。所有 UI APIs 為 synthetic fixtures / ephemeral loopback；沒有正式 Taiwan/Insider business read 或 production HTTP。

## Boundaries / remaining review

Backend product / source/query/business logic / config 無變更。主要 main 仍在基準且 clean；33 IDs/status counts 仍為 DONE 19、PARTIAL 8、BACKEND_READY 3、NOT_STARTED 2、BLOCKED 1，其餘 0。installed runtime / external home / application.yml / DB / Runner / shortcuts / Scheduler / Google Docs 未被本 Stage 修改。沒有 production start/stop、Design Sync、merge、deployment、Taiwan History / Range 或 Taiwan Performance。

此交付狀態為 **READY_FOR_MANAGER_REVIEW — DASHBOARD LOCALIZATION / I18N V1 IMPLEMENTATION**，不是最終產品核准。
