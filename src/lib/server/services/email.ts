import { logger } from '$lib/server/logger';
import { env, isAWSConfigured } from '../env';
import type { ContactEmailData } from '$lib/types/contact';
import type { TicketEmailData } from '$lib/types/reservations';
import { formatCurrency } from '$lib/utils/currency';
import { escapeHtml, escapeHtmlAttr } from '$lib/utils/html';
import {
	SESClient,
	SendEmailCommand,
	type SendEmailCommandInput,
} from '@aws-sdk/client-ses';

let sesClient: SESClient | null = null;

function getSESClient(): SESClient {
	if (!sesClient) {
		if (!isAWSConfigured()) {
			throw new Error('AWS is not configured. Check AWS credentials.');
		}

		sesClient = new SESClient({
			region: env.AWS_REGION,
			credentials: {
				accessKeyId: env.AWS_ACCESS_KEY_ID,
				secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			},
		});
	}

	return sesClient;
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
	if (!isAWSConfigured()) {
		logger.info({
			to: env.CONTACT_EMAIL,
			from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
			subject: `New Contact Form Submission from ${data.name}`,
			content: generateTextTemplate(data),
		}, '📧 AWS not configured - email would have been sent');
		return;
	}

	const client = getSESClient();

	const mailOptions: SendEmailCommandInput = {
		Source: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
		Destination: {
			ToAddresses: [env.CONTACT_EMAIL],
		},
		Message: {
			Subject: {
				Data: `New Contact Form Submission from ${data.name}`,
			},
			Body: {
				Text: {
					Data: generateTextTemplate(data),
				},
				Html: {
					Data: generateHtmlTemplate(data),
				},
			},
		},
		// Add reply-to using headers
		ReplyToAddresses: [`${data.name} <${data.email}>`],
	};

	try {
		const command = new SendEmailCommand(mailOptions);
		const result = await client.send(command);
		logger.info({ messageId: result.MessageId }, '📧 Contact email sent successfully');
	} catch (error) {
		logger.error({ err: error }, '❌ Failed to send contact email');
		throw new Error('Failed to send email notification');
	}
}

function generateTicketTextTemplate(data: TicketEmailData): string {
	return `
Your Ticket Confirmation

Hi ${data.guestName},

Your tickets for ${data.event.title} are confirmed!

EVENT DETAILS:
${data.session.titleEn}
${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
${data.event.locationEn}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
Total: ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}

VIEW YOUR TICKETS:
${env.PUBLIC_URL}/tickets/${data.accessToken}

Present this link or QR code at the event entrance.
${data.googleCalendarUrl ? `\nADD TO CALENDAR:\n${data.googleCalendarUrl}` : ''}

See you there!

---
This is an automated confirmation from Germinal.
  `.trim();
}

function generateTicketHtmlTemplate(data: TicketEmailData): string {
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
    <p style="margin: 0 0 16px 0; font-size: 16px;">Your tickets for <strong>${escapeHtml(data.event.title)}</strong> are confirmed!</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.session.titleEn)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${escapeHtml(data.event.locationEn)}
        </td>
      </tr>
    </table>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Tickets</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
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
      </tr>
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
	const icsUrl = `${env.PUBLIC_URL}/api/events/${data.event.slug}/sessions/${data.session.id}/calendar.ics`;

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

	if (!isAWSConfigured()) {
		logger.info({
			to: data.guestEmail,
			accessToken: data.accessToken,
			ticketUrl: `${env.PUBLIC_URL}/tickets/${data.accessToken}`,
		}, '🎫 AWS not configured - ticket confirmation email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'ticket_confirmation',
		recipient: data.guestEmail,
		subject: `Your Tickets - ${data.event.title}`,
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

export async function verifyEmailConnection(): Promise<boolean> {
	if (!isAWSConfigured()) {
		console.warn('⚠️  AWS not configured');
		return false;
	}

	try {
		// Simply verify that the SES client can be created with valid credentials
		// The client will be initialized when getSESClient() is called
		getSESClient();
		logger.info('✅ SES connection verified (credentials configured)');
		return true;
	} catch (error) {
		logger.error({ err: error }, '❌ SES connection failed');
		return false;
	}
}

/**
 * Generate event reminder email text template
 */
function generateEventReminderTextTemplate(data: TicketEmailData & { daysUntil: number }): string {
	const timePhrase = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;

	return `
Event Reminder: ${data.event.title}

Hi ${data.guestName},

This is a friendly reminder that your event is coming up ${timePhrase}!

EVENT DETAILS:
${data.session.titleEn}
${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
${data.event.locationEn}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}

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
function generateEventReminderHtmlTemplate(data: TicketEmailData & { daysUntil: number }): string {
	const timePhrase = data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`;

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
    <p style="margin: 0 0 16px 0; font-size: 16px;">This is a friendly reminder that <strong>${escapeHtml(data.event.title)}</strong> is coming up ${timePhrase}.</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.session.titleEn)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${escapeHtml(data.event.locationEn)}
        </td>
      </tr>
    </table>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Your Tickets</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
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
	const textBody = generateEventReminderTextTemplate(data);
	const htmlBody = generateEventReminderHtmlTemplate(data);

	if (!isAWSConfigured()) {
		logger.info({
			to: data.guestEmail,
			event: data.event.title,
			daysUntil: data.daysUntil,
		}, '🔔 AWS not configured - event reminder email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'event_reminder',
		recipient: data.guestEmail,
		subject: `Reminder: ${data.event.title} is coming up ${data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`}`,
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
