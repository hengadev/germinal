# 018 — Admin account management UI

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add a way to invite, list, and deactivate Admin-role accounts from the admin UI, mirroring the existing Staff-management tab's pattern. Today only Staff accounts can be managed this way; there is no UI path to add or remove another Admin.

## Acceptance criteria

- [ ] An existing Admin can invite a new Admin account (following the same invite-email pattern used for Staff).
- [ ] Existing Admin accounts are listed somewhere in the admin UI.
- [ ] An existing Admin can deactivate another Admin account.
- [ ] The currently-logged-in Admin cannot deactivate their own account (to avoid accidental lockout).

## Parent

docs/prd/admin-back-office-improvements.md
