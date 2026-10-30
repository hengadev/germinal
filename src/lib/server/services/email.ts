import { logger } from '$lib/server/logger';
import { env, isBrevoConfigured } from '../env';
import { sendBrevoEmail } from './brevo';
import type { ContactEmailData } from '$lib/types/contact';
import type { TicketEmailData } from '$lib/types/reservations';
import { formatCurrency } from '$lib/utils/currency';
import { escapeHtml, escapeHtmlAttr } from '$lib/utils/html';
import { seatingTitle } from '$lib/utils/seating-title';
import { formatSeatingDateTime } from '$lib/utils/event-time';
import { bookedUnitPriceAmount } from '$lib/utils/seating-price';
import { localizedPracticalInfo } from '$lib/utils/practical-info';

// An Event may be published with English text missing (ADR 0008): the
// emails fall back to the French text rather than print "null".
function eventTitleOf(event: { titleEn: string | null; titleFr: string | null }): string {
	return event.titleEn || event.titleFr || '';
}

function eventLocationOf(event: { locationEn: string | null; locationFr?: string | null }): string {
	return event.locationEn || event.locationFr || '';
}

/** The Event's venue columns the emails may show (issue 040). */
interface VenueAddressEvent {
	locationEn: string | null;
	locationFr?: string | null;
	venueNameEn?: string | null;
	venueNameFr?: string | null;
	streetAddressEn?: string | null;
	streetAddressFr?: string | null;
	cityEn?: string | null;
	cityFr?: string | null;
	countryEn?: string | null;
	countryFr?: string | null;
	postalCode?: string | null;
	practicalInfoEn?: string | null;
	practicalInfoFr?: string | null;
}

/**
 * The venue's name and address (issue 040), one line each: English first —
 * the emails are in English — falling back to the French text. Empty when
 * the Event has no address, so the location line stands in.
 */
function venueAddressLinesOf(event: VenueAddressEvent): string[] {
	const venue = event.venueNameEn || event.venueNameFr || '';
	const street = event.streetAddressEn || event.streetAddressFr || '';
	const cityLine = [event.postalCode ?? '', event.cityEn || event.cityFr || '']
		.filter((part) => part.trim() !== '')
		.join(' ');
	const country = event.countryEn || event.countryFr || '';
	return [venue, street, cityLine, country].map((line) => line.trim()).filter(Boolean);
}

/** Where the email points the Guest: the venue's address when there is
 * one, else the Event's location line. */
function venueOf(event: VenueAddressEvent): string[] {
	const lines = venueAddressLinesOf(event);
	return lines.length > 0 ? lines : [eventLocationOf(event)].filter((line) => line !== '');
}

function formatInquiryType(type: string): string {
	const map: Record<string, string> = {
		collaboration: 'Collaboration',
		new_project: 'New Project',
		join_roster: 'Join Roster',
		other: 'Other',
	};
	return map[type] || type;
}

function generateTextTemplate(data: ContactEmailData): string {
	return `
New Contact Form Submission

From: ${data.name} (${data.email})
${data.company ? `Company/Organization: ${data.company}` : ''}
Inquiry Type: ${formatInquiryType(data.inquiryType)}
Submitted: ${data.submittedAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC

Message:
${data.message}

---
${data.ipAddress ? `IP Address: ${data.ipAddress}` : ''}
This is an automated notification from the Germinal contact form.
  `.trim();
}

function generateHtmlTemplate(data: ContactEmailData): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 24px;">New Contact Form Submission</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Received ${data.submittedAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Name:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(data.name)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Email:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <a href="mailto:${escapeHtmlAttr(data.email)}" style="color: #007bff; text-decoration: none;">${escapeHtml(data.email)}</a>
        </td>
      </tr>
      ${data.company ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Company/Organization:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(data.company)}
        </td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Inquiry Type:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(formatInquiryType(data.inquiryType))}
        </td>
      </tr>
    </table>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <h3 style="margin: 0 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Message:</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px;">
      ${data.ipAddress ? `IP Address: ${data.ipAddress}<br>` : ''}
      This is an automated notification from the Germinal contact form.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export async function sendContactEmail(data: ContactEmailData): Promise<void> {
	if (!isBrevoConfigured()) {
		logger.info({
			to: env.CONTACT_EMAIL,
			from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
			subject: `New Contact Form Submission from ${data.name}`,
			content: generateTextTemplate(data),
		}, '📧 Brevo not configured - email would have been sent');
		return;
	}

	try {
		// Sent through Brevo, not SES; replying from the inbox answers the visitor.
		const messageId = await sendBrevoEmail(env.BREVO_API_KEY, {
			sender: { email: env.SMTP_FROM_EMAIL, name: env.SMTP_FROM_NAME },
			to: [{ email: env.CONTACT_EMAIL }],
			replyTo: { email: data.email, name: data.name },
			subject: `New Contact Form Submission from ${data.name}`,
			textContent: generateTextTemplate(data),
			htmlContent: generateHtmlTemplate(data),
		});
		logger.info({ messageId }, '📧 Contact email sent successfully');
	} catch (error) {
		logger.error({ err: error }, '❌ Failed to send contact email');
		throw new Error('Failed to send email notification');
	}
}

