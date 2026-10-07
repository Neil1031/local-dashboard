# Personal Project Governance

Status: **Active cross-project governance for verified Neil1031 personal projects — 2026-10-08**

This document records durable workflow, documentation, review, Git, deployment, and evidence rules that should not exist only in chat history. It is a **cross-project default**, not a replacement for each repository's product design or source contract.

Priority when instructions conflict:

1. Explicit current owner / Manager instruction.
2. Intentional repository-specific rules such as `AGENTS.md`, a repository's canonical engineering design, or an approved source contract.
3. This cross-project governance document.
4. Tool / framework defaults.

A repository-specific override should be deliberate and documented. Do not silently drift from this document.

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

For a managed personal software project, use two persistent visible Works:

- `[Project] 管理與初審`
- `[Project] Sol 實作`

Default model for both:

- GPT-6.1 Sol
- High reasoning

Do not create a new Work for every Stage. Reuse the same pair across Stages so context, decisions, and evidence stay continuous.

Luna is a delegated bounded worker inside Sol Implementation Work, not a third persistent Work. Do not create `[Project] Luna Work` or recreate Management/Sol Works when a Stage changes. Sol may use Luna subagents for the tasks and limits in section 1.4; this is the owner's 2026-10-04 intentional update to the former blanket hidden-subagent prohibition. A broader orchestration tree still requires explicit owner authorization.

Use another model such as Astra only for a concrete escalation need, for example:

- major architecture disagreement;
- genuinely irreversible or high-risk operation;
- unresolved root cause after normal investigation;
- materially conflicting evidence;
- a focused independent review that benefits from another model.

### 1.2 Responsibilities

**GPT Manager / Manager Chat**

Owns:

- roadmap and priority;
- Stage goal;
- product / architecture direction;
- scope / exclusions and authorization boundaries;
- Gate and Done when;
- major design decisions;
- final review and acceptance;
- next Stage authorization;
- authorization of the work scope, including its necessary merge / deployment / DB operations under section 3.1; no repeated permission for the same approved work.

GPT Manager does not own repository-internal Luna micro-task routing; Sol owns it.

**Management Work — Preflight**

Before implementation, perform only a concise preflight:

- verify live main / baseline;
- verify actual repo state against Manager assumptions;
- detect existing contract / governance conflicts;
- establish the necessary source / DB operations and any actual limits within the approved work; respect explicit limits and source contracts, without inventing a separate formal/test permission Gate;
- establish production / deployment protection boundaries;
- convert the Stage into a bounded implementation assignment.

Without a real conflict/blocker, do not redesign the Stage or expand Manager instructions into another long specification. Report genuine conflicts to Manager; do not silently change product direction or scope.

**Management Work — Independent Review**

Owns:

- supervising scope;
- independently reviewing the exact integrated candidate after Sol's `HANDOFF_DELIVERED`: architecture, source/code, semantics, contract, scope, regression, protection, evidence reliability, Luna delegation boundary, and exact SHA;
- returning findings to Sol;
- rechecking fixes on the exact resulting SHA;
- producing `READY_FOR_MANAGER_REVIEW`.

Luna self-check and Sol Self-QA do not constitute independent PASS. Management review remains separate from GPT Manager Final Review.

Management owns routine Owner Doc lightweight status/comment handling under section 7.4; this does not authorize design-body rewriting.

**Sol Implementation Work**

Sol is the implementation owner.

Owns:

- `/plan`;
- inspection of the actual workspace;
- implementation planning;
- core implementation;
- integration;
- debugging;
- tests and Self-QA;
- Luna delegation and result verification;
- fixing management findings;
- final integrated candidate SHA;
- producing a complete handoff packet with `HANDOFF_DELIVERED`.

Sol should actively attempt to solve implementation problems rather than merely report them.

For Owner Doc changes, Sol submits `DOC_CHANGE_REQUEST` under section 7.4 and does not edit the Google Doc.

### 1.3 Handoff marker

A completed Sol-to-management handoff must explicitly use:

`HANDOFF_DELIVERED`

Management should acknowledge receipt and independently verify the result.

Include delegated task scope, worker/model identity, changed paths, verification results and any STOP/escalation in the proportional handoff evidence. Bind the final packet to the integrated candidate SHA; a worker's intermediate SHA is not the integrated candidate.

### 1.4 Luna delegated bounded tasks

