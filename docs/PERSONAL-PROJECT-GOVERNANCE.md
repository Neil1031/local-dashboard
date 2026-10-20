# Personal Project Governance

Status: **Active cross-project governance for verified Neil1031 personal projects — V2 roles with lightweight delivery, 2026-10-20**

This document records durable workflow, documentation, review, Git, deployment, and evidence rules that should not exist only in chat history. It is a **cross-project default**, not a replacement for each repository's product design or source contract.

Priority when instructions conflict:

1. Explicit current owner instruction and GPT Manager direction within owner-authorized scope.
2. Intentional repository-specific rules such as `AGENTS.md`, a repository's canonical engineering design, or an approved source contract.
3. This cross-project governance document.
4. Tool / framework defaults.

A repository-specific override should be deliberate and documented. Do not silently drift from this document. Orchestrator instructions coordinate execution inside existing authority; they do not grant a new goal, override source contracts or safety boundaries, or replace GPT's final Stage acceptance.

The owner's 2026-10-19 V2 decision intentionally supersedes older two-Work-only / Luna-only topology, role routing and lifecycle wording on active instruction surfaces. It preserves section 0's company exclusion, section 3.1, independent review, evidence/Git traceability and section 7.4. Historical “Manager” means GPT Manager when deciding direction/acceptance, not Orchestrator authority to redefine scope.

**2026-10-20 Owner override — lightweight delivery:** Sol implements, tests and fixes; Management performs independent CODE REVIEW, not a second QA campaign. Ordinary delivery needs only the Git SHA/PR, tests run with results, and review conclusion, usually a few PR lines. Once the reviewed/tested Git version and intended target are confirmed, complete authorized merge/deployment with a recoverable previous version and Sol's basic startup/function check. Do not require routine raw/hash inventories, receipts, screenshots, evidence bundles, repeated backups or another GPT deployment approval. This overrides conflicting older routine evidence/retest/closeout requirements in active instructions or skill templates; specific real risks still receive targeted handling. Sections 0, source/contracts/rights/PIT limits, truthful UNKNOWN/PARTIAL and actual HOLD/spent/STOP boundaries remain binding. GPT retains direction and one Final at actual Stage completion.

---

## 0. Applicability and highest-priority scope boundary

Notice version: `global-governance-neil1031-v1` (owner decision, 2026-10-08).

Apply the automatic execution policy only after verifying all three facts:

1. The actual GitHub repository owner is `Neil1031`, verified from live repository metadata and the checkout's remote identity.
2. The target belongs to that personal project: its stock system, Dashboard, other personal project, or the local DB/runtime/scheduler directly used by it.
3. The operation cannot affect company systems or company data. Inspect project purpose, target paths and dependency/deployment connections; folder name, cwd and ownership alone are insufficient.

For a fork, verify its parent/source provenance. Strictly exclude company projects, company Git repositories, DBs, servers, deployment environments, local company copies, company-derived forks (unless the owner explicitly authorizes that fork), and repositories owned by anyone other than `Neil1031`. Company projects retain their independent workflows and authorization requirements. If identity, provenance or isolation cannot be proven, do not apply automatic modification/deployment/DB updates; investigate the uncertainty and continue unrelated verified work.

This scope boundary has priority over every other rule in this document. A shared local entrypoint or skill does not extend it to company work or another owner. Within the verified scope, the current owner instruction supersedes older requirements for another authorization at each environment, merge, deployment or DB write in the same approved work. Product contracts, data semantics, independent review and restoration safeguards remain in force.

This governance adoption changes active governance/operation documents only. It does not launch all products, deploy all installations, update all DBs, merge unrelated/unapproved product PRs, or authorize a new feature/goal. Preserve historical Stage/evidence and frozen backup bytes; update active rules and verify their actual Git and local readback.

---

## 1. Project execution model

### 1.1 Default visible Work topology

For a managed personal software project, distinguish these roles:

- GPT Manager / Manager Chat: highest direction and final Stage acceptance.
- Orchestrator Work: an existing project or cross-project coordination Work, for example `[Stock] 跨專案總管理` where assigned.
- `[Project] 管理與初審`: Independent Reviewer.
- `[Project] Sol 實作`: Implementation Owner.

Reuse the existing Orchestrator and persistent Reviewer/Sol Works across Stages. One authorized Orchestrator may coordinate several projects; this does not require a new Orchestrator per project. The previous “one Manager Chat + exactly two visible Works” ceiling is superseded, while reuse of the existing Reviewer/Sol pair remains the default. Do not create a new Work for every Stage or replace the implementation Work with a coordination-only Work.

The existing default model for Reviewer/Sol Works is GPT-6.1 Sol with High reasoning unless explicitly configured otherwise. Actual availability and assignment determine internal worker choice; do not silently relabel a worker's model.

Sol may dispatch bounded internal subagents, including Luna or other available agents, under section 1.4. They are not new persistent `[Project] Luna Work` / agent Works or approval layers. V2 authorizes this internal delegation, not arbitrary additional management tiers or unrelated orchestration trees. Do not manufacture work or Works to fill a topology.

Use another model such as Astra for a concrete escalation need, such as major architecture disagreement, high-risk operations, unresolved root cause, conflicting evidence or focused independent review. Model choice does not transfer decision authority or relax safety limits. Use Codex/Sol for authorized implementation; do not switch Claude accounts or models to circumvent a quota or restriction.

### 1.2 Responsibilities

**GPT Manager / Manager Chat — highest decision layer**