export function generateTicketTextTemplate(data: TicketEmailData): string {
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event);
	const practicalInfo = localizedPracticalInfo(data.event, 'en');

	return `
Your Ticket Confirmation

Hi ${data.guestName},

Your tickets for ${eventTitleOf(data.event)} are confirmed!

EVENT DETAILS:
${seatingTitle(data.session, 'en', { timeZone: data.event.timeZone })}
${formatSeatingDateTime(data.session.startTime, data.event.timeZone, 'en')}
${where.join('\n')}
${practicalInfo ? `\nPRACTICAL INFO:\n${practicalInfo}` : ''}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}
Total: ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}${data.reservation.balanceAmount > 0 ? `
Deposit paid: ${formatCurrency(data.reservation.depositAmount, data.reservation.currency)}
Balance due at the venue: ${formatCurrency(data.reservation.balanceAmount, data.reservation.currency)}` : ''}

VIEW YOUR TICKETS:
${env.PUBLIC_URL}/tickets/${data.accessToken}

Present this link or QR code at the event entrance.
${data.googleCalendarUrl ? `\nADD TO CALENDAR:\n${data.googleCalendarUrl}` : ''}

See you there!

---
This is an automated confirmation from Germinal.
  `.trim();
}

export function generateTicketHtmlTemplate(data: TicketEmailData): string {
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event);
	const practicalInfo = localizedPracticalInfo(data.event, 'en');

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Ticket Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">🎫 Ticket Confirmation</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Order #${data.reservation.id.substring(0, 8)}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Your tickets for <strong>${escapeHtml(eventTitleOf(data.event))}</strong> are confirmed!</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(seatingTitle(data.session, 'en', { timeZone: data.event.timeZone }))}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.session.startTime, data.event.timeZone, 'en')}
        </td>
      </tr>
      ${where.map((line) => `
      <tr>
        <td style="padding: 4px 0; color: #6c757d;">
          ${escapeHtml(line)}
        </td>
      </tr>`).join('')}
    </table>
