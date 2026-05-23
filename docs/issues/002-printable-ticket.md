# 002 — Printable Ticket

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

The ticket page (`/tickets/[token]`) gains a clean print layout so Guests can save or print their Ticket as a PDF using the browser's native print dialog. No server-side PDF generation, no new dependencies.

`@media print` styles are added scoped to the ticket page. They hide everything except the ticket content: QR code (rendered at full width), event title, Session date/time and venue, Guest name, seat quantity, and Reservation reference. Navigation, header, footer, the calendar download button, and any promotional chrome are hidden.

The existing Print/Download button (already present in the UI with a `Printer` icon) is wired to `window.print()`. No new button or UI element is added.

## Acceptance criteria

- [ ] Clicking the Print/Download button opens the browser print dialog
- [ ] The print preview shows only: QR code, event title, Session date/time, venue, Guest name, quantity, Reservation reference
- [ ] Navigation, site header, site footer, and the calendar download button are hidden in print preview
- [ ] The printed output is black-on-white with no background colours or decorative imagery
- [ ] The ticket page in normal (screen) view is visually unchanged
- [ ] Works on Chrome, Firefox, and Safari (desktop)

## Parent

docs/prd/pre-launch-readiness.md