Owns roadmap, priority, Stage goal, scope/exclusions, architecture direction, major exceptions, Gate / Done when, final Stage review/acceptance and next-Stage authority. Authorizing a goal covers its necessary merge / deployment / DB operations under section 3.1; no repeated permission is needed for the same approved work. GPT does not manage daily micro-tasks, repeatedly chase routine reviews or approve each deployment. Submit one Final when a real Stage is complete; normal in-scope iterations continue through Sol, code review and deployment.

**Orchestrator Work — coordination**

- Track the existing lower-level Works and actively assign/resume work within the approved boundary.
- Arrange Reviewer Preflight, Sol implementation, Independent Review, necessary in-scope fixes and re-review.
- Turn approved direction plus Preflight constraints into a bounded execution assignment; retain an actual Sol implementation owner.
- Consolidate status, Gate results, blockers, major deviations and next steps for GPT, with exact references.
- Do not redo full code review, replace implementation or independent review, or micro-route Sol's internal sub-tasks.
- Coordinate using actual available tools and event/wait facilities; do not claim unlimited automatic wakeups, guaranteed continuous execution or future monitoring without a supported and authorized mechanism.

Orchestrator may progress necessary fixes/re-review without GPT approving every small task. It cannot grant new scope, merge/deploy authority beyond the approved goal, override HOLD/STOP or give final Stage acceptance.

**Management Work — Independent Reviewer / Preflight**

Before implementation, perform only a concise preflight: verify live baseline and actual state against the assignment, identify contract/governance conflicts, required source/DB operations and explicit read limits, and protection boundaries. Return the Gate/constraints to Orchestrator for dispatch. Without a real conflict/blocker, do not redesign the Stage or expand it into a long new specification.

After Sol's `HANDOFF_DELIVERED`, independently CODE REVIEW the exact diff against requirements/contracts and inspect whether the reported tests cover the change. Review the source itself; Self-QA PASS is not a substitute for independent judgment. By default, do not rerun tests, reconstruct raw evidence, demand hash/receipt/screenshot bundles or conduct a second installed QA campaign. If a concrete bug, missing case or contradiction is found, ask Sol to add the targeted test/fix, then re-review the affected diff and result. Additional independent reproduction is exceptional and limited to a specific unresolved concern, not a routine Gate.

Return the concise review conclusion/findings through Orchestrator. `READY_FOR_MANAGER_REVIEW` remains a handoff marker, not a requirement for GPT to review each PR or deployment. Management retains Owner Doc responsibilities under section 7.4; those role limits are unchanged. Worker self-check/Sol Self-QA never constitutes independent code-review PASS.

**Sol Implementation Work — Implementation Owner**

Sol owns `/plan`, actual workspace inspection, bounded implementation planning, core work, integration, debugging, tests/Self-QA, internal worker dispatch/result verification, fixes to review findings and the final integrated candidate SHA/tree. Actively investigate and resolve implementation problems within scope. All delegated outputs remain Sol's integration and verification responsibility. Sol runs the relevant tests and necessary unit tests/build, fixes failures, and performs the basic startup and changed-function check after installation where applicable. A documentation-only change needs document/diff checks, not product test campaigns.

Sol decides useful task decomposition, worker choice and non-overlapping write ownership under section 1.4; GPT and Orchestrator do not micro-manage those tasks. Produce the proportional `HANDOFF_DELIVERED` packet through Orchestrator for IR. For Owner Doc changes, submit `DOC_CHANGE_REQUEST` under section 7.4; Sol does not edit the Google Doc.

### 1.3 Handoff marker

Use `HANDOFF_DELIVERED` for a completed handoff. For an ordinary change, record only:

- Git SHA or PR identifying the implementation.
- Tests actually run and their results (or an honest not-run / not-applicable reason).
- Independent code-review conclusion or pending review/findings.

At each Stage completion, Sol and Reviewer each add a short account of what they did, their actual start/finish timestamps and elapsed time, plus their test or code-review result, to the normal PR/handoff. Orchestrator summarizes Stage outputs, Sol implementation/testing time, Reviewer review time, whole-Stage wall-clock time and completion/deployment status for Owner. Separate waiting/handoff time when recorded; do not add overlapping parallel durations and call that total elapsed time. Missing timestamps or duration are `UNKNOWN`, never estimated. Do not create JSON receipts, screenshots, a measurement project or extra proof from notification-only roles.

A few PR lines are sufficient. Mention a real blocker, limitation or necessary existing source reference when relevant; do not create a separate evidence packet, multiple JSON reports, full workspace inventory or mandatory tree/hash manifest. Delivery, review, deployment and Stage acceptance remain distinct truthful states. Orchestrator consolidates a real Stage completion for one GPT Final.

### 1.4 Sol internal subagents / bounded tasks

Sol may use Luna or other available internal agents for independently bounded code, tests, documentation, discovery and verification. Start with roughly 2–3 subagents when parallel work is useful; this is not a quota or a requirement to create agents. A small or single-document task may be done directly. Do not split work just to fill slots or reduce verification quality.

Specify allowed paths/actions, exact inputs/baseline and interface, expected output, verification criteria, protection boundaries and STOP conditions. Give each changed file one writer at a time, or serialize explicit ownership transfers; avoid concurrent same-file edits. Sol integrates and verifies every result. GPT/Orchestrator do not micro-dispatch these internal tasks.

Luna remains the preferred worker for low-ambiguity, machine-verifiable, easily reversible tasks such as the following. Other agents may handle bounded implementation/investigation appropriate to their capabilities, but cannot independently redefine architecture, contracts, semantics, safety, scope or acceptance. Delegation adds no authority or approval layer.

**Discovery**

- repo inventory;
- affected-path inventory;
- call-site inventory;
- existing pattern search;
- reference implementation search.

