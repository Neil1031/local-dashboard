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

On 2026-10-04, the owner authorized adoption and notification of the existing project Works. The notice for this version was successfully submitted to both Works in each pair below, referencing accepted candidate `b555f6280a53e79b2177a6386fbd6c81f23c959d` and canonical main merge `4327ebb3aadf2018296efc72eb73be32892fa8e8`. No new Work was created.

`NOTIFIED` records successful notice submission to both identified Works; it does not by itself prove reading or acceptance. Read acknowledgement requires the Work's actual reply. Do not repeat this version's notice solely because another Stage starts.

| Topic / persistent Work pair | Management Work | Sol Work | Notice version | Status | Last notification |
|---|---|---|---|---|---|
| TW | `01a0f900-c724-7502-a0ab-eb799e1f11d3` | `01a0f902-e4c9-7753-a3c4-27cb0894e7bf` | `sol-luna-bounded-delegation-v1` | **NOTIFIED** | 2026-10-04 |
| Dashboard | `01a0de9a-1854-7280-a92d-ebebf41f7663` | `01a0f108-865e-7091-b88d-333228144bfe` | `sol-luna-bounded-delegation-v1` | **NOTIFIED** | 2026-10-04 |
| SocialMomentum | `01a0f930-6521-74c2-9df8-026d99e852eb` | `01a0fa57-e3bb-7b13-82d7-ffad799e3de1` | `sol-luna-bounded-delegation-v1` | **NOTIFIED** | 2026-10-04 |
| Insider | `01a0b278-2303-74d2-9075-842008ca4740` | `01a0eb1a-f3be-7a43-8a24-e178cbf7386f` | `sol-luna-bounded-delegation-v1` | **NOTIFIED** | 2026-10-04 |

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