${practicalInfo ? `
    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Practical Info</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${escapeHtml(practicalInfo)}</p>
` : ''}

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Tickets</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${formatCurrency(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
          ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: 600;">Total</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600;">
          ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>${data.reservation.balanceAmount > 0 ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e9ecef;">Deposit paid</td>
        <td style="padding: 8px 0; border-top: 1px solid #e9ecef; text-align: right;">
          ${formatCurrency(data.reservation.depositAmount, data.reservation.currency)}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600;">Balance due at the venue</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">
          ${formatCurrency(data.reservation.balanceAmount, data.reservation.currency)}
        </td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        View Your Tickets
      </a>
    </div>

    ${data.qrCode ? `
    <div style="margin-top: 24px; text-align: center;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6c757d;">Present this QR code at the event entrance</p>
      <img src="${data.qrCode}" alt="Entry QR Code" width="200" height="200" style="display: block; margin: 0 auto; border: 1px solid #e9ecef; border-radius: 8px;" />
    </div>
    ` : ''}

    ${data.googleCalendarUrl || data.icsUrl ? `
    <div style="margin-top: 24px; text-align: center; border-top: 1px solid #e9ecef; padding-top: 20px;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6c757d; font-weight: 600;">Add to your calendar</p>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        ${data.googleCalendarUrl ? `<a href="${escapeHtmlAttr(data.googleCalendarUrl)}" style="display: inline-block; background-color: #ffffff; border: 1px solid #e9ecef; color: #495057; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 14px;">Google Calendar</a>` : ''}
        ${data.icsUrl ? `<a href="${escapeHtmlAttr(data.icsUrl)}" style="display: inline-block; background-color: #ffffff; border: 1px solid #e9ecef; color: #495057; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 14px;">Download .ics</a>` : ''}
      </div>
    </div>
    ` : ''}
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      This is an automated confirmation from Germinal.<br>
      If you have any questions, please contact us.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export async function sendTicketConfirmationEmail(data: TicketEmailData): Promise<void> {
	// A Walk-in (issue 020) may have no email at all: nobody to send to.
	if (!data.guestEmail) {
		logger.info({ reservationId: data.reservation.id }, '🎫 No guest email - ticket confirmation email skipped');
		return;
	}

	// Generate QR code — non-fatal: email still sends if this fails
	let qrCode: string | undefined;
	try {
		const QRCode = await import('qrcode');
		qrCode = await QRCode.toDataURL(
			`${env.PUBLIC_URL}/tickets/${data.accessToken}`,
			{
				width: 300,
				margin: 2,
				color: {
					dark: '#1a1a1a',
					light: '#ffffff',
				},
			}
		);
	} catch (err) {
		logger.warn({ err }, 'QR code generation failed — sending email without QR code');
	}

	// Generate calendar links
	const { generateGoogleCalendarUrl } = await import('../utils/calendar');
	const googleCalendarUrl = generateGoogleCalendarUrl(data.event, data.session);
	const icsUrl = `${env.PUBLIC_URL}/api/events/${data.event.id}/sessions/${data.session.id}/calendar.ics`;

	const textBody = generateTicketTextTemplate({
		...data,
		qrCode,
		googleCalendarUrl,
		icsUrl,
	});

	const htmlBody = generateTicketHtmlTemplate({
		...data,
		qrCode,
		googleCalendarUrl,
		icsUrl,
	});

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			accessToken: data.accessToken,
			ticketUrl: `${env.PUBLIC_URL}/tickets/${data.accessToken}`,
		}, '🎫 Brevo not configured - ticket confirmation email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'ticket_confirmation',
		recipient: data.guestEmail,
		subject: `Your Tickets - ${eventTitleOf(data.event)}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservation.id,
			accessToken: data.accessToken,
			guestName: data.guestName,
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Ticket confirmation email queued');
}

/**
 * Generate event reminder email text template
 */
export function generateEventReminderTextTemplate(data: TicketEmailData & { daysUntil: number }): string {
	const timePhrase = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event);
	const practicalInfo = localizedPracticalInfo(data.event, 'en');

	return `
Event Reminder: ${eventTitleOf(data.event)}

Hi ${data.guestName},

This is a friendly reminder that your event is coming up ${timePhrase}!

EVENT DETAILS:
${seatingTitle(data.session, 'en', { timeZone: data.event.timeZone })}
${formatSeatingDateTime(data.session.startTime, data.event.timeZone, 'en')}
${where.join('\n')}
${practicalInfo ? `\nPRACTICAL INFO:\n${practicalInfo}` : ''}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}

VIEW YOUR TICKETS:
${env.PUBLIC_URL}/tickets/${data.accessToken}

We look forward to seeing you there!

---
This is an automated reminder from Germinal.
  `.trim();
}

/**
 * Generate event reminder email HTML template
 */
export function generateEventReminderHtmlTemplate(data: TicketEmailData & { daysUntil: number }): string {
	const timePhrase = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event);
	const practicalInfo = localizedPracticalInfo(data.event, 'en');

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">🔔 Event Reminder</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Your event is coming up ${timePhrase}!</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">This is a friendly reminder that <strong>${escapeHtml(eventTitleOf(data.event))}</strong> is coming up ${timePhrase}.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(seatingTitle(data.session, 'en', { timeZone: data.event.timeZone }))}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.session.startTime, data.event.timeZone, 'en')}
        </td>
      </tr>
      ${where.map((line) => `
      <tr>
        <td style="padding: 4px 0; color: #6c757d;">
          ${escapeHtml(line)}
        </td>
      </tr>`).join('')}
    </table>
${practicalInfo ? `
    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Practical Info</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${escapeHtml(practicalInfo)}</p>
` : ''}

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Your Tickets</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${formatCurrency(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}
        </td>
      </tr>
    </table>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        View Your Tickets
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d; text-align: center;">
      We look forward to seeing you there!
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      This is an automated reminder from Germinal.<br>
      If you have any questions, please contact us.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send event reminder email
 */
export async function sendEventReminderEmail(data: TicketEmailData & { daysUntil: number }): Promise<void> {
	// A Walk-in (issue 020) may have no email at all: nobody to remind.
	if (!data.guestEmail) {
		logger.info({ reservationId: data.reservation.id }, '🔔 No guest email - event reminder email skipped');
		return;
	}
	const textBody = generateEventReminderTextTemplate(data);
	const htmlBody = generateEventReminderHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			event: eventTitleOf(data.event),
			daysUntil: data.daysUntil,
		}, '🔔 Brevo not configured - event reminder email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'event_reminder',
		recipient: data.guestEmail,
		subject: `Reminder: ${eventTitleOf(data.event)} is coming up ${data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservation.id,
			accessToken: data.accessToken,
			guestName: data.guestName,
			daysUntil: data.daysUntil.toString(),
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Event reminder email queued');
}

// ============================================
// GUEST CANCELLATION / REFUND EMAILS
// ============================================

export interface CancellationEmailData {
	guestEmail: string | null;
	guestName: string;
	eventTitle: string;
	sessionTitle: string;
	sessionStartTime: Date;
	/** The Event's Time Zone: the Seating's time is shown on its clock. */
	timeZone: string;
	reservationId: string;
}

export interface RefundEmailData {
	guestEmail: string | null;
	guestName: string;
	eventTitle: string;
	sessionTitle: string;
	sessionStartTime: Date;
	/** The Event's Time Zone: the Seating's time is shown on its clock. */
	timeZone: string;
	reservationId: string;
	amount: number;
	currency: string;
	isPartialRefund: boolean;
}

export function generateCancellationTextTemplate(data: CancellationEmailData): string {
	return `
Reservation Cancelled

Hi ${data.guestName},

Your reservation for ${data.eventTitle} has been cancelled.

RESERVATION DETAILS:
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}

Reservation ID: ${data.reservationId.substring(0, 8)}

If you didn't request this cancellation or have any questions, please contact us.

---
This is an automated notification from Germinal.
  `.trim();
}

function generateCancellationHtmlTemplate(data: CancellationEmailData): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Cancelled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Reservation Cancelled</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Reservation #${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Your reservation for <strong>${escapeHtml(data.eventTitle)}</strong> has been cancelled.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Reservation Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      If you didn't request this cancellation or have any questions, please contact us.
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

export interface ModifiedEmailData {
	guestEmail: string | null;
	guestName: string;
	eventTitle: string;
	sessionTitle: string;
	sessionStartTime: Date;
	/** The Event's Time Zone: the Seating's time is shown on its clock. */
	timeZone: string;
	reservationId: string;
	accessToken: string;
	/** Issue 025: the Reservation's language. Null (unknown, Walk-ins,
	 * older Reservations) falls back to English, as before. */
	locale: 'fr' | 'en' | null;
}

export function generateModifiedTextTemplate(data: ModifiedEmailData): string {
	const lang = data.locale ?? 'en';
	if (lang === 'fr') {
		return `
Réservation modifiée

Bonjour ${data.guestName},

Votre réservation pour ${data.eventTitle} a été déplacée vers une autre séance.

NOUVELLE SÉANCE :
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'fr')}

Vos billets restent valables, inutile de réserver à nouveau :
${env.PUBLIC_URL}/tickets/${data.accessToken}

Si vous avez des questions, n'hésitez pas à nous contacter.

---
Ceci est une notification automatique de Germinal.
  `.trim();
	}
	return `
Reservation Modified

Hi ${data.guestName},

Your reservation for ${data.eventTitle} has been moved to another seating.

NEW SEATING:
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}

Your tickets remain valid — no need to book again:
${env.PUBLIC_URL}/tickets/${data.accessToken}

If you have any questions, please contact us.

---
This is an automated notification from Germinal.
  `.trim();
}

function generateModifiedHtmlTemplate(data: ModifiedEmailData): string {
	const lang = data.locale ?? 'en';
	if (lang === 'fr') {
		return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réservation modifiée</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Réservation modifiée</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Réservation #${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Bonjour ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Votre réservation pour <strong>${escapeHtml(data.eventTitle)}</strong> a été déplacée vers une autre séance.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Nouvelle séance</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'fr')}
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Voir vos billets</a>
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      Vos billets restent valables, inutile de réserver à nouveau. Si vous avez des questions, n'hésitez pas à nous contacter.
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      Ceci est une notification automatique de Germinal.
    </p>
  </div>
</body>
</html>
  `.trim();
	}
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Modified</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Reservation Modified</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Reservation #${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Your reservation for <strong>${escapeHtml(data.eventTitle)}</strong> has been moved to another seating.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">New Seating</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View your tickets</a>
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      Your tickets remain valid — no need to book again. If you have any questions, please contact us.
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
 * Notify a Guest that Staff Moved their Reservation to another Seating of
 * the same Service (issue 022): same menu, same price — only the time
 * changed. Their Ticket keeps working, so the email links to it.
 */
export async function sendReservationModifiedEmail(data: ModifiedEmailData): Promise<void> {
	// Without an email (e.g. a Walk-in) there is nobody to notify.
	if (!data.guestEmail) return;
	const textBody = generateModifiedTextTemplate(data);
	const htmlBody = generateModifiedHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			reservationId: data.reservationId,
		}, '📧 Brevo not configured - modified email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	const lang = data.locale ?? 'en';
	await queueEmail({
		type: 'reservation_modified',
		recipient: data.guestEmail,
		subject: lang === 'fr' ? `Réservation modifiée - ${data.eventTitle}` : `Reservation Modified - ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservationId,
			accessToken: data.accessToken,
			guestName: data.guestName,
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Modified reservation email queued');
}

/**
 * Notify a Guest that their Reservation has been cancelled, with no money
 * changing hands (e.g. a comp Reservation, or an Admin cancellation that
 * doesn't involve a refund). For cancellations that also involve a refund,
 * use `sendRefundEmail` instead — it covers both in one notification.
 */
export async function sendCancellationEmail(data: CancellationEmailData): Promise<void> {
	// A Walk-in (issue 020) may have no email: nobody to notify.
	if (!data.guestEmail) return;
	const textBody = generateCancellationTextTemplate(data);
	const htmlBody = generateCancellationHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			reservationId: data.reservationId,
		}, '📧 Brevo not configured - cancellation email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'reservation_cancelled',
		recipient: data.guestEmail,
		subject: `Reservation Cancelled - ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservationId,
			guestName: data.guestName,
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Cancellation email queued');
}

function generateRefundTextTemplate(data: RefundEmailData): string {
	const refundLabel = data.isPartialRefund ? 'Partial Refund Processed' : 'Refund Processed';

	return `
${refundLabel}

Hi ${data.guestName},

Your reservation for ${data.eventTitle} has been cancelled and ${data.isPartialRefund ? 'a partial refund' : 'a refund'} of ${formatCurrency(data.amount, data.currency)} has been processed.

RESERVATION DETAILS:
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}

Reservation ID: ${data.reservationId.substring(0, 8)}
Refund Amount: ${formatCurrency(data.amount, data.currency)}

Refunds typically appear on your statement within 5-10 business days, depending on your bank.

---
This is an automated notification from Germinal.
  `.trim();
}

function generateRefundHtmlTemplate(data: RefundEmailData): string {
	const refundLabel = data.isPartialRefund ? 'Partial Refund Processed' : 'Refund Processed';

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${refundLabel}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">💳 ${escapeHtml(refundLabel)}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Reservation #${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.guestName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      Your reservation for <strong>${escapeHtml(data.eventTitle)}</strong> has been cancelled and
      ${data.isPartialRefund ? 'a partial refund' : 'a refund'} of <strong>${escapeHtml(formatCurrency(data.amount, data.currency))}</strong> has been processed.
    </p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Reservation Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0 0 0; font-weight: 600;">Refund Amount</td>
      </tr>
      <tr>
        <td style="padding: 0 0 8px 0;">${escapeHtml(formatCurrency(data.amount, data.currency))}</td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      Refunds typically appear on your statement within 5-10 business days, depending on your bank.
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
 * Notify a Guest that their Reservation has been cancelled and (fully or
 * partially) refunded. Covers Admin-initiated refunds, the Guest
 * self-service cancellation flow when a refund is issued, and refunds that
 * arrive via the Stripe webhook (disputes, or refunds issued directly in
 * the Stripe dashboard).
 */
export async function sendRefundEmail(data: RefundEmailData): Promise<void> {
	// A Walk-in (issue 020) may have no email: nobody to notify.
	if (!data.guestEmail) return;
	const textBody = generateRefundTextTemplate(data);
	const htmlBody = generateRefundHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			reservationId: data.reservationId,
			amount: data.amount,
			currency: data.currency,
		}, '📧 Brevo not configured - refund email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'reservation_refunded',
		recipient: data.guestEmail,
		subject: data.isPartialRefund
			? `Partial Refund Processed - ${data.eventTitle}`
			: `Refund Processed - ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservationId,
			guestName: data.guestName,
			amount: data.amount.toString(),
			currency: data.currency,
			isPartialRefund: data.isPartialRefund.toString(),
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Refund email queued');
}

// ============================================
// ADMIN DISPUTE ALERT EMAIL
// ============================================

export interface DisputeAlertEmailData {
	stripeDisputeId: string;
	paymentId: string;
	reservationId: string;
	guestName: string;
	guestEmail: string;
	eventTitle: string;
	amount: number;
	currency: string;
	reason: string | null;
	status: string;
	evidenceDueBy: Date | null;
}

function formatDisputeReason(reason: string | null): string {
	if (!reason) return 'Not specified';
	return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDisputeStatus(status: string): string {
	return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function generateDisputeAlertTextTemplate(data: DisputeAlertEmailData): string {
	return `
Stripe Dispute Alert

A payment has been disputed and requires your attention.

Dispute ID: ${data.stripeDisputeId}
Status: ${formatDisputeStatus(data.status)}
Reason: ${formatDisputeReason(data.reason)}
Amount: ${formatCurrency(data.amount, data.currency)}
${data.evidenceDueBy ? `Evidence due by: ${data.evidenceDueBy.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}\n` : ''}
Event: ${data.eventTitle}
Guest: ${data.guestName} (${data.guestEmail})

Payment ID: ${data.paymentId}
Reservation ID: ${data.reservationId}

Please review this dispute in your Stripe dashboard.

---
This is an automated notification from Germinal.
  `.trim();
}

function generateDisputeAlertHtmlTemplate(data: DisputeAlertEmailData): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Dispute Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fdf2f2; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #991b1b; font-size: 24px;">⚠️ Stripe Dispute Alert</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">A payment has been disputed and requires your attention.</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Dispute ID:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(data.stripeDisputeId)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Status:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(formatDisputeStatus(data.status))}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Reason:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(formatDisputeReason(data.reason))}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Amount:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(formatCurrency(data.amount, data.currency))}</td>
      </tr>
      ${data.evidenceDueBy ? `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Evidence due by:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${data.evidenceDueBy.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Event:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(data.eventTitle)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong style="color: #495057;">Guest:</strong></td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; color: #212529;">${escapeHtml(data.guestName)} (${escapeHtml(data.guestEmail)})</td>
      </tr>
      <tr>
        <td style="padding: 8px 0;"><strong style="color: #495057;">Payment ID:</strong></td>
        <td style="padding: 8px 0; color: #212529;">${escapeHtml(data.paymentId)}</td>
      </tr>
    </table>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px;">
      Please review this dispute in your Stripe dashboard.<br>
      This is an automated notification from Germinal.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Notify the Admin (via CONTACT_EMAIL) that a Stripe dispute needs attention.
 * Uses the same reliable queue-with-retry infrastructure as other transactional emails.
 */
export async function sendDisputeAlertEmail(data: DisputeAlertEmailData): Promise<void> {
	const textBody = generateDisputeAlertTextTemplate(data);
	const htmlBody = generateDisputeAlertHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: env.CONTACT_EMAIL,
			disputeId: data.stripeDisputeId,
			paymentId: data.paymentId,
		}, '⚠️ Brevo not configured - dispute alert email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'dispute_alert',
		recipient: env.CONTACT_EMAIL,
		subject: `⚠️ Stripe Dispute: ${formatCurrency(data.amount, data.currency)} — ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			stripeDisputeId: data.stripeDisputeId,
			paymentId: data.paymentId,
			reservationId: data.reservationId,
		},
	});
	logger.info({ disputeId: data.stripeDisputeId }, '📋 Dispute alert email queued');
}