**Mechanical implementation**

- fixtures;
- repetitive tests;
- established-pattern boilerplate;
- simple config wiring;
- schema/example synchronization against an already approved contract, without schema/migration design;
- explicitly specified status/document updates.

**Verification and Git / deployment delegation**

Workers may run relevant tests, builds, diff checks or version checks assigned by Sol. Hashes, manifests, byte parity or installed identity inventories are optional tools for a concrete mismatch or risk, not routine deliverables or default acceptance Gates.

For authorized merge/deployment, give a worker the reviewed/tested Git version, correct target and applicable protection/rollback limits. Keep one recoverable previous version; reuse an adequate existing backup. Use sections 2.1 / 3.1 / 15–16, without inventing frozen-input forms, repeated backups or a separate closeout-review campaign. Delegation does not grant new production/source permissions; explicit read limits and actual safety boundaries still apply.

**Luna must not independently own these decisions**

- architecture;
- source contract design;
- source-of-truth / authority;
- data semantics;
- null / `UNKNOWN` / `PARTIAL` semantics;
- financial interpretation;
- date / trading-session / market-rule decisions;
- schema / migration design;
- transaction / concurrency design;
- security/privacy boundary;
- complex root cause;
- ambiguous requirements;
- scope expansion;
- acceptance decisions.

**Delegated worker STOP / escalation**

Every delegated worker, including Luna, must stop the affected task and report to Sol when it encounters:

- unexpected diff/state;
- main moved;
- test failure;
- identity/hash mismatch;
- scope expansion;
- ambiguous specification;
- unexpected production state;
- destructive action outside explicit authorization;
- inability to prove correctness/safety under current rules.

Report the observed state, actions already taken, evidence and unresolved issue. Do not independently expand research, architecture or modification scope, repair outside the assignment, or retry destructive operations. Sol investigates, safely fixes/reassigns within existing authority, or escalates an actual scope/design/authorization decision through Orchestrator with Reviewer evidence to GPT as needed. This worker STOP rule limits delegated autonomy; Sol retains the existing investigate → attempt → verify → adapt → continue responsibility. Necessary dangerous operations remain stopped while a genuine safety/authority blocker is unresolved.

**Purpose**

Reduce Sol's time spent on suitable bounded discovery, edits, tests and builds; do not create evidence-production work merely to delegate it. Sol remains accountable for the integrated result. Do not add an approval layer to achieve this.

### 1.5 Independent code review / testing ownership

Sol owns testing and necessary unit tests/builds, debugging and fixes. Reviewer owns independent CODE REVIEW of the exact diff, requirement/contract compliance and adequacy of the reported tests. The default is review of code and test coverage, not re-execution or proof-bundle production. Retain useful existing test output; the ordinary handoff is section 1.3's brief Git/tests/review summary.

A concrete concern justifies a targeted request to Sol: identify the suspected problem or missing case, request only the relevant test/fix, and review that change/result. Do not launch a parallel full QA campaign. DB consistency, security and financial-source authenticity checks are required only as the actual change needs them; a missing rights/PIT/source proof stays UNKNOWN or blocked. This simplification never upgrades an unverified claim, invents test results or consumes a spent source allowance.

### 1.6 Context, coordination and efficiency

Prefer incremental handoffs with the Git SHA/PR and relevant existing Issue/test/source references. Tree/hash references are optional when they resolve a concrete identity question. Re-read necessary changed instructions/diffs and affected evidence; do not unconditionally reload all documents or history. Revalidate identities, actual authorization and relevant safety boundaries when they may have changed.

The owner authorized the following operational defaults on 2026-10-19, within section 0 and the current task's authority:

- **Wait for known tasks:** prefer a supported native event-aware wait with an explicit target/host and the latest cursor. Use at most 30,000 ms per request, shortened by the remaining deadline or the tool's documented limit; a completed event may return earlier. Confirm the matching task/run/turn terminal result, then stop waiting. A wait timeout is not task failure. Preserve ERROR, STOP, blockers and new-input handling. If native waiting is unavailable, use a supported bounded status check and report the limitation; do not simulate event waiting with a fixed sleep or short-interval busy polling.
- **Select useful tool output:** choose the fields or relevant source ranges needed for the decision before returning large results to the model. Retain errors, findings, authorization/STOP, UNKNOWN/PARTIAL and evidence identity where relevant. Keep the permitted original evidence traceable by path/ref/hash or receipt, and read the necessary original or additional ranges when the summary is insufficient. No output limit may silently hide a finding or required instruction; an initial required instruction read remains required.
- **Reuse scripts, results and reports:** prefer existing suitable tools, test output and concise PR/change summaries under sections 1.3–1.5. Reuse an existing report only if useful; do not require a report, machine-readable evidence or a new reporting system for ordinary work. When a table is needed, derive it from actual existing results; the model adds changed conclusions, findings, review status and limits instead of rewriting unchanged facts or building a new measurement/reporting stack by default. Give a recipient the necessary baseline when it is not already available. Do not add metadata-query or delta-read rounds merely to shorten text, assume a new context knows another Work's history, or force prompt compression / incremental protocols whose total benefit has not been established.

Track actual execution/delivery/review states separately. Orchestrator primarily passes status, Gate, blockers and next action; avoid full implementation packets or repeated full review at every hop. Tool capability limits are real: a wait/notification is not an unlimited autonomous scheduler or proof a Work resumed. Adopt these defaults at a safe handoff without restarting work or lifting STOP/HOLD/PAUSED. This update does not change model/Work settings or authorize product, DB, schedule or deployment changes; authorization and safety boundaries remain intact; testing/code-review duties and one GPT Final at real Stage completion follow the 2026-10-20 override, without routine evidence or retest obligations.

