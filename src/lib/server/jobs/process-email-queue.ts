import { db } from '../db';
import { emailQueue } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env, isBrevoConfigured } from '../env';
import { emailLogger } from '../logger';
import { getCachedSiteSettings } from '../services/site-settings';
import { sendBrevoEmail } from '../services/brevo';

/**
 * Calculate the next retry time based on exponential backoff
 */
function calculateRetryTime(attempts: number): Date {
	const backoffMinutes = 5 * Math.pow(2, attempts);
	const retryTime = new Date(Date.now() - backoffMinutes * 60 * 1000);
	return retryTime;
}

/**
 * Process pending emails in the queue with exponential backoff retry
 */
export async function processEmailQueue() {
	if (!isBrevoConfigured()) {
		emailLogger.debug('[Email Queue] Brevo not configured, skipping queue processing');
		return { processed: 0, sent: 0, failed: 0 };
	}

	const allPendingEmails = await db.query.emailQueue.findMany({
		where: eq(emailQueue.status, 'pending'),
	});

	const now = new Date();
	const pendingEmails = allPendingEmails.filter((email: { attempts: number; maxAttempts: number; lastAttemptAt: Date | null }) => {
		if (email.attempts >= email.maxAttempts) {
			return false;
		}

		if (!email.lastAttemptAt) {
			return true;
		}

		const retryTime = calculateRetryTime(email.attempts);
		return email.lastAttemptAt < retryTime;
	}).slice(0, 10);

	if (pendingEmails.length === 0) {
		return { processed: 0, sent: 0, failed: 0 };
	}

	emailLogger.info({ count: pendingEmails.length }, '[Email Queue] Processing pending emails');

	let sentCount = 0;
	let failedCount = 0;

	// The sender/contact email is configurable from the admin settings page; fall back to the
	// env-configured default when no override has been set.
	let senderEmail: string = env.SMTP_FROM_EMAIL;
	try {
		const settings = await getCachedSiteSettings();
		if (settings?.senderEmail) {
			senderEmail = settings.senderEmail;
		}
	} catch (err) {
		emailLogger.warn({ err }, '[Email Queue] Failed to read sender email setting, falling back to env default');
	}

	for (const email of pendingEmails) {
		try {
			// Replies go to the contact inbox: the sender (noreply@) has no mailbox.
			await sendBrevoEmail(env.BREVO_API_KEY, {
				sender: { email: senderEmail, name: env.SMTP_FROM_NAME },
				to: [{ email: email.recipient }],
				replyTo: { email: env.CONTACT_EMAIL, name: env.SMTP_FROM_NAME },
				subject: email.subject,
				textContent: email.textBody,
				htmlContent: email.htmlBody,
			});

			// Mark as sent
			await db.update(emailQueue)
				.set({
					status: 'sent',
					sentAt: new Date(),
					lastAttemptAt: new Date(),
				})
				.where(eq(emailQueue.id, email.id));

			emailLogger.info({ emailId: email.id, type: email.type, recipient: email.recipient }, '[Email Queue] Email sent successfully');
			sentCount++;
		} catch (error) {
			const newAttempts = email.attempts + 1;
			const newStatus = newAttempts >= email.maxAttempts ? 'failed' : 'pending';
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';

			await db.update(emailQueue)
				.set({
					attempts: newAttempts,
					status: newStatus,
					lastError: errorMsg,
					lastAttemptAt: new Date(),
				})
				.where(eq(emailQueue.id, email.id));

			const isFinalFailure = newStatus === 'failed';
			emailLogger.error({
				emailId: email.id,
				type: email.type,
				attempt: newAttempts,
				isFinalFailure,
				error: errorMsg,
			}, '[Email Queue] Email send failed');

			failedCount++;
		}
	}

	return { processed: pendingEmails.length, sent: sentCount, failed: failedCount };
}

/**
 * Queue an email for sending (with automatic retry)
 */
export async function queueEmail(data: {
	type: 'ticket_confirmation' | 'contact_notification' | 'event_reminder' | 'admin_invite' | 'staff_invite' | 'staff_password_reset' | 'dispute_alert' | 'reservation_cancelled' | 'reservation_modified' | 'reservation_refunded' | 'staff_assignment' | 'task_assignment';
	recipient: string;
	subject: string;
	textBody: string;
	htmlBody: string;
	metadata?: Record<string, unknown>;
}) {
	await db.insert(emailQueue).values({
		type: data.type,
		recipient: data.recipient,
		subject: data.subject,
		textBody: data.textBody,
		htmlBody: data.htmlBody,
		metadata: data.metadata ? JSON.stringify(data.metadata) : null,
	});

	emailLogger.info({ type: data.type, recipient: data.recipient }, '[Email Queue] Email queued');
}
