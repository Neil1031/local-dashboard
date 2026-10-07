# Persistent Work Notification Status

This file tracks whether each persistent Work pair has already received the current shared workflow notice.

Current shared notice version:

`global-governance-neil1031-v1`

Authoritative policy: [Personal Project Governance](PERSONAL-PROJECT-GOVERNANCE.md), sections 0 / 3.1 (verified owner/company scope and same-approved-work execution). Owner Doc section 7.4 and Sol/Luna evidence/delegation rules remain applicable. This file records delivery and acknowledgment, not another workflow or approval Gate. Document adoption/readback is tracked separately in [Governance Adoption Status](GOVERNANCE-ADOPTION-STATUS.md).

## Rule

- A persistent Work pair is notified once when it first uses a new shared workflow rule.
- After notification, update this file to `NOTIFIED`; later Stages using the same rule do not repeat the notice.
- A new persistent Work/topic starts as `NOT_NOTIFIED`. Notify it once, then update this file.
- If the shared workflow rule changes materially, bump the notice version and notify each affected persistent Work pair once for the new version.
- Stage-specific differences and STOP conditions are still stated in each Stage instruction.

## Current status — global-governance-neil1031-v1

On 2026-10-08 the owner authorized adoption and notification, with the highest-priority Neil1031/company/fork scope correction. The originating notice was `global-governance-neil1031-20261008`; this register uses the canonical policy version `global-governance-neil1031-v1` for that same decision. The central policy candidate `bcfcdffcff3c8e159c317fb9a4e0c4a3a5864dc5` passed independent review and was normally merged at `36af2e08d3ec259e1c4b12fd16acd52858d09b7a`. Actual local/tracking/live readback and final version delivery were verified.

`NOTIFIED` proves successful delivery to both current Works; `ACKNOWLEDGED` requires actual replies. Neither proves document completion. The active Dashboard Redesign Sol is listed below; its retired predecessor was not restarted. Existing Works were reused and no new Work was created.

| Topic | Management Work | Sol Work | Delivery | Acknowledgment | Date |
|---|---|---|---|---|---|
| TW | `01a0f900-c724-7502-a0ab-eb799e1f11d3` | `01a0f902-e4c9-7753-a3c4-27cb0894e7bf` | NOTIFIED | ACKNOWLEDGED | 2026-10-08 |
| Dashboard | `01a0de9a-1854-7280-a92d-ebebf41f7663` | `01a0f108-865e-7091-b88d-333228144bfe` | NOTIFIED | ACKNOWLEDGED | 2026-10-08 |
| SocialMomentum | `01a0f930-6521-74c2-9df8-026d99e852eb` | `01a0fa57-e3bb-7b13-82d7-ffad799e3de1` | NOTIFIED | ACKNOWLEDGED | 2026-10-08 |
| Insider | `01a0b278-2303-74d2-9075-842008ca4740` | `01a0eb1a-f3be-7a43-8a24-e178cbf7386f` | NOTIFIED | ACKNOWLEDGED | 2026-10-08 |
| Dashboard Redesign | `01a10fd8-198c-7080-a724-323b15143edf` | `01a11478-ba96-7ec3-bb86-f57e2f6be8de` | NOTIFIED | ACKNOWLEDGED | 2026-10-08 |

Local delivery evidence: `.codex/governance-notices/20261008-global-governance-neil1031-delivery.json` and `.codex/governance-updates/20261008/central-activation-delivery.json` under the shared workspace. Do not resend the policy at every Stage or repeat comment-capability probes. Existing historical notices below retain their original version, dates, statuses and meaning.

## Previous notice history — owner-doc-lightweight-sync-v1

The owner authorized the new policy and notification of existing Works on 2026-10-05. All known pairs were initialized `NOT_NOTIFIED` in policy candidate `642e3ac00e7efac718502be5dd1fa8fa4b526e84`, merged at `953291d9dc62dae92a6d83ec744b27248c81194a`. On 2026-10-05, role-specific short notices were successfully submitted to both Works of all four pairs below. `NOTIFIED` records successful submission to both identified Works; reading/acceptance requires an actual reply and is not inferred from submission. Comment capability was tested centrally once; Works were told not to repeat capability probes.

| Topic / persistent Work pair | Management Work | Sol Work | Notice version | Status | Last notification |
|---|---|---|---|---|---|
| TW | `01a0f900-c724-7502-a0ab-eb799e1f11d3` | `01a0f902-e4c9-7753-a3c4-27cb0894e7bf` | `owner-doc-lightweight-sync-v1` | **NOTIFIED** | 2026-10-05 |
| Dashboard | `01a0de9a-1854-7280-a92d-ebebf41f7663` | `01a0f108-865e-7091-b88d-333228144bfe` | `owner-doc-lightweight-sync-v1` | **NOTIFIED** | 2026-10-05 |
| SocialMomentum | `01a0f930-6521-74c2-9df8-026d99e852eb` | `01a0fa57-e3bb-7b13-82d7-ffad799e3de1` | `owner-doc-lightweight-sync-v1` | **NOTIFIED** | 2026-10-05 |
| Insider | `01a0b278-2303-74d2-9075-842008ca4740` | `01a0eb1a-f3be-7a43-8a24-e178cbf7386f` | `owner-doc-lightweight-sync-v1` | **NOTIFIED** | 2026-10-05 |

## Previous notice history — sol-luna-bounded-delegation-v1

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
