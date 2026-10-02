# Personal Project Governance

Status: **Cross-project default governance for personal software projects**

This document records durable workflow, documentation, review, Git, deployment, and evidence rules that should not exist only in chat history. It is a **cross-project default**, not a replacement for each repository's product design or source contract.

Priority when instructions conflict:

1. Explicit current owner / Manager instruction.
2. Intentional repository-specific rules such as `AGENTS.md`, a repository's canonical engineering design, or an approved source contract.
3. This cross-project governance document.
4. Tool / framework defaults.

A repository-specific override should be deliberate and documented. Do not silently drift from this document.

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

Do not use hidden subagents or a large orchestration tree unless the owner explicitly changes this rule.

Use another model such as Astra only for a concrete escalation need, for example:

- major architecture disagreement;
- genuinely irreversible or high-risk operation;
- unresolved root cause after normal investigation;
- materially conflicting evidence;
- a focused independent review that benefits from another model.

### 1.2 Responsibilities

**Manager Chat**

Owns:

- roadmap and priority;
- Stage scope;
- design and product decisions;
- authorization boundaries;
- final review;
- merge authorization;
- deployment authorization.

**Management Work**

Owns:

- receiving the bounded Stage;
- handing implementation to Sol;
- supervising scope;
- independently reviewing actual source, diff, tests, evidence, and exact SHA;
- returning findings to Sol;
- rechecking fixes;
- producing `READY_FOR_MANAGER_REVIEW`.

Management does not treat Sol self-review as independent approval.

**Sol Work**

Owns:

- implementation;
- tests;
- practical debugging;
- fixing management findings;
- producing a complete handoff packet.

Sol should actively attempt to solve implementation problems rather than merely report them.

### 1.3 Handoff marker

A completed Sol-to-management handoff must explicitly use:

`HANDOFF_DELIVERED`

Management should acknowledge receipt and independently verify the result.

---

## 2. Stage lifecycle

Default sequence:

1. Manager defines Stage.
2. Management receives Stage.
3. Management assigns Sol.
4. Sol implements and self-tests.
5. Sol sends complete packet to management.
6. Management independently reviews actual implementation and evidence.
7. Sol fixes findings.
8. Management rechecks exact SHA.
9. Management reports `READY_FOR_MANAGER_REVIEW`.
10. Manager performs final review.
11. Only after Manager approval: Git closeout.
12. Next Stage starts only after closeout unless explicitly authorized otherwise.

Each substantial Stage should have:

- scope;
- exclusions;
- Gate;
- Done when;
- Self-QA;
- handoff expectations.

Do not add extra Gates solely for hypothetical edge cases.

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
- Google Doc updates;
- Git merge/push after Manager approval.

Do not repeatedly ask the owner for the same authorization.

Ask again only when:

- there is real ambiguity with materially different product/data outcomes;
- the proposed action is a major new scope outside Manager authorization;
- a platform hard gate explicitly requires direct user action in that exact Work.

If a tool/platform explicitly blocks an action, do not bypass the platform policy through another shell/API/tool. Use the shortest legitimate alternative and classify it as a platform limitation rather than a product failure.

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

Do not write status only.

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

Edit the existing document in place.

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

Preferred workflow:

1. Read current document and revision.
2. Use trusted/native read for existing-doc writes.
3. Identify only target paragraphs/structures.
4. Apply targeted update.
5. Use revision guard.
6. Native readback.
7. Verify unrelated structure did not drift.

If the Google Doc cannot be synchronized during an otherwise valid product Stage, record:

`GOOGLE_DOC_SYNC_PENDING`

Do not block working product code solely because a document connector is temporarily unavailable.

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

Current owner deployment policy:

**test before install -> complete backup -> image/install swap -> necessary approved config delta -> installation ends**

After an approved candidate is installed:

- do not run a second installed-version QA campaign;
- do not require owner screenshots/clicks;
- do not proactively launch the installed Dashboard solely for testing;
- do not make post-install HTTP/API/UI/DB/Safe Stop acceptance a completion Gate.

If the application must be stopped for update, stop it as needed and preserve the desired final state. Do not start it solely for QA.

If the owner later encounters a real problem during normal use, fix forward.

"Installed version not re-tested" is not a blocker or PARTIAL under this policy.

---

## 16. Git integration and closeout

After Manager final approval, run Git closeout only.

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

If a repository already has a stronger local rule, keep this document as the cross-project default and link/reference rather than copy-pasting competing text.

---

## 21. Review checklist

Manager/management review should normally answer:

- Is the Stage still solving the authorized problem?
- Does the core behavior work?
- Are important data and protected systems safe?
- Are source identities and null/partial semantics truthful?
- Did the implementation avoid forbidden joins/inference?
- Are tests proportional and meaningful?
- Are source/formal/synthetic/installed evidence boundaries stated honestly?
- Did only intended canonical feature/status rows change?
- Did engineering docs and owner Living Design remain coherent?
- Is the exact reviewed SHA clear?
- Is the next Stage still stopped until authorized?

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

This document is the central cross-project default.

Each repository should either:

- follow it directly; or
- contain a short repository-local reference/override where needed.

Do not copy the full document into every repository unless there is a concrete offline/tooling reason to do so. Repetition creates drift.

Repository product semantics remain authoritative in that repository's canonical engineering design and approved source contracts.