Sol should preferentially delegate low-ambiguity, machine-verifiable, easily reversible tasks to Luna. Each assignment specifies allowed paths/actions, inputs and baseline, expected output, verification command/criteria, protection boundaries and STOP conditions. Sol verifies results and integrates them; delegation neither expands Stage authority nor creates another approval layer.

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

**Verification**

- Git SHA / branch / PR;
- parent / tree / ancestry;
- changed-path verification;
- raw hashes;
- manifests;
- byte parity;
- generator execution/checks;
- i18n key / placeholder parity;
- `git diff --check`;
- static asset parity;
- bounded test command execution.

**Frozen closeout / deployment**

Delegate only after scope, accepted SHA, expected main and exact runtime/config delta (including an explicit no-delta) are frozen and the action is authorized:

- build/package;
- backup;
- candidate freeze;
- exact blob/hash verification;
- mechanical no-ff closeout;
- frozen overlay/image deployment;
- installed identity/protection evidence.

Existing Git/deployment rules in sections 15–16 still apply. Frozen inputs alone do not authorize merge or production operations. Installed identity/protection evidence does not introduce a post-install QA campaign.

Follow the frozen closeout role chain and boundary in section 2.1.

**Luna must not independently own**

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

**Luna STOP / escalation**

Luna must stop the affected task and report to Sol when it encounters:

- unexpected diff/state;
- main moved;
- test failure;
- identity/hash mismatch;
- scope expansion;
- ambiguous specification;
- unexpected production state;
- destructive action outside explicit authorization;
- inability to prove correctness/safety under current rules.

Report the observed state, actions already taken, evidence and unresolved issue. Do not independently expand research, architecture or modification scope, repair outside the assignment, or retry destructive operations. Sol investigates, safely fixes/reassigns within existing authority, or escalates an actual scope/design/authorization decision through the existing Management/Manager path. This worker STOP rule limits Luna autonomy; Sol retains the existing investigate → attempt → verify → adapt → continue responsibility.

**Purpose**

Reduce Sol's time spent on repo archaeology, mechanical edits, repetitive tests, fixtures, hashes/manifests, parity, build/package, frozen closeout and routine deployment evidence. Sol remains accountable for the integrated result. Do not add an approval layer to achieve this.

### 1.5 Evidence reuse / proportional review

Produce the same evidence once by default. When Sol / Luna has already produced verifiable evidence, later roles should preferentially validate that evidence rather than regenerate the entire set:

- hashes;
- manifests;
- test receipts;
- candidate identity;
- Git ancestry/tree evidence;
- package identity;
- deployment receipts.

Management Independent Review defaults to proportional verification focused on:

- exact SHA / diff / scope;
- Stage Gate evidence;
- key tests;
- source / semantic assertions;
- whether `UNKNOWN` / `PARTIAL` / null was incorrectly hidden or promoted to success;
- whether the Stage contract was violated;
- protection / deployment boundary;
- consistency across evidence.

Expand re-verification only when:

- evidence contradicts other evidence;
- hash / identity mismatch occurs;
- test results are not trustworthy;
- source bytes changed;
- unexpected scope is found;
- the reviewer identifies a concrete risk requiring further verification.

Independent Review must not become a rerun of the entire implementation / Self-QA. Evidence reuse does not turn Luna self-check or Sol Self-QA into independent PASS: the reviewer independently checks the existing evidence and performs the proportional verification above. Preserve source contracts and any actual explicit read limits. Necessary reads in the same approved work follow section 3.1; review or evidence reuse does not authorize unrelated reads or create a new environment authorization Gate.

---

## 2. Stage lifecycle

Default sequence:

`GPT Manager → Management Work Preflight → Sol Implementation Work → Luna delegated bounded tasks → Sol integration / Self-QA → Management Work Independent Review → GPT Manager Final Review`

1. Manager defines Stage.
2. Management performs concise preflight against actual baseline, contracts, formal-read allowance and protection boundaries.
3. Management gives Sol a bounded implementation assignment.
4. Sol runs `/plan`, inspects/plans/implements, routes suitable bounded tasks to Luna, verifies delegated results, integrates and performs Self-QA.
5. Sol sends a complete packet bound to the final integrated candidate SHA, marked `HANDOFF_DELIVERED`.
6. Management independently reviews the exact integrated candidate and evidence, including Luna delegation boundaries.
7. Sol fixes findings.
8. Management rechecks exact SHA.
9. Management reports `READY_FOR_MANAGER_REVIEW`.
10. Manager performs final review.
11. After the required review passes, complete the approved work through section 2.1 / 3.1, including its necessary closeout, activation and readback; do not wait for the same authority again.
12. STOP after closeout acceptance; the next Stage requires separate Manager authorization.

