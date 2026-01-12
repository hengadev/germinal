import { db } from '../db';
import { emailQueue } from '../db/schema';
import { eq, and, sql, or } from 'drizzle-orm';
import { env, isSMTPEnabled } from '../env';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { emailLogger } from '../logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!transporter) {
		if (!isSMTPEnabled()) {
			throw new Error('SMTP is not configured');
		}

		transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: env.SMTP_SECURE,
			auth: {
				user: env.SMTP_USER,
				pass: env.SMTP_PASSWORD,
			},
		});
	}

	return transporter;
}

/**
 * Process pending emails in the queue with exponential backoff retry
 */
export async function processEmailQueue() {
	if (!isSMTPEnabled()) {
		emailLogger.debug('[Email Queue] SMTP not configured, skipping queue processing');
		return { processed: 0, sent: 0, failed: 0 };
	}

	const pendingEmails = await db.query.emailQueue.findMany({
		where: and(
			eq(emailQueue.status, 'pending'),
			sql`attempts < max_attempts`,
			or(
				sql`last_attempt_at IS NULL`,
				sql`last_attempt_at < NOW() - INTERVAL '5 minutes' * POWER(2, attempts)` // Exponential backoff: 5min, 10min, 20min...
			)
		),
		limit: 10, // Process up to 10 emails at a time
	});

	if (pendingEmails.length === 0) {
		return { processed: 0, sent: 0, failed: 0 };
	}

	emailLogger.info({ count: pendingEmails.length }, '[Email Queue] Processing pending emails');

	let sentCount = 0;
	let failedCount = 0;

	const transport = getTransporter();

	for (const email of pendingEmails) {
		try {
			await transport.sendMail({
				from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
				to: email.recipient,
				subject: email.subject,
				text: email.textBody,
				html: email.htmlBody,
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
	type: 'ticket_confirmation' | 'contact_notification';
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