// ============================================
// STAFF INVITE EMAIL
// ============================================

interface StaffInviteEmailData {
	firstName: string;
	lastName: string;
	email: string;
	resetToken: string;
}

function generateStaffInviteTextTemplate(data: StaffInviteEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`;

	return `
Welcome to the Germinal Staff Team!

Hi ${data.firstName},

You have been invited to join the Germinal staff portal. Your account has been created and you can now set your password to get started.

SET YOUR PASSWORD:
${resetUrl}

This link will expire in 24 hours. If you need a new link, please contact your administrator.

Once you've set your password, you can access the staff portal at:
${env.PUBLIC_URL}/staff

We're excited to have you on the team!

---
This is an automated invitation from Germinal.
	`.trim();
}

function generateStaffInviteHtmlTemplate(data: StaffInviteEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the Germinal Staff Team</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Welcome to the Team!</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">You've been invited to join the Germinal staff portal</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.firstName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">You have been invited to join the <strong>Germinal staff portal</strong>. Your account has been created and you can now set your password to get started.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Set Your Password</h3>
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #6c757d;">Click the button below to create your password. This link will expire in 24 hours.</p>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${escapeHtmlAttr(resetUrl)}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        Set Your Password
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 12px; color: #6c757d; text-align: center;">
      Or copy this link: ${resetUrl}
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px;">
      Once you've set your password, you can access the staff portal at:<br>
      <a href="${env.PUBLIC_URL}/staff" style="color: #007bff; text-decoration: none;">${env.PUBLIC_URL}/staff</a>
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px;">
      If you need a new link, please contact your administrator.
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      We're excited to have you on the team!<br>
      This is an automated invitation from Germinal.
    </p>
  </div>
</body>
</html>
	`.trim();
}

