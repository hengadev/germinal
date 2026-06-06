# 011 — i18n: replace hardcoded English strings

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Several UI strings in the public site are hardcoded in English, bypassing the i18n system. A French-speaking visitor who has switched the locale to French will still see these strings in English. Add the missing translation keys to both the `en` and `fr` message files, then replace the hardcoded literals in the templates.

Strings to localise:

| Location | Hardcoded string | Suggested key |
|---|---|---|
| Events listing filter bar | `"All"` | `events.filterAll` |
| Talents listing filter bar | `"All"` | `talents.filterAll` |
| Events list-view row | `"View Details"` | `events.viewDetails` |
| Talents list-view row | `"View Details"` | `talents.viewDetails` |
| Events listing empty category state | `"No events found in this category."` | `events.noEventsInCategory` |
| Talents listing empty category state | `"No talents found in this category."` | `talents.noTalentsInCategory` |

Add the corresponding French translations for each key.

## Acceptance criteria

- [ ] Switching the locale to French on the events listing page shows all filter, label, and empty-state strings in French.
- [ ] Switching the locale to French on the talents listing page shows all filter, label, and empty-state strings in French.
- [ ] Zero hardcoded English strings remain for the six items listed above.
- [ ] The English locale still displays correct English text for all six items.

## Parent

docs/prd/frontend-design-polish.md — Module 9
