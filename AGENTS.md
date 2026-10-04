# Local Dashboard engineering rules

Follow [Personal Project Governance](docs/PERSONAL-PROJECT-GOVERNANCE.md) and the current authorized Stage. Product semantics belong to [Project Design](docs/PROJECT-DESIGN.md).

- Sections 1–2 of Personal Project Governance are authoritative for the AI execution workflow: GPT Manager → Management Preflight → Sol Implementation → Luna bounded delegation → Sol integration / Self-QA → Management Independent Review → GPT Manager Final Review. Reuse the two persistent Management/Sol Works; Luna is Sol's delegated worker, with no new persistent Work or approval layer.
- Sol owns `/plan`, implementation, Luna routing/result verification and `HANDOFF_DELIVERED`. Apply canonical Luna scope/STOP/protection rules; only explicitly authorized, frozen closeout/deployment may be delegated. Management reviews the exact integrated SHA independently and returns `READY_FOR_MANAGER_REVIEW`; Luna self-check / Sol Self-QA do not grant independent PASS, merge, deployment or next Stage authorization.
- [Owner Doc Lightweight Sync Policy](docs/PERSONAL-PROJECT-GOVERNANCE.md#74-owner-doc-lightweight-sync-policy) is authoritative: Sol submits `DOC_CHANGE_REQUEST` and never edits Owner Google Docs; Management directly edits only evidence-backed status markers / very short operational identities, and uses comments for content changes. Comments are verified available; do not repeat capability tests. Actual comment failure returns `OWNER_DOC_CONTENT_SYNC_PENDING` / `OWNER_DOC_MANAGER_EDIT_REQUIRED`; full body sync requires separate `OWNER_DOC_BATCH_SYNC` authorization.
- All Dashboard-owned UI wording uses `ui/i18n.mjs` and the shared flat `ui/locale-zh-TW.mjs` / `ui/locale-en.mjs` resources. Every new key includes both locales and identical placeholders in the same change.
- `zh-TW` is the default. The browser preference uses `local-dashboard.locale.v1`; no server/config/DB locale setting.
- Preserve source-authored text, user display names, canonical design text, IDs, timestamps and provenance. Unknown source codes stay raw; known code translations retain the raw code.
- Locale changes update held presentation text only. Never call navigation/show/load/refresh or source/API requests on a locale change. Preserve filters, paging, focus and open dialogs.
- Translate with textContent and allowlisted text attributes; never interpolate translation HTML.
- For any UI change run localization coverage/parity tests and the relevant browser regressions. Keep parser, identity, race, privacy and source assertions intact.