If an efficiency comparison is requested, use existing all-role records and state the measurement scope/cutoff, overlapping work and missing tail. Unavailable usage or old/new comparison values remain `NOT_MEASURED` / `UNKNOWN`; shorter text, observer-only usage or parallelism does not prove savings or review quality. Do not create benchmark Works, rerun accepted Stages or add a measurement/reporting project. Normal Stage work/time reporting is the short record in section 1.3.

---

## 2. Stage lifecycle

Default sequence:

`GPT Stage direction / scope → Orchestrator dispatch / necessary brief Preflight → Sol implementation + relevant tests → Independent CODE REVIEW → normal merge / deployment + Sol basic startup/function check → Orchestrator Stage summary → one GPT Final at real Stage completion`

Sol fixes test failures and concrete review findings within the approved task. Reviewer re-reads the affected diff and reported targeted tests, not a second full test campaign. Ordinary changes need section 1.3's Git/tests/review summary; do not demand a separate packet or GPT approval before or after each deployment. Orchestrator can arrange these iterations without GPT micro-dispatch.

GPT retains major direction, scope/architecture exceptions, actual Stage acceptance and next-Stage authority. A required real safety/source/HOLD/STOP Gate is not waived. Once a Stage is accepted, stop at its boundary unless continued work is already explicitly authorized.

Each substantial Stage should have:

- scope;
- exclusions;
- Gate;
- Done when;
- Self-QA;
- handoff expectations.

Do not add extra Gates solely for hypothetical edge cases.

Internal subagents are implementation workers, not a new Gate. Stages retain Plan → Stage → Gate → Implementation → Self-QA and existing Gate / Done when requirements. Do not invent tasks merely to use agents.

### 2.1 Git / deployment closeout

After Sol's relevant tests and independent code review, confirm that the Git version being merged/deployed is the reviewed/tested version and that the target is correct. Complete the normal authorized merge/deployment, preserving unrelated changes and a recoverable previous version; Sol performs the basic startup/changed-function confirmation. Report the version and actual result briefly. GPT receives one Final when the real Stage is complete, not a separate deployment or closeout permission request.

This explicitly replaces the older routine freeze-checklist / evidence-packet / independent closeout verification / pre-deploy GPT Final chain. No default per-file hash campaign, multiple receipts, full workspace inventory, repeated backup or second installed QA is required. A specific identity mismatch, conflict, unsafe state or material contract concern must still be investigated and resolved before the affected action; changes to the reviewed content receive targeted testing/code review. Explicit task/source limits, company exclusion and already-established recovery protections remain binding.

Sol may delegate mechanical steps within the reviewed version and approved target, but neither a worker nor Orchestrator grants new scope or source/deployment authority. No worker expands a spent quota or overrides an actual HOLD/STOP. Follow sections 3.1 / 15–16 without adding another approval layer.

---

## 3. Authorization and re-asking policy

Owner / GPT Manager authorization is process-authoritative for normal repository work; Orchestrator arranges execution inside that existing authority, including:

- code changes;
- documentation changes;
- tests;
- branches;
- commits;
- PRs;
- normal package generation;
- normal backups;
- approved config delta;
- known own-process start/stop;
- normal schema migration when the Stage explicitly authorizes it;
- Google Doc updates within section 7.4's role/scope limits; general Stage authorization does not grant Sol Owner Doc write access or automatic full-body synchronization;
- necessary Git merge/push, deployment/activation and safe DB updates in the same approved work under section 3.1.

Do not repeatedly ask the owner for the same authorization.

Ask again only when:

- there is real ambiguity with materially different product/data outcomes;
- the proposed action is a major new scope outside Manager authorization;
- a platform hard gate explicitly requires direct user action in that exact Work.

If a tool/platform explicitly blocks an action, do not bypass the platform policy through another shell/API/tool. Use the shortest legitimate alternative and classify it as a platform limitation rather than a product failure.

---

### 3.1 BACKUP → VERIFY → MODIFY → ACTIVATE → READBACK

For verified section 0 projects, this is the highest-priority execution principle within a clear, already approved goal. A recoverable backup, correct bounded change and necessary passing tests allow the existing Management / Sol Works to finish the actual used program or DB in the same work.

1. **BACKUP**: keep a recoverable previous version appropriate to the affected change. Git history is enough for tracked documentation/source restoration; preserve the prior installed version or actual affected data when needed. Reuse a sufficient existing backup, without default duplicate/full-workspace copies or backup manifests. Preserve unrelated dirty/untracked files; do not reset, clean or overwrite them.
2. **VERIFY**: confirm owner/provenance, approved scope, reviewed/tested Git version and correct target. Review the diff independently; Sol runs needed tests. Check real writer, security or DB consistency risks only where the actual operation needs them, not through a universal evidence checklist.
3. **MODIFY**: change only what the approved goal requires. Actual DB writes retain safe transactions and appropriate consistency/concurrency protection; verify the relevant result and roll back/restore on failure. Source contracts and explicit limits remain binding.
4. **ACTIVATE**: normally merge/push and deploy the reviewed/tested version to the intended target within the same authorization, retaining the previous recoverable version. Do not wait for another GPT approval or routine deployment evidence bundle.
5. **READBACK**: Sol confirms the actual Git/installed version and basic startup/changed function; for a DB/data change check the relevant actual result. Report success, failure or unknown honestly in the short change summary. Do not turn readback into a second QA campaign or default per-file hash run.

