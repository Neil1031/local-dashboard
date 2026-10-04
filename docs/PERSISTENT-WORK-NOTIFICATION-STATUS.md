# Persistent Work Notification Status

This file tracks whether each persistent Work pair has already received the current shared workflow notice.

Current shared notice version:

`sol-luna-bounded-delegation-v1`

Authoritative workflow: [Personal Project Governance, sections 1–2](PERSONAL-PROJECT-GOVERNANCE.md#1-project-execution-model). This file records delivery only; it does not define another workflow or approval Gate. The new notice adds bounded Luna delegation and concise Management Preflight; existing combined-closeout rules remain applicable.

## Rule

- A persistent Work pair is notified once when it first uses a new shared workflow rule.
- After notification, update this file to `NOTIFIED`; later Stages using the same rule do not repeat the notice.
- A new persistent Work/topic starts as `NOT_NOTIFIED`. Notify it once, then update this file.
- If the shared workflow rule changes materially, bump the notice version and notify each affected persistent Work pair once for the new version.
- Stage-specific differences and STOP conditions are still stated in each Stage instruction.

## Current status

No notification for this version has been sent by the documentation update. Notify each affected existing pair once when it first uses the rule, under explicit messaging authorization; do not create new Works or mark a written document as a delivered message.

| Topic / persistent Work pair | Management Work | Sol Work | Notice version | Status | Last notification |
|---|---|---|---|---|---|
| TW | `01a0f900-c724-7502-a0ab-eb799e1f11d3` | `01a0f902-e4c9-7753-a3c4-27cb0894e7bf` | `sol-luna-bounded-delegation-v1` | **NOT_NOTIFIED** | — |
| Dashboard | `01a0de9a-1854-7280-a92d-ebebf41f7663` | `01a0f108-865e-7091-b88d-333228144bfe` | `sol-luna-bounded-delegation-v1` | **NOT_NOTIFIED** | — |

Other project pairs are not inventoried in this register; absence is not evidence of notification. Add their existing identities when first adopting the notice.

## Prior notice history

These records prove delivery of the prior notice only, not the current version.

| Topic / persistent Work pair | Management Work | Sol Work | Notice version | Status | Last notification |
|---|---|---|---|---|---|
| TW | `01a0f900-c724-7502-a0ab-eb799e1f11d3` | `01a0f902-e4c9-7753-a3c4-27cb0894e7bf` | `streamlined-combined-closeout-v1` | **NOTIFIED** | 2026-10-04 |
| Dashboard | `01a0de9a-1854-7280-a92d-ebebf41f7663` | `01a0f108-865e-7091-b88d-333228144bfe` | `streamlined-combined-closeout-v1` | **NOTIFIED** | 2026-10-04 |

## Streamlined combined-closeout summary

For a Work pair already marked `NOTIFIED`, future combined closeout instructions should state only:

1. frozen accepted SHA / expected live main / exact runtime or config delta;
2. Stage-specific Design Sync changes;
3. Stage-specific formal-read allowance;
4. required proportional validation;
5. STOP conditions;
6. final handoff identities.

The persistent Work reuses existing governance for no-ff Git closeout, complete rollback backup, installed/source protection, truthful external-writer handling, final identity verification, and no unauthorized next Stage.