Each substantial Stage should have:

- scope;
- exclusions;
- Gate;
- Done when;
- Self-QA;
- handoff expectations.

Do not add extra Gates solely for hypothetical edge cases.

Luna is an implementation worker, not a new Gate. Stages retain Plan → Stage → Gate → Implementation → Self-QA and existing Gate / Done when requirements. A Stage without a suitable bounded task does not invent work merely to use Luna.

### 2.1 Frozen closeout handoff

Required role chain:

`GPT Manager authorizes the work and its boundary → required candidate review / GPT Manager Final PASS → Sol freezes executable closeout inputs within that existing authority → Luna may execute bounded / frozen mechanical tasks → Sol verifies execution / evidence → Management performs proportional closeout verification → GPT Manager final acceptance → STOP / next Stage separately authorized`

For verified section 0 projects, the approved work already covers its necessary merge / deployment / DB operations under section 3.1. Final PASS is a review result, not a new permission layer. Sol records the applicable actions and freezes the discovered executable inputs within that approved boundary before assigning mechanical closeout:

- accepted candidate SHA;
- expected live main / merge target;
- allowed source/runtime paths;
- runtime delta;
- config delta;
- deployment target;
- formal-read allowance;
- backup / protection boundary;
- STOP conditions.

State an explicit no-delta / not-applicable boundary where appropriate; absence of a value does not grant discretion to expand it.

Sol may decide:

- execution-order details;
- Luna task granularity;
- how to implement a permitted SOP.

Sol must not independently change:

- Stage scope;
- accepted SHA;
- merge target;
- runtime/config delta;
- formal-read quota;
- deployment boundary;
- product semantics.

Luna may execute only frozen, authorized mechanical actions. Luna must not independently decide that merge / deployment is now permitted.

If a frozen input does not match the actual environment, Luna stops the affected task and returns to Sol. Sol investigates, safely resolves in-scope drift and refreezes/reverifies inputs; a real change to the approved goal, semantics or protection boundary goes through Management / GPT Manager. Do not turn a fixable in-scope mismatch into a new owner authorization Gate.

Sol verifies delegated execution and evidence; Management applies section 1.5 to closeout verification, reusing the existing evidence and expanding checks only for its stated triggers. GPT Manager performs final acceptance, then work stops. This assigns the existing execution/review/acceptance responsibilities without adding an approval layer. Git / deployment safeguards in sections 15–16 and actual explicit source limits remain in force. Necessary activation/readback under section 3.1 is required; it does not create a second full QA campaign.

---

## 3. Authorization and re-asking policy

Manager authorization is process-authoritative for normal repository work, including:

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

1. **BACKUP**: protect the real affected state before mutation. Record complete restoration paths/identity and verify a usable backup, including a consistent DB backup where needed. Preserve unrelated dirty/untracked files and prior backups; do not reset, clean or overwrite them.
2. **VERIFY**: verify repository owner/provenance, actual baseline/target, approved scope, source contracts, writer safety, backup restorability and proportional tests/review. Resolve fixable problems by investigating, attempting safe fixes, verifying and adapting.
3. **MODIFY**: perform only the changes necessary for that goal, including the real used source/config/data. DB writes use a safe transaction and appropriate concurrency/consistency controls; verify intended rows/results. On failure, rollback or restore the verified backup within the same recovery boundary.
4. **ACTIVATE**: after the necessary tests and independent review, normally merge/push, deploy and enable the actual intended version where those actions are needed for the approved goal. Use the established SOP and exact identities. Source/TEMP PASS is evidence, not a reason to wait for another deployment permission.
5. **READBACK**: verify the actual resulting Git/runtime/config/DB identities and relevant behavior/data. Confirm local/tracking/live refs or installed version and intended DB results as applicable. Report verified, pending and unknown states honestly; a submitted command is not proof of activation.

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

Evidence should prove the claim actually being made.

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

Development / pre-install testing is required.

Use practical coverage appropriate to the Stage, such as:

- unit tests;
- integration tests;
- frontend tests;
- browser tests;
- responsive widths 1280 / 375 / 320;
- keyboard/focus behavior;
- safe-text/HTML handling;
- source read-only smoke;
- generator checks;
- diff checks;
- package/static parity.

Literal human clicking is not automatically a Gate when an equivalent test exercises the same approved binary/path/data/runtime.

Do not repeat expensive formal-source reads merely to accumulate evidence when the relevant source/process behavior did not change.