export async function sendStaffInviteEmail(data: StaffInviteEmailData): Promise<void> {
	const textBody = generateStaffInviteTextTemplate(data);
	const htmlBody = generateStaffInviteHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.email,
			resetToken: data.resetToken,
			resetUrl: `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`,
		}, '📧 Brevo not configured - staff invite email would have been sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'staff_invite',
		recipient: data.email,
		subject: `Welcome to the Germinal Staff Team`,
		textBody,
		htmlBody,
		metadata: {
			staffEmail: data.email,
			staffName: `${data.firstName} ${data.lastName}`,
			resetToken: data.resetToken,
		},
	});
	logger.info({ to: data.email }, '📋 Staff invite email queued');
}

interface StaffPasswordResetEmailData {
	email: string;
	resetToken: string;
}

function generateStaffPasswordResetTextTemplate(data: StaffPasswordResetEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`;

	return `
Reset Your Password

Hi,

You requested to reset your password for the Germinal staff portal.

RESET YOUR PASSWORD:
${resetUrl}

This link will expire in 24 hours. If you didn't request this change, please contact your administrator.

---
This is an automated notification from Germinal.
	`.trim();
}

function generateStaffPasswordResetHtmlTemplate(data: StaffPasswordResetEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Reset Your Password</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Germinal Staff Portal</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi,</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">You requested to reset your password for the <strong>Germinal staff portal</strong>.</p>

    <p style="margin: 0 0 16px 0; font-size: 14px; color: #6c757d;">Click the button below to set a new password. This link will expire in 24 hours.</p>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${escapeHtmlAttr(resetUrl)}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        Reset Your Password
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 12px; color: #6c757d; text-align: center;">
      Or copy this link: ${resetUrl}
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px;">
      If you didn't request this change, please contact your administrator.
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

export async function sendStaffPasswordResetEmail(data: StaffPasswordResetEmailData): Promise<void> {
	const textBody = generateStaffPasswordResetTextTemplate(data);
	const htmlBody = generateStaffPasswordResetHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.email,
			resetToken: data.resetToken,
			resetUrl: `${env.PUBLIC_URL}/staff/reset-password/${data.resetToken}`,
		}, '📧 Brevo not configured - staff password reset email would have been sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'staff_password_reset',
		recipient: data.email,
		subject: `Reset Your Password - Germinal Staff Portal`,
		textBody,
		htmlBody,
		metadata: {
			staffEmail: data.email,
			resetToken: data.resetToken,
		},
	});
	logger.info({ to: data.email }, '📋 Staff password reset email queued');
}

// ============================================
// ADMIN INVITE EMAIL
// ============================================

interface AdminInviteEmailData {
	firstName: string;
	lastName: string;
	email: string;
	resetToken: string;
}

function generateAdminInviteTextTemplate(data: AdminInviteEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/admin/reset-password/${data.resetToken}`;

	return `
Welcome to the Germinal Admin Team!

Hi ${data.firstName},

You have been invited to join the Germinal admin back office. Your account has been created and you can now set your password to get started.

SET YOUR PASSWORD:
${resetUrl}

This link will expire in 24 hours. If you need a new link, please contact another administrator.

Once you've set your password, you can access the admin back office at:
${env.PUBLIC_URL}/admin

We're excited to have you on the team!

---
This is an automated invitation from Germinal.
	`.trim();
}

