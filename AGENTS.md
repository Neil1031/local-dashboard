# Local Dashboard engineering rules

Follow [Personal Project Governance](docs/PERSONAL-PROJECT-GOVERNANCE.md) and the current authorized Stage. Product semantics belong to [Project Design](docs/PROJECT-DESIGN.md).

- All Dashboard-owned UI wording uses `ui/i18n.mjs` and the shared flat `ui/locale-zh-TW.mjs` / `ui/locale-en.mjs` resources. Every new key includes both locales and identical placeholders in the same change.
- `zh-TW` is the default. The browser preference uses `local-dashboard.locale.v1`; no server/config/DB locale setting.
- Preserve source-authored text, user display names, canonical design text, IDs, timestamps and provenance. Unknown source codes stay raw; known code translations retain the raw code.
- Locale changes update held presentation text only. Never call navigation/show/load/refresh or source/API requests on a locale change. Preserve filters, paging, focus and open dialogs.
- Translate with textContent and allowlisted text attributes; never interpolate translation HTML.
- For any UI change run localization coverage/parity tests and the relevant browser regressions. Keep parser, identity, race, privacy and source assertions intact.