Cancel formal/test phased authorization, asking again for each merge/deploy/DB write of the same approved work, unnecessary repeated Stage Gates, new Works for the same work, and converting a directly fixable data problem into prolonged research. Keep meaningful tests, independent review, source/null/UNKNOWN/PARTIAL semantics, transaction/backup protection and current explicit exclusions. Do not create a second full implementation/Self-QA campaign or demand owner clicking as a generic Gate.

Only a real blocker after reasonable investigation stops affected work: unavailable credentials/resources, inability to prove owner/provenance or company isolation, unsafe/unrestorable state, materially ambiguous product/data outcomes, or a required change outside the approved goal/protection boundary. Report investigation, attempts, evidence, likely cause and the best next action; continue other safe work. A platform hard gate remains binding.

The next unrelated Stage, goal or feature still needs owner definition/authorization. Owner Doc role limits and separately scoped body-sync work in section 7.4 remain unchanged; general implementation authority does not let Sol write Owner Docs.

---

## 4. Personal-project engineering philosophy

These are personal projects with limited accumulated production data and are not being sold as enterprise software.

Default priorities:

1. New version works correctly.
2. Important data is protected.
3. Fix forward.
4. Avoid unnecessary compatibility/rollback complexity.

A bug in the new version should normally be fixed in the new version instead of spending large effort preserving every historical implementation quirk.

Disk space is not a primary constraint. Before consequential replacement, keep a complete backup when important user data is involved.

Review should focus on:

- direction did not drift;
- new core behavior works;
- important data is not lost;
- explicitly protected projects/systems were not touched;
- no obvious destructive/security risk;
- source/data semantics remain truthful.

Do not create extra Stages, evidence campaigns, or approval loops for purely theoretical edge cases.

Use stricter process only when operations are genuinely irreversible or high risk.

---

## 5. Source-owned data contract rule

Cross-project consumers should not depend directly on another project's private SQLite schema, internal tables, mutable `latest` files, or implementation-only JSON whenever a stable source-owned contract is practical.

Preferred pattern:

`source project -> versioned read-only contract -> consumer adapter -> UI`

A source contract should define:

- contract version;
- source identity;
- record identity;
- query/filter bounds;
- pagination;
- null semantics;
- state vocabulary;
- provenance;
- limitations;
- read-only guarantees;
- privacy boundary.

Consumers must not invent joins or identities the source does not own.

Examples of prohibited inference:

- same ticker/date means same business event;
- missing value means zero;
- unknown means no;
- PARTIAL means success;
- a current row reconstructs historical point-in-time state;
- a DB default value proves an observed measurement.

---

## 6. Canonical engineering documentation

### 6.1 One canonical engineering source per repository

Each repository should have one clear engineer-readable canonical design source.

Default path:

`docs/PROJECT-DESIGN.md`

A repository with an already established equivalent may keep it, but should not maintain several competing canonical design documents.

Engineering documentation may be technical and should include relevant:

- architecture;
- source contracts;
- APIs;
- state machines;
- identity;
- null/missing semantics;
- storage;
- errors;
- limits;
- tests;
- Stage/Release status;
- remaining work.

### 6.2 Product design is not a changelog

The canonical design must preserve both:

**Original purpose**

What the feature/project was intended to solve.

**Current implementation**

What is actually implemented now.

**Limitations**

What is still missing, unsafe, unsupported, partial, unknown, or intentionally excluded.

**Remaining work**

What would be required to complete the original design.

Do not erase original design merely because the current MVP is smaller.

---

## 7. Owner-readable Living Design

Each managed project should have one owner-readable Traditional Chinese Google Doc when useful.

The Google Doc is a **Living Design**, not a second independent project-status database.

Do not maintain a duplicate long-lived Chinese Markdown version in parallel.

### 7.1 Stable structure

Preserve the original Stage / Phase / Release / Feature structure.

When work progresses, update the existing item in place instead of moving completed work into a separate "Done" section.

Common status markers:

- `☐` not started
- `◐` partial
- `☑` complete
- `⏸` paused

Typical progression:

`☐ -> ◐ -> ☑`

`⛔` is **not globally standardized** because existing project history uses it with conflicting meanings (for example, blocked/unavailable versus intentionally stopped). A repository that uses `⛔` must define its meaning in its own canonical design before applying it. Do not silently reinterpret historical symbols.

### 7.2 Stable identities

Existing stable identifiers should remain stable:

- feature IDs;
- Stage IDs;
- Release IDs;
- Phase IDs.

Do not rename/re-number an identity merely because:

- implementation changed;
- UI moved;
- wording changed;
- code was refactored.

If identity truly changes, record it as an intentional design change.

### 7.3 What the owner document must explain

The owner document must retain useful design explanations, not just status. This is a body-quality requirement for separately authorized content/batch work, not a requirement to rewrite its body at each Stage. Routine synchronization follows section 7.4.

When materially relevant, explain:

- data source;
- how data is acquired;
- how a decision/state is determined;
- formulas/methodology;
- identity;
- storage;
- errors;
- PARTIAL/UNKNOWN/null behavior;
- testing scope;
- limitations;
- remaining work.

For externally imported AI scores, explicitly state the score origin, e.g.:

`Imported AI report`

Do not make an imported score look like it was computed by the consumer Python/Dashboard code.

### 7.4 Owner Doc Lightweight Sync Policy

Notice version: `owner-doc-lightweight-sync-v1`. This owner decision replaces per-Stage full-body synchronization and implementation-owned Owner Doc writes. Git canonical design / contracts / Stage evidence remain engineering truth. Preserve the single existing Owner Doc and its stable structure, identities, sharing and truthful status.

**A. Sol Implementation Work — request only**

