import { formatSeatingDateTime } from '$lib/utils/event-time';
import { db } from '../db';
import { logger } from '$lib/server/logger';
import { waitlist, eventSessions, events } from '../db/schema';
import { eq, and, gt, sql, inArray } from 'drizzle-orm';
import { getSessionById } from './event-sessions';
import { queueEmail } from '../jobs/process-email-queue';
import { env } from '../env';
import { escapeHtml } from '$lib/utils/html';
import { seatingTitle } from '$lib/utils/seating-title';
import { formatCurrency } from '$lib/utils/currency';
import { loadSeatingAccess } from './event-access';
import { ANONYMOUS, waitlistAccess, type WaitlistRefusal } from '$lib/utils/event-access';
import { bookingClosesAt, DEFAULT_BOOKING_WINDOW } from '$lib/utils/booking-window';

/** Thrown when Event access refuses a Seating's Waitlist; `reason` says why. */
export class WaitlistNotAvailableError extends Error {
	constructor(public readonly reason: WaitlistRefusal) {
		super('Waitlist is not available for this session');
		this.name = 'WaitlistNotAvailableError';
	}
}

/**
 * Whether the Seating's Waitlist can be joined or notified now, as Event
 * access (issue 030) decides: never for a Seating of an unpublished Event,
 * an unpublished, unpriced or started Seating, one without a Waitlist, or
 * one outside its Booking Window (035). When allowed, also gives the
 * instant the Seating's Booking Window closes.
 */
async function waitlistDecision(sessionId: string) {
	const found = await loadSeatingAccess(db, sessionId);
	if (!found) return { allowed: false as const, reason: 'seating-unpublished' as const };
	const decision = waitlistAccess({ event: found.event, seating: found.access, viewer: ANONYMOUS, now: new Date() });
	if (!decision.allowed) return decision;
	return {
		allowed: true as const,
		closesAt: bookingClosesAt(found.event.bookingWindow ?? DEFAULT_BOOKING_WINDOW, found.access.startTime),
	};
}

/**
 * Join a waitlist for a sold-out session
 */
export async function joinWaitlist(input: {
	sessionId: string;
	email: string;
	name: string;
	phone?: string;
	quantity: number;
	notificationPreference?: 'email' | 'sms' | 'both';
}) {
	const decision = await waitlistDecision(input.sessionId);
	if (!decision.allowed) {
		throw new WaitlistNotAvailableError(decision.reason);
	}

	// Check if already on waitlist (not yet notified)
	const existing = await db.query.waitlist.findFirst({
		where: and(
			eq(waitlist.eventSessionId, input.sessionId),
			eq(waitlist.email, input.email),
			eq(waitlist.notified, false)
		),
	});

	if (existing) {
		throw new Error('You are already on the waitlist for this session');
	}

	// Add to waitlist: it expires in 7 days, or when the Seating's Booking
	// Window closes (035) if that comes first.
	const expiresAt = new Date(Math.min(Date.now() + 7 * 24 * 60 * 60 * 1000, decision.closesAt.getTime()));

	const [entry] = await db.insert(waitlist).values({
		eventSessionId: input.sessionId,
		email: input.email,
		name: input.name,
		phone: input.phone ?? null,
		notificationPreference: input.notificationPreference ?? 'both',
		quantity: input.quantity,
		expiresAt,
	}).returning();

	return entry;
}

/**
 * Expire the Waitlist entries, not yet notified, of every Seating whose
 * Booking Window has closed (issue 035): once a Seating's bookings close,
 * its Waitlist stops. Run by the `expire-closed-waitlists` job; also
 * catches Seatings whose window an Admin moved after Guests joined.
 */
export async function expireClosedWaitlistEntries(now: Date = new Date()): Promise<{ expired: number }> {
	const closedSeatings = db
		.select({ id: eventSessions.id })
		.from(eventSessions)
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(
			sql`${eventSessions.startTime} - make_interval(hours => coalesce(${events.bookingClosesHoursBefore}, 0)) <= ${now.toISOString()}::timestamptz`
		);
	const expired = await db
		.update(waitlist)
		.set({ expiresAt: now })
		.where(and(
			eq(waitlist.notified, false),
			gt(waitlist.expiresAt, now),
			inArray(waitlist.eventSessionId, closedSeatings)
		))
		.returning({ id: waitlist.id });
	return { expired: expired.length };
}

/**
 * Notify waitlist entries when capacity becomes available
 * Called after reservations are cancelled or expire
 */
