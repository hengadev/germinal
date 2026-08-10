# Notifications & Reliability

**Status:** Draft
**Date:** 2026-08-10

## Problem Statement

Several operationally important notifications are simply never sent: Guests aren't told when their Reservation is cancelled or refunded, and Staff aren't told when they're assigned a Task or an Event. There are also two independent, drifting implementations of the "send Event reminders" feature, and Stripe dispute/chargeback events are silently dropped with no Admin visibility.

## Solution

Add the missing Guest and Staff notifications, consolidate the reminder system down to one implementation, and add basic handling and Admin visibility for Stripe disputes.

## User Stories

1. As a Guest, I want to receive an email (and SMS, if I opted in) when my Reservation is cancelled or refunded, so that I have confirmation without checking my bank statement.
2. As a Staff member, I want to be notified when I'm assigned to an Event or given a new Task, so that I don't have to keep checking the portal proactively.
3. As a developer, I want a single, canonical Event-reminder implementation, so that fixing a bug or changing the reminder copy doesn't require finding and updating two different code paths.
4. As an Admin, I want to be alerted when a payment is disputed or charged back, so that I'm not caught unaware by a Stripe dispute.

## Implementation Decisions

- **Module A — Guest cancellation/refund notifications.** Wire the existing cancellation and refund code paths (Guest self-service cancel, Admin cancel, Admin refund, and the Stripe refund webhook) to send a notification through the existing email/SMS notification infrastructure, following the same pattern as the existing Ticket-confirmation notification.
- **Module B — Staff assignment notifications.** Wire Task creation/assignment and event-Staff assignment to send a notification to the affected Staff member, using the existing notification infrastructure.
- **Module C — Reminder system consolidation.** Choose one of the two existing reminder implementations as canonical — the scheduled background-job version, since it runs automatically without depending on an external scheduler being separately configured — and remove the other, including its separate HTTP-triggered endpoint and its divergent email template.
- **Module D — Stripe dispute handling.** Handle the dispute-related Stripe webhook events by recording the dispute against the relevant Payment and notifying an Admin, rather than silently no-op'ing as today.

## Testing Decisions

- Per the agreed test scope, notification dispatch is not required to get dedicated new automated tests as part of this PRD; verification is manual — trigger each flow and confirm the notification is sent/logged.
- Module C's consolidation should be verified manually against the existing reminder-flag fields on Reservations to confirm no regression in reminder timing or double-sending; no new automated test is required.

## Out of Scope

- Any new notification channels beyond the existing email/SMS infrastructure.
- General notification-queue alerting/dead-letter handling beyond what Module D adds specifically for disputes.

## Further Notes

- Module C should be resolved before Modules A/B are extended further, to avoid layering new notification logic on top of two competing reminder systems.
