# Persistent Work Notification Status

This file tracks whether each persistent Work pair has already received the current shared workflow notice.

Current shared notice version:

`streamlined-combined-closeout-v1`

## Rule

- A persistent Work pair is notified once when it first uses a new shared workflow rule.
- After notification, update this file to `NOTIFIED`; later Stages using the same rule do not repeat the notice.
- A new persistent Work/topic starts as `NOT_NOTIFIED`. Notify it once, then update this file.
- If the shared workflow rule changes materially, bump the notice version and notify each affected persistent Work pair once for the new version.
- Stage-specific differences and STOP conditions are still stated in each Stage instruction.

## Current status

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