export async function notifyWaitlist(sessionId: string, availableCapacity: number) {
	// Nobody is invited to book a Seating Event access would refuse.
	if (!(await waitlistDecision(sessionId)).allowed) {
		return { notified: 0 };
	}

	// Get unnotified, non-expired waitlist entries
	const entries = await db.query.waitlist.findMany({
		where: and(
			eq(waitlist.eventSessionId, sessionId),
			eq(waitlist.notified, false),
			gt(waitlist.expiresAt, new Date())
		),
		orderBy: [waitlist.createdAt], // First come, first served
		with: {
			eventSession: true,
		},
	});

	let remaining = availableCapacity;
	const toNotify: typeof entries = [];

	for (const entry of entries) {
		if (remaining >= entry.quantity) {
			toNotify.push(entry);
			remaining -= entry.quantity;
		}
		if (remaining === 0) break;
	}

	if (toNotify.length === 0) {
		return { notified: 0 };
	}

	const session = await getSessionById(sessionId);

	// Send notification emails and track successful notifications
	let notifiedCount = 0;
	for (const entry of toNotify) {
		try {
			// Use optimistic locking: only update if still not notified
			// This prevents race conditions when multiple reservations expire simultaneously
			const [updated] = await db.update(waitlist)
				.set({
					notified: true,
					notifiedAt: new Date(),
				})
				.where(and(
					eq(waitlist.id, entry.id),
					eq(waitlist.notified, false) // Only update if still false
				))
				.returning();

			// Only send notification if we successfully marked it as notified
			if (updated) {
				await sendWaitlistNotification(entry, session);
				notifiedCount++;
			}
		} catch (error) {
			logger.error('Failed to notify waitlist entry:', entry.id, error);
		}
	}

	return { notified: notifiedCount };
}

/** A Seating with its Event's id and Time Zone (ADR 0006: times on the Event's clock). */
type SessionWithEvent = typeof eventSessions.$inferSelect & { event: { id: string; timeZone: string } };

/** Unit price from the Seating's Service (issue 022); null when not set. */
type UnitPrice = { amount: number; currency: string } | null;

function formatUnitPrice(price: UnitPrice): string {
	return price ? formatCurrency(price.amount, price.currency) : 'Price to be announced';
}

/**
 * Generate waitlist notification email
 */
function generateWaitlistTextTemplate(entry: typeof waitlist.$inferSelect, session: SessionWithEvent, price: UnitPrice): string {
	return `
Good news, ${entry.name}!

Tickets are now available for:

${seatingTitle(session, 'en', { timeZone: session.event.timeZone })}
${formatSeatingDateTime(session.startTime, session.event.timeZone, 'en')}
${formatUnitPrice(price)} per ticket

You requested ${entry.quantity} ticket(s). Please book soon as availability is limited.

Book now: ${env.PUBLIC_URL}/events/${session.event.id}

This link is valid for 24 hours.
  `.trim();
}

function generateWaitlistHtmlTemplate(entry: typeof waitlist.$inferSelect, session: SessionWithEvent, price: UnitPrice): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tickets Available!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">🎉 Good news!</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Tickets are now available</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(entry.name)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Tickets for <strong>${escapeHtml(seatingTitle(session, 'en', { timeZone: session.event.timeZone }))}</strong> are now available!</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(seatingTitle(session, 'en', { timeZone: session.event.timeZone }))}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(session.startTime, session.event.timeZone, 'en')}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatUnitPrice(price)} per ticket
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 16px 0; font-size: 14px;">
      You requested <strong>${entry.quantity} ticket(s)</strong>. Please book soon as availability is limited.
    </p>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/events/${session.event.id}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        Book Your Tickets
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d; text-align: center;">
      This link is valid for 24 hours.
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      This is an automated notification from Germinal.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send waitlist notification email
 */
async function sendWaitlistNotificationEmail(
	entry: typeof waitlist.$inferSelect & { eventSession: typeof eventSessions.$inferSelect },
	session: SessionWithEvent
) {
	const { getSeatingPrice } = await import('./service-pricing');
	const price = await getSeatingPrice(db, session.id);
	const textBody = generateWaitlistTextTemplate(entry, session, price);
	const htmlBody = generateWaitlistHtmlTemplate(entry, session, price);

	await queueEmail({
		type: 'contact_notification',
		recipient: entry.email,
		subject: `Tickets Available for ${seatingTitle(session, 'en', { timeZone: session.event.timeZone })}`,
		textBody,
		htmlBody,
		metadata: {
			waitlistEntryId: entry.id,
			sessionId: session.id,
		},
	});
}

/**
 * Send waitlist notification (both email and SMS based on preference)
 */
export async function sendWaitlistNotification(
	entry: typeof waitlist.$inferSelect & { eventSession: typeof eventSessions.$inferSelect },
	session: SessionWithEvent
) {
	// Send email if user prefers email or both
	if (entry.notificationPreference !== 'sms') {
		await sendWaitlistNotificationEmail(entry, session);
	}

	// Send SMS if user prefers SMS or both, and has a phone number
	if (entry.phone && entry.notificationPreference !== 'email') {
		try {
			const { sendWaitlistNotificationSMS } = await import('./sms');
			await sendWaitlistNotificationSMS({
				phone: entry.phone,
				name: entry.name,
				eventTitle: seatingTitle(session, 'en', { timeZone: session.event.timeZone }),
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send waitlist notification SMS');
			// Don't throw - email might have been sent
		}
	}
}