Sol must not directly edit Owner Google Doc body or status, synchronize it merely because implementation / Design Sync / deployment finished, or create a new/duplicate Owner Doc. Sol maintains Git canonical docs, Stage evidence and implementation truth.

If an Owner Doc change is needed, include `DOC_CHANGE_REQUEST` in the handoff with at least:

- target document;
- target section / paragraph;
- current wording summary;
- requested change;
- reason;
- supporting Stage / SHA / evidence;
- classification: `STATUS_ONLY` or `CONTENT_CHANGE`.

Sol may propose wording but must not write it into the Owner Doc.

**B. Management Work — lightweight sync owner**

Management first decides whether the request is supported. Its routine direct body-edit authority is limited to:

1. Evidence-backed completion markers: `☐ → ◐`, `◐ → ☑`, `☐ → ☑`, and `⏸` when warranted.
2. Extremely short, objective operational identities directly related to that status: accepted / merged SHA, deployed / not deployed, `STOPPED`, exact runtime identity, formal compatibility status, or existing `NOT STARTED` / `PARTIAL` / `COMPLETE` states.

Do not use a status update to rewrite design body, architecture, methodology or long paragraphs. Preserve the evidence's meaning; a short identity does not imply broader acceptance.

**C. Content changes — comments only**

For architecture, source-of-truth, data semantics, methodology, limitations, formulas, product behavior, roadmap wording or long design explanations, Management may add a comment at the corresponding location after approving `DOC_CHANGE_REQUEST`; do not directly rewrite body.

Keep the comment brief: requested change, reason, Stage / SHA reference. Read the target first and include exact quoted text plus section/paragraph context in both the comment and `quoted_text`, so the target is identifiable even if the editor shows an unanchored Drive API comment. Do not claim native UI anchoring from API success.

A comment is a pending synchronization item, not a new canonical engineering truth.

**D. Fixed comment route / failure fallback**

Comment capability was tested once on 2026-10-05 using the connected Google Drive `bulk_update_file_comments` / `get_document_comments` tools on the existing Local Dashboard Owner Doc `1GgEEjKTNPTJ5ACMXQ6TIaXSUFYH9OugdP9LAOIQcgNs`. Test comment `AAACA1TYAsM` was created with live quoted text, read back, then resolved and read back as resolved; the native body/tab text snapshot was unchanged. Native UI anchoring was not verified and is not required for this explicit quote/location route.

Management uses this verified comment route directly for approved content requests. Sol / Management Works must not repeat capability probes at every Stage or on notification receipt. This verifies the connector route, not every document's permissions. If the tool is absent or the actual authorized comment write/readback fails, do not run a new capability-test campaign or substitute a body write.

Return `OWNER_DOC_CONTENT_SYNC_PENDING` and `OWNER_DOC_MANAGER_EDIT_REQUIRED`, with:

- target Owner Doc / document ID;
- target section / paragraph;
- approved `DOC_CHANGE_REQUEST`;
- approved replacement / addition wording;
- reason;
- supporting Stage / accepted SHA / merge SHA / deployment evidence;
- current completion status.

GPT Manager performs the required body update in the main conversation. Management may still perform its independently authorized completion/status marker and very short operational identity updates.

Pending Owner Doc content does not block normal Stage / merge / deployment unless that Stage explicitly makes body sync a completion Gate. After Manager edits, Management may verify revision / target paragraph during later closeout; do not repeat a full Doc review. An actual operation failure is not successful comment delivery.

**E. Full body synchronization — separately authorized batch**

Full body updates are `OWNER_DOC_BATCH_SYNC` and require separate authorization. Appropriate triggers are an explicit GPT Manager request, completion of a major Phase / Release, accumulated approved `DOC_CHANGE_REQUEST` items needing batch cleanup, an explicit Owner cleanup request, or a major canonical design change leaving the Owner Doc materially inaccurate. A trigger alone is not authorization.

Do not automatically attach batch body sync to implementation completion, Design Sync, Git merge or deployment. Batch authorization identifies the editing owner and content scope; routine Management authority remains limited to B/C, and Sol's direct-write prohibition remains in force.

**F. Completion marker authority**

Management must not mark `☑` merely because work looks complete. Require approved evidence supporting the exact marker, such as Management Independent Review PASS, GPT Manager acceptance, authorized merge/deployment evidence, or canonical Stage completion evidence. If the applicable acceptance has not been established, retain the existing marker. Do not promote `UNKNOWN`, null or `PARTIAL` to success.

**G. GPT Manager role**

GPT Manager owns Stage acceptance / design direction and may authorize batch sync. It does not personally edit every routine Google Doc update or require Sol to synchronize the body. Management owns daily lightweight status/comment handling; the failure packet in D routes required body editing to GPT Manager.

---

## 8. Design change policy

A real Design Change exists when one of these occurs:

- new owner requirement;
- original approach proves infeasible;
- source contract changes;
- architecture changes;
- owner/Manager intentionally changes direction;
- an original feature is formally stopped;
- Stage scope materially changes.

A Design Change record should preserve:

- date;
- original design;
- new design;
- reason;
- impact;
- approval / Stage / SHA when appropriate.

Do not create Design Change entries for:

- refactors;
- minor bug fixes;
- wording corrections;
- test fixes;
- implementation detail that does not change product semantics.

---

## 9. Truthful state and null semantics

Documentation, contracts, and UI must preserve source meaning.

Never silently transform:

- `UNKNOWN` -> NO
- null -> 0
- missing -> false
- PARTIAL -> SUCCESS
- candidate/unverified -> certified
- not observed -> zero return
- unavailable -> empty population

When the source cannot prove something, say so.

A success of an operational scheduler/process does not automatically prove business-data success.

