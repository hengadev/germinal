# Admin Back-Office Improvements

**Status:** Draft
**Date:** 2026-08-10

## Problem Statement

The admin back office is missing some operationally important capabilities — issuing a partial refund, manually creating a Reservation, managing other Admin accounts — and carries data-integrity bugs and duplicated/dead code left over from earlier iterations that were only ever exercised against mock data.

## Solution

Add partial-refund and manual/comp-Reservation capabilities to the Reservation detail view; add an Admin-account management surface alongside the existing Staff one; broaden site settings; add a basic audit trail for destructive actions; fix a recurring schema-field bug that only manifests against a real database; remove dead-redirect pages and duplicated CRUD implementations.

## User Stories

1. As an Admin, I want to refund a partial amount of a Reservation, so that I can resolve disputes without refunding the entire booking.
2. As an Admin, I want to manually create a Reservation (e.g., to comp a seat for a Guest), so that I'm not limited to Guest-initiated bookings for every seat.
3. As an Admin, I want to invite, list, and deactivate other Admin accounts, so that I'm not limited to managing Staff accounts only.
4. As an Admin, I want a settings page that covers more than the homepage hero media, so that I can configure the things I actually need day-to-day.
5. As an Admin, I want a record of who cancelled/refunded a Reservation or deleted an Event/Session/Talent, so that destructive actions are traceable after the fact.
6. As an Admin, I want CSV exports and the analytics/webhooks pages to show correct Event/Session titles when running against the real database, instead of blank values or a crash.
7. As a developer, I want dead pages and duplicated CRUD implementations removed, so a fix applied in one place can't be silently missing from its duplicate.

## Implementation Decisions

- **Module A — Partial refunds.** Extend the existing refund action on the Reservation detail page to accept an amount (defaulting to the full remaining refundable balance, validated against it), reusing the existing Stripe refund and payment-status update path.
- **Module B — Manual/comp Reservations.** A new Admin-initiated Reservation creation path scoped to a specific Session, going through the same capacity-locking logic as Guest checkout but skipping payment collection (or recording a zero-amount/comp Payment), so capacity accounting stays consistent with Guest-initiated bookings.
- **Module C — Admin account management.** List/invite/deactivate UI for Admin-role accounts, mirroring the existing Staff tab's pattern.
- **Module D — Settings expansion.** Extend site settings to cover additional configuration identified during the audit — at minimum, the sender/contact email used in notifications and a maintenance-mode toggle. The exact final field list for this module should be confirmed with the Admin before implementation, since it's the most open-ended module in this PRD.
- **Module E — Audit log.** A new record created on each destructive/sensitive admin action (Reservation cancel/refund, Event/Session/Talent deletion, settings change) capturing who did what and when; surfaced as a simple chronological list, with no filtering/search required initially.
- **Module F — Data-integrity bug fix.** Correct the CSV export, stuck-payments webhook page, and analytics page code paths that currently read a unified title field that doesn't exist in the schema, instead of the actual bilingual title fields — so real-database deployments don't crash or silently blank these columns.
- **Module G — Dead code / duplication cleanup.** Remove the pages that do nothing but redirect while stranding unreachable duplicate CRUD code behind them, and collapse the two parallel Session-CRUD implementations into one.

## Testing Decisions

- No dedicated new automated test-writing tasks are required for this PRD. Existing Reservation/payment integration test patterns should be extended opportunistically if a module's implementer finds it easy to do so (e.g., a partial-refund test alongside the existing full-refund test), but this is not a hard requirement.

## Out of Scope

- The Legal "Mentions légales" placeholder address — blocked on the business acquiring a legal domiciliation solution; no code task exists for this yet.
- Broader RBAC / permission tiers beyond Admin/Staff — not required for the specific gaps identified here.

## Further Notes

- Module F (data-integrity bug fix) is low-effort and high-value — worth doing early regardless of the order chosen for the rest of this PRD, since it is actively broken in any real (non-mock) deployment today.
- Module G should be sequenced after Modules A/B/D, since those touch the same files the dead code removal affects — doing G last minimizes merge conflicts.
