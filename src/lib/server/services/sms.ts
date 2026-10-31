import { formatSeatingDate, formatSeatingTime } from '$lib/utils/event-time';
import { env } from '../env';
import { logger } from '$lib/server/logger';
import { formatCurrency } from '$lib/utils/currency';

let twilioClient: any = null;

/**
 * Get or create Twilio client
 */
function getTwilioClient() {
	if (!twilioClient) {
		if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_API_KEY_SID || !env.TWILIO_API_KEY_SECRET || !env.TWILIO_PHONE_NUMBER) {
			throw new Error('Twilio is not configured');
		}

		const twilio = require('twilio');
		// region/edge route every request to that Twilio region (e.g. ie1 +
		// dublin for the EU); the API key must have been created there. Unset
		// = Twilio's default region (US1).
		twilioClient = twilio(env.TWILIO_API_KEY_SID, env.TWILIO_API_KEY_SECRET, {
			accountSid: env.TWILIO_ACCOUNT_SID,
			...(env.TWILIO_REGION ? { region: env.TWILIO_REGION } : {}),
			...(env.TWILIO_EDGE ? { edge: env.TWILIO_EDGE } : {}),
		});
	}

	return twilioClient;
}

/**
 * Check if Twilio SMS is enabled
 */
export function isTwilioEnabled(): boolean {
	return !!(
		env.TWILIO_ACCOUNT_SID &&
		env.TWILIO_API_KEY_SID &&
		env.TWILIO_API_KEY_SECRET &&
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
 * The language a Guest-facing SMS is written in (issue 027): `fr` for
 * French, `en` or null for English, as in the guest emails (issue 026).
 */
type SmsLocale = 'fr' | 'en' | null;

/** An Event may be published with one of its titles missing (ADR 0008): the
 * SMS fall back to the other language's title, like the emails (026). */
function eventTitleOf(
	event: { titleEn?: string | null; titleFr?: string | null },
	lang: 'fr' | 'en'
): string {
	return lang === 'fr'
		? event.titleFr || event.titleEn || ''
		: event.titleEn || event.titleFr || '';
}

/**
 * Send ticket confirmation SMS
 */
export async function sendTicketConfirmationSMS(options: {
	phone: string;
	guestName: string;
	event: { titleEn?: string | null; titleFr?: string | null };
	sessionStartTime: Date;
	/** The Event's Time Zone. */
	timeZone: string;
	accessToken: string;
	/** Issue 027: the SMS is written in the Guest's language. */
	locale?: SmsLocale;
}): Promise<void> {
	const lang = options.locale ?? 'en';
	// On the Event's clock (ADR 0006), never the server's.
	const formattedDate = formatSeatingDate(options.sessionStartTime, options.timeZone, lang, {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = formatSeatingTime(options.sessionStartTime, options.timeZone, lang);

	const message =
		lang === 'fr'
			? `🎫 ${eventTitleOf(options.event, lang)}

Bonjour ${options.guestName} ! Vos billets sont confirmés.

📅 ${formattedDate} à ${formattedTime}

Vos billets : ${env.PUBLIC_URL}/tickets/${options.accessToken}

Présentez votre QR code à l'entrée. À bientôt !`
			: `🎫 ${eventTitleOf(options.event, lang)}

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
	event: { titleEn?: string | null; titleFr?: string | null };
	sessionStartTime: Date;
	/** The Event's Time Zone. */
	timeZone: string;
	accessToken: string;
	daysUntil: number;
	/** Issue 027: the SMS is written in the Guest's language. */
	locale?: SmsLocale;
}): Promise<void> {
	const lang = options.locale ?? 'en';
	// On the Event's clock (ADR 0006), never the server's.
	const formattedDate = formatSeatingDate(options.sessionStartTime, options.timeZone, lang, {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = formatSeatingTime(options.sessionStartTime, options.timeZone, lang);

	const timePhrase =
		options.daysUntil === 1 ? 'tomorrow' : `in ${options.daysUntil} days`;
	const timePhraseFr =
		options.daysUntil === 1 ? 'demain' : `dans ${options.daysUntil} jours`;

	const message =
		lang === 'fr'
			? `🔔 Rappel : ${eventTitleOf(options.event, lang)}

Bonjour ${options.guestName} ! Votre événement a lieu ${timePhraseFr}.

📅 ${formattedDate} à ${formattedTime}

Vos billets : ${env.PUBLIC_URL}/tickets/${options.accessToken}`
			: `🔔 Reminder: ${eventTitleOf(options.event, lang)}

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
	event: { titleEn?: string | null; titleFr?: string | null };
	eventTime: Date;
	/** The Event's Time Zone. */
	timeZone: string;
	/** Issue 027: the SMS is written in the Guest's language. */
	locale?: SmsLocale;
}): Promise<void> {
	const lang = options.locale ?? 'en';
	// On the Event's clock (ADR 0006), never the server's.
	const formattedDate = formatSeatingDate(options.eventTime, options.timeZone, lang, {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = formatSeatingTime(options.eventTime, options.timeZone, lang);

	const message =
		lang === 'fr'
			? `🔔 Rappel billets : ${eventTitleOf(options.event, lang)}

Bonjour ${options.name} ! Voici un rappel pour votre événement à venir.

📅 ${formattedDate} à ${formattedTime}

N'oubliez pas vos billets ! À bientôt.`
			: `🔔 Ticket Reminder: ${eventTitleOf(options.event, lang)}

Hi ${options.name}! Here's a reminder for your upcoming event.

📅 ${formattedDate} at ${formattedTime}

Don't forget to bring your tickets! See you there.`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send cancellation SMS (no refund involved, e.g. a comp Reservation or an
 * Admin cancellation with no payment attached)
 */
export async function sendCancellationSMS(options: {
	phone: string;
	name: string;
	event: { titleEn?: string | null; titleFr?: string | null };
	sessionStartTime: Date;
	/** The Event's Time Zone. */
	timeZone: string;
	/** Issue 027: the SMS is written in the Guest's language. */
	locale?: SmsLocale;
}): Promise<void> {
	const lang = options.locale ?? 'en';
	// On the Event's clock (ADR 0006), never the server's.
	const formattedDate = formatSeatingDate(options.sessionStartTime, options.timeZone, lang, {
		month: 'short',
		day: 'numeric',
	});
	const formattedTime = formatSeatingTime(options.sessionStartTime, options.timeZone, lang);

	const message =
		lang === 'fr'
			? `Réservation annulée : ${eventTitleOf(options.event, lang)}

Bonjour ${options.name}, votre réservation du ${formattedDate} à ${formattedTime} a été annulée.

Une question ? Contactez-nous.`
			: `Reservation Cancelled: ${eventTitleOf(options.event, lang)}

Hi ${options.name}, your reservation for ${formattedDate} at ${formattedTime} has been cancelled.

Questions? Contact us.`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send refund SMS (Reservation cancelled and fully or partially refunded)
 */
export async function sendRefundSMS(options: {
	phone: string;
	name: string;
	event: { titleEn?: string | null; titleFr?: string | null };
	amount: number;
	currency: string;
	/** Issue 027: the SMS is written in the Guest's language. */
	locale?: SmsLocale;
}): Promise<void> {
	const lang = options.locale ?? 'en';
	const money = formatCurrency(options.amount, options.currency, lang === 'fr' ? 'fr-FR' : 'en-US');

	const message =
		lang === 'fr'
			? `💳 Remboursement effectué : ${eventTitleOf(options.event, lang)}

Bonjour ${options.name}, votre réservation a été annulée et ${money} a été remboursé.

Comptez 5 à 10 jours ouvrables pour le voir sur votre relevé.`
			: `💳 Refund Processed: ${eventTitleOf(options.event, lang)}

Hi ${options.name}, your reservation has been cancelled and ${money} has been refunded.

It may take 5-10 business days to appear on your statement.`;

	await sendSMS({
		to: formatPhoneNumber(options.phone),
		message,
	});
}

/**
 * Send staff invitation SMS with password reset link
 */
export async function sendStaffInviteSMS(options: {
    phone: string;
    firstName: string;
    resetToken: string;
}): Promise<void> {
    const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${options.resetToken}`;

    const message = `👋 Welcome to the Germinal Team!

Hi ${options.firstName}! You've been invited to join the Germinal staff portal.

Set your password here: ${resetUrl}

This link expires in 24 hours.

Once you've set your password, login at: ${env.PUBLIC_URL}/staff`;

    await sendSMS({
        to: formatPhoneNumber(options.phone),
        message,
    });
}

/**
 * Send staff password reset SMS
 */
export async function sendStaffPasswordResetSMS(options: {
    phone: string;
    resetToken: string;
}): Promise<void> {
    const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${options.resetToken}`;

    const message = `🔑 Reset Your Password

You requested to reset your password for the Germinal staff portal.

Reset your password here: ${resetUrl}

This link expires in 24 hours.

If you didn't request this, please contact your administrator.`;

    await sendSMS({
        to: formatPhoneNumber(options.phone),
        message,
    });
}

/**
 * Send staff event assignment SMS
 */
export async function sendStaffAssignmentSMS(options: {
    phone: string;
    firstName: string;
    eventTitle: string;
    roleName?: string | null;
}): Promise<void> {
    const roleText = options.roleName ? ` as ${options.roleName}` : '';

    const message = `📋 New Assignment

Hi ${options.firstName}! You've been assigned to "${options.eventTitle}"${roleText}.

View details: ${env.PUBLIC_URL}/staff`;

    await sendSMS({
        to: formatPhoneNumber(options.phone),
        message,
    });
}

/**
 * Send staff task assignment SMS
 */
export async function sendTaskAssignmentSMS(options: {
    phone: string;
    firstName: string;
    taskTitle: string;
    eventTitle: string;
    dueDate?: Date | null;
}): Promise<void> {
    const dueText = options.dueDate
        ? ` (due ${options.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
        : '';

    const message = `✅ New Task

Hi ${options.firstName}! You've been given a new task for "${options.eventTitle}": "${options.taskTitle}"${dueText}.

View your tasks: ${env.PUBLIC_URL}/staff`;

    await sendSMS({
        to: formatPhoneNumber(options.phone),
        message,
    });
}
