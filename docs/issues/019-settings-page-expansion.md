# 019 — Settings page expansion

**Type:** HITL
**Status:** open
**Blocked by:** None

## What to build

Extend the site settings page beyond its current scope (hero image/video only) to cover additional configuration surfaced during the audit — at minimum, the sender/contact email address used in outgoing notifications, and a maintenance-mode toggle. Flagged HITL because the exact final field list should be confirmed with the Admin before implementation, since this module is more open-ended than the others in this PRD.

## Acceptance criteria

- [ ] The final list of settings fields to add has been confirmed with the business owner before implementation begins.
- [ ] Each agreed-upon setting is editable from the settings page and takes effect wherever it's used (e.g. the sender email actually changes what's used for outgoing notifications).
- [ ] Existing hero image/video settings continue to work unchanged.

## Parent

docs/prd/admin-back-office-improvements.md