---

## 15. Deployment policy

For verified section 0 projects, use section 3.1: **BACKUP → VERIFY → MODIFY → ACTIVATE → READBACK**. Deployment and necessary runtime/config/DB actions belong to the same approved work; do not wait for a separate formal/test or deployment authorization after source/TEMP PASS.

Test proportionally, verify the restorable backup and writer/protection conditions before replacement, publish the exact candidate using the established SOP, apply only the necessary bounded config delta, activate the intended version and read back actual identity plus relevant behavior/data. Restore/rollback on failure. Do not overwrite unrelated dirty installation changes or affect excluded company/other-owner systems.

The former identity-only “installation ends” rule is superseded for this scope. Necessary activation/readback is part of completion. Avoid a second full installed-version QA campaign, generic screenshot/click Gates and unnecessary formal-source rereads; retain tests needed to prove the actual change. Desired process/Task state must match the approved goal, not be inferred from an old receipt.

---

## 16. Git integration and closeout

Within the same approved work under section 3.1, perform necessary Git integration after required candidate review, then continue any needed deployment/activation/readback. No separate merge authorization Gate is added. A documentation-only governance assignment activates documents/Git only, not product runtime or DBs.

Default closeout:

1. Fetch actual PR/refs.
2. Verify exact accepted SHA.
3. Verify main has no unexpected change.
4. Ensure relevant worktrees are clean.
5. `pull --ff-only` main.
6. Merge exact accepted head with explicit `--no-ff`.
7. Normal push.
8. No squash.
9. No rebase.
10. No force push.

Then independently verify:

- accepted SHA is main ancestor;
- merge has exactly two parents;
- first parent is actual reviewed/premerge main;
- second parent is accepted SHA;
- merge tree/content equals accepted tree/content;
- local main = origin/main = live remote main;
- source branch remains;
- worktrees are clean;
- actual PR merged/closed/draft state is reported honestly.

Do not use metadata workarounds solely to clear a retained draft flag if Git ancestry/content is already correct.

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

When a Work is created or instructions are prepared for one, give it a clear bracketed purpose name:

`[Project] 管理與初審`

`[Project] Sol 實作`

or another concise `[xxx]` purpose label.

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

Manager/management review should normally answer:

- Are actual Neil1031 ownership, fork provenance, personal target and company isolation verified under section 0?
- Is the Stage still solving the authorized problem?
- Does the core behavior work?
- Are important data and protected systems safe?
- Are source identities and null/partial semantics truthful?
- Did the implementation avoid forbidden joins/inference?
- Are tests proportional and meaningful?
- Are source/formal/synthetic/installed evidence boundaries stated honestly?
- Did only intended canonical feature/status rows change?
- Did engineering docs remain canonical, with Owner Doc lightweight updates / pending content requests truthfully handled under section 7.4?
- Is the exact reviewed SHA clear?
- Are backup/restoration, necessary activation and actual readback proven under section 3.1?
- Is the next unrelated Stage still stopped until authorized?

This checklist is guidance, not a reason to create unnecessary gates.

---

## 22. Existing rule sources and precedence notes

This file centralizes the rules that were previously missing or scattered. It intentionally does not replace stronger existing local sources.

For Local Dashboard specifically:

- `docs/GOOGLE-DOCS.md` remains the detailed repository-local authority for its Living Design / Google Doc policy.
- `docs/PROJECT-DESIGN.md` remains the canonical feature/status source for the Dashboard product.
- historical Stage evidence remains evidence, not governance.

Repository/workspace `AGENTS.md` files may define engineering execution details such as Plan -> Stage -> Gate -> Self-QA. Those local rules remain valid unless they conflict with a newer explicit owner/Manager decision or this document's cross-project defaults.

Known legacy conflict to remove during normal local-rule maintenance:

- older Local Dashboard planning text that says to create a new implementation/research/debug Chat per Stage conflicts with the current persistent two-visible-Work policy. The two persistent Works are the current default.

Do not rewrite historical evidence merely to erase an old policy. Update only active/current instruction surfaces.

---

## 23. Adoption rule

This document is the central cross-project default for verified section 0 projects. A repository's presence under a shared workspace does not extend that scope.

Each repository should either:

- follow it directly; or
- contain a short repository-local reference/override where needed.

Do not copy the full document into every repository unless there is a concrete offline/tooling reason to do so. Repetition creates drift.

Repository product semantics remain authoritative in that repository's canonical engineering design and approved source contracts.
