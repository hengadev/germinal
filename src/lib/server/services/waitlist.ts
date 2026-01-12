import { db } from '../db';
import { waitlist, eventSessions } from '../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { getSessionById } from './event-sessions';
import { queueEmail } from '../jobs/process-email-queue';
import { env } from '../env';
import { escapeHtml } from '$lib/utils/html';

/**
 * Join a waitlist for a sold-out session
 */
export async function joinWaitlist(input: {
	sessionId: string;
	email: string;
	name: string;
	phone?: string;
	quantity: number;
}) {
	const session = await getSessionById(input.sessionId);

	if (!session.allowWaitlist) {
		throw new Error('Waitlist is not available for this session');
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

	// Add to waitlist (expires in 7 days)
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	const [entry] = await db.insert(waitlist).values({
		eventSessionId: input.sessionId,
		email: input.email,
		name: input.name,
		phone: input.phone ?? null,
		quantity: input.quantity,
		expiresAt,
	}).returning();

	return entry;
}

/**
 * Notify waitlist entries when capacity becomes available
 * Called after reservations are cancelled or expire
 */
export async function notifyWaitlist(sessionId: string, availableCapacity: number) {
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

			// Only send email if we successfully marked it as notified
			if (updated) {
				await sendWaitlistNotificationEmail(entry, session);
				notifiedCount++;
			}
		} catch (error) {
			console.error('Failed to notify waitlist entry:', entry.id, error);
		}
	}

	return { notified: notifiedCount };
}

/**
 * Generate waitlist notification email
 */
function generateWaitlistTextTemplate(entry: typeof waitlist.$inferSelect, session: typeof eventSessions.$inferSelect): string {
	return `
Good news, ${entry.name}!

Tickets are now available for:

${session.title}
${session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
${session.priceAmount / 100}${session.currency} per ticket

You requested ${entry.quantity} ticket(s). Please book soon as availability is limited.

Book now: ${env.PUBLIC_URL}/events/${session.event?.slug ?? ''}

This link is valid for 24 hours.
  `.trim();
}

function generateWaitlistHtmlTemplate(entry: typeof waitlist.$inferSelect, session: typeof eventSessions.$inferSelect): string {
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
    <p style="margin: 0 0 16px 0; font-size: 16px;">Tickets for <strong>${escapeHtml(session.title)}</strong> are now available!</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(session.title)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${session.priceAmount / 100}${session.currency} per ticket
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 16px 0; font-size: 14px;">
      You requested <strong>${entry.quantity} ticket(s)</strong>. Please book soon as availability is limited.
    </p>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/events/${session.event?.slug ?? ''}"
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
	entry: typeof waitlist.$inferSelect & { eventSession: typeof eventSessions.$inferSelect & { event: { slug: string } | null } },
	session: typeof eventSessions.$inferSelect & { event: { slug: string } | null }
) {
	const textBody = generateWaitlistTextTemplate(entry, session);
	const htmlBody = generateWaitlistHtmlTemplate(entry, session);

	await queueEmail({
		type: 'contact_notification',
		recipient: entry.email,
		subject: `Tickets Available for ${session.title}`,
		textBody,
		htmlBody,
		metadata: {
			waitlistEntryId: entry.id,
			sessionId: session.id,
		},
	});
}