function generateAdminInviteHtmlTemplate(data: AdminInviteEmailData): string {
	const resetUrl = `${env.PUBLIC_URL}/admin/reset-password/${data.resetToken}`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the Germinal Admin Team</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">Welcome to the Team!</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">You've been invited to join the Germinal admin back office</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.firstName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">You have been invited to join the <strong>Germinal admin back office</strong>. Your account has been created and you can now set your password to get started.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Set Your Password</h3>
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #6c757d;">Click the button below to create your password. This link will expire in 24 hours.</p>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${escapeHtmlAttr(resetUrl)}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        Set Your Password
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 12px; color: #6c757d; text-align: center;">
      Or copy this link: ${resetUrl}
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px;">
      Once you've set your password, you can access the admin back office at:<br>
      <a href="${env.PUBLIC_URL}/admin" style="color: #007bff; text-decoration: none;">${env.PUBLIC_URL}/admin</a>
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px;">
      If you need a new link, please contact another administrator.
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      We're excited to have you on the team!<br>
      This is an automated invitation from Germinal.
    </p>
  </div>
</body>
</html>
	`.trim();
}

export async function sendAdminInviteEmail(data: AdminInviteEmailData): Promise<void> {
	const textBody = generateAdminInviteTextTemplate(data);
	const htmlBody = generateAdminInviteHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.email,
			resetToken: data.resetToken,
			resetUrl: `${env.PUBLIC_URL}/admin/reset-password/${data.resetToken}`,
		}, '📧 Brevo not configured - admin invite email would have been sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'admin_invite',
		recipient: data.email,
		subject: `Welcome to the Germinal Admin Team`,
		textBody,
		htmlBody,
		metadata: {
			adminEmail: data.email,
			adminName: `${data.firstName} ${data.lastName}`,
			resetToken: data.resetToken,
		},
	});
	logger.info({ to: data.email }, '📋 Admin invite email queued');
}

// ============================================
// STAFF ASSIGNMENT EMAIL
// ============================================

interface StaffAssignmentEmailData {
	firstName: string;
	lastName: string;
	email: string;
	eventTitle: string;
	roleName?: string | null;
}

function generateStaffAssignmentTextTemplate(data: StaffAssignmentEmailData): string {
	const portalUrl = `${env.PUBLIC_URL}/staff`;

	return `
You've Been Assigned to an Event

Hi ${data.firstName},

You have been assigned to "${data.eventTitle}"${data.roleName ? ` as ${data.roleName}` : ''} on the Germinal staff portal.

View the event and your tasks:
${portalUrl}

---
This is an automated notification from Germinal.
	`.trim();
}

function generateStaffAssignmentHtmlTemplate(data: StaffAssignmentEmailData): string {
	const portalUrl = `${env.PUBLIC_URL}/staff`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've Been Assigned to an Event</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">You've Been Assigned to an Event</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Germinal Staff Portal</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.firstName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">You have been assigned to <strong>${escapeHtml(data.eventTitle)}</strong>${data.roleName ? ` as <strong>${escapeHtml(data.roleName)}</strong>` : ''} on the Germinal staff portal.</p>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${escapeHtmlAttr(portalUrl)}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        View Event Details
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 12px; color: #6c757d; text-align: center;">
      Or copy this link: ${portalUrl}
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

export async function sendStaffAssignmentEmail(data: StaffAssignmentEmailData): Promise<void> {
	const textBody = generateStaffAssignmentTextTemplate(data);
	const htmlBody = generateStaffAssignmentHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.email,
			eventTitle: data.eventTitle,
		}, '📧 Brevo not configured - staff assignment email would have been sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'staff_assignment',
		recipient: data.email,
		subject: `You've been assigned to ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			staffEmail: data.email,
			staffName: `${data.firstName} ${data.lastName}`,
			eventTitle: data.eventTitle,
		},
	});
	logger.info({ to: data.email }, '📋 Staff assignment email queued');
}