---

## 10. Google Doc editing rules

Any authorized body edit updates the existing document in place, within section 7.4's role and scope limits. Implementation / Design Sync / deployment does not automatically require full body synchronization.

Do not:

- create a new Doc for every Stage;
- create `v2` copies as the normal workflow;
- rebuild the whole document for a targeted change;
- alter sharing permissions unless explicitly requested.

Preserve as applicable:

- tab topology;
- heading hierarchy;
- paragraph structure;
- tables;
- styles;
- links;
- lists;
- native elements;
- sharing metadata.

For an authorized native body write (including Management's bounded status/identity updates), use:

1. Read current document and revision.
2. Use trusted/native read for existing-doc writes.
3. Identify only target paragraphs/structures.
4. Apply targeted update.
5. Use revision guard.
6. Native readback.
7. Verify unrelated structure did not drift.

For pending content / comment-operation failure, use section 7.4 D's `OWNER_DOC_CONTENT_SYNC_PENDING` / `OWNER_DOC_MANAGER_EDIT_REQUIRED` packet. The legacy `GOOGLE_DOC_SYNC_PENDING` marker remains valid historical evidence of an unsynchronized document; it does not authorize a body-write fallback.

Do not block working product code, normal Git closeout or deployment solely because Owner Doc content is pending, unless the Stage explicitly makes body synchronization a completion Gate. Keep native in-place editing, revision guards, structure preservation, no duplicate Docs and truthful status.

### 10.1 Visual Doc QA

Do not automatically export PDF/screenshots for every small text update.

Native readback is sufficient for ordinary targeted text edits.

Use visual/PDF QA when layout, tables, figures, pagination, or other presentation-sensitive changes materially require it.

---

## 11. Generated design samples

Generated prototype/sample artifacts are not source of truth.

For repositories with a canonical generator:

`canonical design -> generator -> sample`

Never hand-edit generated samples to make them look current.

Run the generator's check command during the Stage.

---

## 12. Historical records

Preserve relevant historical:

- Design Changes;
- Change Log;
- Release history;
- Stage history;
- prior acceptance evidence.

Historical evidence must not be confused with current state, but it should not be deleted merely because newer evidence exists.

---

## 13. Evidence policy

Claims must remain truthful and refer to the version actually tested/reviewed. Ordinary delivery uses section 1.3's Git SHA/PR, tests/results and review conclusion; no raw evidence/hash/receipt/screenshot bundle is required by default. Additional records are only for a concrete change-specific concern, not general reassurance.

Do not overstate:

- source smoke as installed acceptance;
- synthetic fixtures as formal-source truth;
- repository/package approval as installed-version QA;
- pre-fix formal smoke as final-code formal acceptance;
- process success as business-data completeness.

When evidence was produced on an earlier SHA and final code differs, record that distinction explicitly.

A stricter fail-closed guard added after a formal read may be accepted through TEMP regression when appropriate, but the earlier formal read must not be relabeled as final-code formal evidence.

---

## 14. Testing policy

Sol runs tests appropriate to the changed behavior, adds necessary unit tests, fixes failures and performs the needed build. Documentation-only work uses relevant document/diff checks. Choose additional integration/browser/source checks only when the actual change requires them, not from a universal responsive-width/screenshot/package-parity checklist.

Management independently reviews the code/diff, contracts and test coverage/results; it does not rerun tests by default. A concrete missing case or bug goes back to Sol for targeted testing/fixing and affected-diff review. Sol also performs the installation's basic startup and changed-function confirmation when deployment is part of the approved task. Do not make another full installed QA campaign or owner clicking a generic Gate.

Do not repeat expensive financial/formal-source reads, consume a spent allowance, or invent results to satisfy a delivery checklist. DB/security/source checks follow actual risk and explicit scope. Tests not run or not applicable must be identified honestly.

---

## 15. Deployment policy

For verified section 0 projects, follow section 3.1 within the same approved task: after Sol's relevant tests/build and independent code review, confirm the reviewed/tested Git version and correct target, then perform the normal deployment. Keep the previous version recoverable and preserve unrelated dirty installation changes.

Sol performs basic startup and changed-function confirmation; diagnose/fix or restore the previous version if needed. No default file-by-file hashing, multiple JSON receipts, repeated backups, second full installed QA or GPT approval after deployment. Actual DB changes, active writers, security boundaries and explicit source limits still need their relevant protections, not a new general campaign.

This deployment workflow does not authorize an automatic-deployment feature or scheduler; an Owner-cancelled automatic-deployment feature remains cancelled. Only separately authorized product work may change code/runtime/config. Documentation-only governance work updates documents/Git, not the product installation.

---

## 16. Git integration and closeout

Within the same approved work, normally integrate after Sol's tests and independent code review, then deploy when the task requires it. Confirm the reviewed/tested SHA/PR and intended target; preserve unrelated dirty changes. Fetch and synchronize main with `pull --ff-only`, merge the accepted head with explicit `--no-ff`, and normally push. Retain the source branch. No squash, rebase or force-push fallback.

Sol checks that local/tracking/live main identify the resulting integration and that no unexpected content/conflict changed the reviewed version. Resolve a real mismatch before proceeding, with targeted testing/review of any changed content. Report the actual SHA and PR state if a PR is used; do not create or manipulate PR metadata just for a checklist.

The former mandatory independent parent/ancestry/tree/content proof packet and separate closeout verification are replaced by these ordinary version/target checks. Inspect parents/tree or raw files when a concrete mismatch warrants it, not as a new report/hash campaign. The short Git/tests/review summary is sufficient; no new status-only commit, receipt system or repeated GPT deployment approval is needed.

---

## 17. No self-referential documentation loop

A reviewed SHA often legitimately says:

- awaiting Manager review;
- unmerged;
- not deployed.

After Manager passes that exact SHA, do **not** create a new docs-only commit solely to change those phrases to "approved".

That creates an endless loop where the accepted SHA immediately becomes stale.

Update such current-state wording opportunistically during the next normal engineering/documentation sync.

---

## 18. Work naming

When an authorized visible Work is created or instructions are prepared for one, give it a clear bracketed purpose name. Reuse existing Works per section 1.1; naming is not permission to create a new Work:

`[Project] 管理與初審`

`[Project] Sol 實作`

`[Project] 總管理` / an assigned cross-project Orchestrator name

or another concise `[xxx]` purpose label. Internal subagents are not additional persistent Works; preserve existing names and continuity rather than rename/recreate them to adopt V2.

Avoid generic unnamed Works.

---

## 19. Cross-repository changes

Do not casually combine source-project and consumer-project changes into one Stage.

Preferred sequence:

1. Source project creates/merges stable contract.
2. Consumer project integrates the merged contract.

This keeps ownership, evidence, and rollback/fix-forward scope clear.

A source contract Stage should not quietly modify the Dashboard, and a Dashboard integration Stage should not mutate the source database/project.

---

## 20. Repository-local rule discovery

Before adding new workflow/governance files to an established repository, inspect for existing:

- `AGENTS.md`;
- `README.md` rules;
- `docs/PROJECT-DESIGN.md`;
- governance/workflow/contributing files;
- repository-specific instructions.

Do not duplicate an existing canonical rule set.

Keep valid local technical/protection rules and link/reference rather than copy-pasting competing text. For verified section 0 projects, supersede older active per-action authorization or installation-ends rules with the current owner decision; do not preserve that conflict merely by calling it a stronger local rule.

---

## 21. Review checklist

For the actual change, Reviewer checks the exact diff against the approved requirement/contracts, identifies substantive bugs or safety/source-semantic problems, and assesses whether Sol's reported tests cover the change. Return a concise conclusion and specific findings. Do not convert this checklist into mandatory raw evidence, test reruns, backup proofs or independent deployment QA.

Sol handles targeted tests/fixes and the relevant operational confirmation. Scope/company exclusions, honest test status, source/PIT/rights/null/UNKNOWN/PARTIAL semantics, actual data/security protections and next-Stage authority remain binding. Unchanged unrelated areas do not need another review.

---

## 22. Existing rule sources and precedence notes

This file centralizes the rules that were previously missing or scattered. It intentionally does not replace stronger existing local sources.

For Local Dashboard specifically:

- `docs/GOOGLE-DOCS.md` remains the detailed repository-local authority for its Living Design / Google Doc policy.
- `docs/PROJECT-DESIGN.md` remains the canonical feature/status source for the Dashboard product.
- historical Stage evidence remains evidence, not governance.

Repository/workspace `AGENTS.md` files may define engineering execution details such as Plan -> Stage -> Gate -> Self-QA. Those local rules remain valid unless they conflict with a newer explicit owner/Manager decision or this document's cross-project defaults.

Known legacy conflicts explicitly superseded on active instruction surfaces:

- old per-Stage implementation/research/debug Chats conflict with reusing the existing Reviewer/Sol pair and assigned Orchestrator;
- the former exactly-two-visible-Works ceiling and Luna-only delegation conflict with V2 section 1; Sol may use Luna or other internal agents, without creating extra persistent worker Works;
- old direct Management-to-Sol / Sol-to-GPT routing is superseded by section 2's Orchestrator coordination, while independent review and GPT acceptance remain distinct;
- older generic “Manager” wording is interpreted by section 1.2: GPT decides direction/final acceptance; Orchestrator only coordinates within existing authority. It cannot turn a historical approval into a new scope or replace a source contract/safety limit.

The 2026-10-20 Owner override also supersedes older routine requirements to reproduce tests independently, generate evidence/hash/receipt bundles, freeze long closeout forms, prove every backup again, run a second post-deploy QA or obtain GPT Final before/after each routine deployment. Use the updated sections 1.2–1.6 / 2 / 2.1 / 3.1 / 13–16 / 21 instead, including when an older skill/template says otherwise. Do not rewrite historical evidence or skills merely to erase old policy. Source/safety contracts and specific real-risk checks are not waived.

---

## 23. Adoption rule

This document is the central cross-project default for verified section 0 projects. A repository's presence under a shared workspace does not extend that scope.

Each repository should either:

- follow it directly; or
- contain a short repository-local reference/override where needed.

Do not copy the full document into every repository unless there is a concrete offline/tooling reason to do so. Repetition creates drift.

Repository product semantics remain authoritative in that repository's canonical engineering design and approved source contracts.

Adopt V2 at the next safe handoff point in existing work. Do not cancel, restart, redo accepted checks or lift STOP/HOLD/PAUSED merely because governance changed. Adopting this governance-document update activates only the specified documents/Git; it does not authorize code, DB, Task/scheduling or deployment-setting changes, unrelated repository/skill changes, company access or rewriting historical backups. Necessary product actions still require their own already approved goal under sections 0 / 3.1. Other repositories may adopt the canonical by reference during authorized maintenance, not by a bulk rewrite.

The 2026-10-20 simplified workflow applies at the next safe handoff. An explicit Owner instruction may resume its named Codex/Sol MVP work through Orchestrator; it does not lift unrelated source, rights, PIT, HOLD, spent-quota or STOP boundaries. This governance writer performs documentation/Git only; Orchestrator routes product continuation and role notifications.
