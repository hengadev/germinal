# 015 — Fix .title vs titleEn/titleFr bug in export, webhooks, and analytics

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Correct the code paths in the CSV export service, the stuck-payments (webhooks) admin page, and the analytics admin page's real-database mode that currently reference a unified "title" field that does not exist in the schema — Events and Sessions only have separate English/French title fields. Today this throws an error during CSV export when a search term is supplied, and silently produces blank Event/Session names on the webhooks and analytics pages. This bug is low-effort and only manifests against a real database (all three paths were evidently only ever exercised with mock data), so it's worth fixing early and independently of the rest of this PRD.

## Acceptance criteria

- [ ] Exporting reservations to CSV with a search term no longer throws an error, against a real database.
- [ ] The stuck-payments (webhooks) admin page shows the correct Event/Session name for each row, against a real database.
- [ ] The analytics admin page's "top Events by revenue" (and any other title-dependent view) shows correct Event names, against a real database.

## Parent

docs/prd/admin-back-office-improvements.md
