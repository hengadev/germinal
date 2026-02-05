import { env } from '../env';
import { logger } from '$lib/server/logger';

let twilioClient: any = null;

/**
 * Get or create Twilio client
 */
function getTwilioClient() {
	if (!twilioClient) {
		if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
			throw new Error('Twilio is not configured');
		}

		const twilio = require('twilio');
		twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
	}

	return twilioClient;
}

/**
 * Check if Twilio SMS is enabled
 */
export function isTwilioEnabled(): boolean {
	return !!(
		env.TWILIO_ACCOUNT_SID &&
		env.TWILIO_AUTH_TOKEN &&
		env.TWILIO_PHONE_NUMBER
	);
}

/**
 * Send SMS via Twilio
 */
export async function sendSMS(options: {
	to: string; // Phone number in E.164 format (e.g., +1234567890)
	message: string;
}): Promise<void> {
	if (!isTwilioEnabled()) {
		logger.info({ to: options.to }, '📱 SMS would be sent (Twilio not configured)');
		logger.info({ message: options.message }, 'SMS message content');
		return;
	}

	try {
		const client = getTwilioClient();

		await client.messages.create({
			body: options.message,
			from: env.TWILIO_PHONE_NUMBER,
			to: options.to,
		});

		logger.info(`📱 SMS sent successfully to ${options.to}`);
	} catch (error) {
		logger.error({ err: error }, '❌ Failed to send SMS');
		throw error;
	}
}

/**
 * Format phone number to E.164 format
 * This is a simple implementation - consider using a library like libphonenumber-js
 */
export function formatPhoneNumber(phone: string): string {
	// Remove all non-numeric characters
	let cleaned = phone.replace(/\D/g, '');

	// If starts with 0 (local format), assume country code from env or default
	if (cleaned.startsWith('0')) {
		cleaned = cleaned.substring(1);
	}

	// Add + if not present
	if (!cleaned.startsWith('+')) {
		// Default to +1 (US) if no country code, but you should customize this
		cleaned = '+1' + cleaned;
	}

	return cleaned;
}

/**
 * Send ticket confirmation SMS
 */
export async function sendTicketConfirmationSMS(options: {
	phone: string;
	guestName: string;
	eventTitle: string;
	sessionStartTime: Date;
	accessToken: string;
}): Promise<void> {
	const formattedDate = options.sessionStartTime.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = options.sessionStartTime.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const message = `🎫 ${options.eventTitle}

Hi ${options.guestName}! Your tickets are confirmed.

📅 ${formattedDate} at ${formattedTime}

View your tickets: ${env.PUBLIC_URL}/tickets/${options.accessToken}

Present your QR code at the entrance. See you there!`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send event reminder SMS
 */
export async function sendEventReminderSMS(options: {
	phone: string;
	guestName: string;
	eventTitle: string;
	sessionStartTime: Date;
	accessToken: string;
	daysUntil: number;
}): Promise<void> {
	const formattedDate = options.sessionStartTime.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = options.sessionStartTime.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const timePhrase = options.daysUntil === 1 ? 'tomorrow' : `in ${options.daysUntil} days`;

	const message = `🔔 Reminder: ${options.eventTitle}

Hi ${options.guestName}! Your event is coming up ${timePhrase}.

📅 ${formattedDate} at ${formattedTime}

View your tickets: ${env.PUBLIC_URL}/tickets/${options.accessToken}`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send waitlist notification SMS
 */
export async function sendWaitlistNotificationSMS(options: {
	phone: string;
	name: string;
	eventTitle: string;
}): Promise<void> {
	const message = `🎉 Good news ${options.name}!

Tickets are now available for ${options.eventTitle}!

Book now: ${env.PUBLIC_URL}/events

This link is valid for 24 hours.`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send ticket reminder SMS (alias for sendEventReminderSMS with defaults)
 * This is used by the reservations service when resending ticket confirmations
 */
export async function sendTicketReminderSMS(options: {
	phone: string;
	name: string;
	eventTitle: string;
	eventTime: Date;
}): Promise<void> {
	const formattedDate = options.eventTime.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = options.eventTime.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
	});

	const message = `🔔 Ticket Reminder: ${options.eventTitle}

Hi ${options.name}! Here's a reminder for your upcoming event.

📅 ${formattedDate} at ${formattedTime}

Don't forget to bring your tickets! See you there.`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}