// ============================================
// TASK ASSIGNMENT EMAIL
// ============================================

interface TaskAssignmentEmailData {
	firstName: string;
	lastName: string;
	email: string;
	taskTitle: string;
	eventTitle: string;
	dueDate?: Date | null;
}

function generateTaskAssignmentTextTemplate(data: TaskAssignmentEmailData): string {
	const portalUrl = `${env.PUBLIC_URL}/staff`;
	const dueDatePhrase = data.dueDate
		? `Due: ${data.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
		: '';

	return `
You've Been Given a New Task

Hi ${data.firstName},

You have been assigned a new task for "${data.eventTitle}":

"${data.taskTitle}"
${dueDatePhrase}

View your tasks:
${portalUrl}

---
This is an automated notification from Germinal.
	`.trim();
}

function generateTaskAssignmentHtmlTemplate(data: TaskAssignmentEmailData): string {
	const portalUrl = `${env.PUBLIC_URL}/staff`;
	const dueDatePhrase = data.dueDate
		? data.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
		: null;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've Been Given a New Task</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">You've Been Given a New Task</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Germinal Staff Portal</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(data.firstName)},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">You have been assigned a new task for <strong>${escapeHtml(data.eventTitle)}</strong>:</p>

    <div style="background-color: #f8f9fa; border-radius: 6px; padding: 16px; margin: 0 0 16px 0;">
      <p style="margin: 0; font-size: 16px; font-weight: 600;">${escapeHtml(data.taskTitle)}</p>
      ${dueDatePhrase ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #6c757d;">Due: ${dueDatePhrase}</p>` : ''}
    </div>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${escapeHtmlAttr(portalUrl)}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        View Your Tasks
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 12px; color: #6c757d; text-align: center;">
      Or copy this link: ${portalUrl}
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

export async function sendTaskAssignmentEmail(data: TaskAssignmentEmailData): Promise<void> {
	const textBody = generateTaskAssignmentTextTemplate(data);
	const htmlBody = generateTaskAssignmentHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.email,
			taskTitle: data.taskTitle,
		}, '📧 Brevo not configured - task assignment email would have been sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'task_assignment',
		recipient: data.email,
		subject: `New task: ${data.taskTitle}`,
		textBody,
		htmlBody,
		metadata: {
			staffEmail: data.email,
			staffName: `${data.firstName} ${data.lastName}`,
			taskTitle: data.taskTitle,
			eventTitle: data.eventTitle,
		},
	});
	logger.info({ to: data.email }, '📋 Task assignment email queued');
}
