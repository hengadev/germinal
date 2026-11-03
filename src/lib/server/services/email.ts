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
// emails fall back to the other language rather than print "null". Which
// one leads depends on the email's language (issue 026): English first in
// English, French first in French.
function eventTitleOf(event: { titleEn: string | null; titleFr: string | null }, lang: 'fr' | 'en' = 'en'): string {
	return lang === 'fr'
		? event.titleFr || event.titleEn || ''
		: event.titleEn || event.titleFr || '';
}

function eventLocationOf(event: { locationEn: string | null; locationFr?: string | null }, lang: 'fr' | 'en' = 'en'): string {
	return lang === 'fr'
		? event.locationFr || event.locationEn || ''
		: event.locationEn || event.locationFr || '';
}

/** The email's language as a currency locale (issue 026): amounts are
 * formatted the French way in a French email. */
function currencyLocaleOf(lang: 'fr' | 'en'): string {
	return lang === 'fr' ? 'fr-FR' : 'en-US';
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
 * The venue's name and address (issue 040), one line each, in the email's
 * language (issue 026). Empty when the
 * Event has no address, so the location line stands in.
 */
function venueAddressLinesOf(event: VenueAddressEvent, lang: 'fr' | 'en' = 'en'): string[] {
	const pick = (en: string | null | undefined, fr: string | null | undefined) =>
		lang === 'fr' ? fr || en || '' : en || fr || '';
	const venue = pick(event.venueNameEn, event.venueNameFr);
	const street = pick(event.streetAddressEn, event.streetAddressFr);
	const cityLine = [event.postalCode ?? '', pick(event.cityEn, event.cityFr)]
		.filter((part) => part.trim() !== '')
		.join(' ');
	const country = pick(event.countryEn, event.countryFr);
	return [venue, street, cityLine, country].map((line) => line.trim()).filter(Boolean);
}

/** Where the email points the Guest: the venue's address when there is
 * one, else the Event's location line. */
function venueOf(event: VenueAddressEvent, lang: 'fr' | 'en' = 'en'): string[] {
	const lines = venueAddressLinesOf(event, lang);
	return lines.length > 0 ? lines : [eventLocationOf(event, lang)].filter((line) => line !== '');
}

function formatInquiryType(type: string): string {
	const map: Record<string, string> = {
		collaboration: 'Collaboration',
		new_project: 'New Project',
		join_roster: 'Join Roster',
		private_event: 'Private Event',
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
${data.occasion ? `Occasion: ${data.occasion}` : ''}
${data.preferredDates ? `Preferred Dates: ${data.preferredDates}` : ''}
${data.guestCount ? `Number of Guests: ${data.guestCount}` : ''}
${data.budget ? `Budget: ${data.budget}` : ''}
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
      ${data.occasion ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Occasion:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(data.occasion)}
        </td>
      </tr>
      ` : ''}
      ${data.preferredDates ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Preferred Dates:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(data.preferredDates)}
        </td>
      </tr>
      ` : ''}
      ${data.guestCount ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Number of Guests:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${data.guestCount}
        </td>
      </tr>
      ` : ''}
      ${data.budget ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Budget:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${escapeHtml(data.budget)}
        </td>
      </tr>
      ` : ''}
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
	// Issue 026: the email is written in the Guest's language, defaulting
	// to English when it is unknown (null).
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const money = (n: number, c: string) => formatCurrency(n, c, currencyLocaleOf(lang));
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event, lang);
	const practicalInfo = localizedPracticalInfo(data.event, lang);

	const L = fr ? {
		heading: 'Confirmation de votre billet',
		greeting: `Bonjour ${data.guestName},`,
		confirmed: `Vos billets pour ${eventTitleOf(data.event, lang)} sont confirmés !`,
		details: "DÉTAILS DE L'ÉVÉNEMENT :",
		practicalInfo: 'INFOS PRATIQUES :',
		tickets: 'BILLETS :',
		total: 'Total :',
		depositPaid: 'Acompte payé :',
		balanceDue: 'Reste à régler sur place :',
		view: 'VOIR VOS BILLETS :',
		present: 'Présentez ce lien ou le QR code à l’entrée de l’événement.',
		calendar: 'AJOUTER AU CALENDRIER :',
		closing: 'À bientôt !',
		footer: 'Ceci est une confirmation automatique de Germinal.',
	} : {
		heading: 'Your Ticket Confirmation',
		greeting: `Hi ${data.guestName},`,
		confirmed: `Your tickets for ${eventTitleOf(data.event, lang)} are confirmed!`,
		details: 'EVENT DETAILS:',
		practicalInfo: 'PRACTICAL INFO:',
		tickets: 'TICKETS:',
		total: 'Total: ',
		depositPaid: 'Deposit paid: ',
		balanceDue: 'Balance due at the venue: ',
		view: 'VIEW YOUR TICKETS:',
		present: 'Present this link or QR code at the event entrance.',
		calendar: 'ADD TO CALENDAR:',
		closing: 'See you there!',
		footer: 'This is an automated confirmation from Germinal.',
	};

	return `
${L.heading}

${L.greeting}

${L.confirmed}

${L.details}
${seatingTitle(data.session, lang, { timeZone: data.event.timeZone })}
${formatSeatingDateTime(data.session.startTime, data.event.timeZone, lang)}
${where.join('\n')}
${practicalInfo ? `\n${L.practicalInfo}\n${practicalInfo}` : ''}

${L.tickets}
${data.reservation.quantity} × ${money(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}
${L.total}${money(data.reservation.totalAmount, data.reservation.currency)}${data.reservation.balanceAmount > 0 ? `
${L.depositPaid}${money(data.reservation.depositAmount, data.reservation.currency)}
${L.balanceDue}${money(data.reservation.balanceAmount, data.reservation.currency)}` : ''}

${L.view}
${env.PUBLIC_URL}/tickets/${data.accessToken}

${L.present}
${data.googleCalendarUrl ? `\n${L.calendar}\n${data.googleCalendarUrl}` : ''}

${L.closing}

---
${L.footer}
  `.trim();
}

export function generateTicketHtmlTemplate(data: TicketEmailData): string {
	// Issue 026: the email is written in the Guest's language, defaulting
	// to English when it is unknown (null).
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const money = (n: number, c: string) => formatCurrency(n, c, currencyLocaleOf(lang));
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event, lang);
	const practicalInfo = localizedPracticalInfo(data.event, lang);

	const L = fr ? {
		htmlTitle: 'Confirmation de votre billet',
		heading: '🎫 Confirmation de votre billet',
		order: 'Commande #',
		greeting: `Bonjour ${escapeHtml(data.guestName)},`,
		confirmedPrefix: 'Vos billets pour <strong>',
		confirmedSuffix: '</strong> sont confirmés !',
		details: "Détails de l'événement",
		practicalInfoHeading: 'Infos pratiques',
		tickets: 'Billets',
		total: 'Total',
		depositPaid: 'Acompte payé',
		balanceDue: 'Reste à régler sur place',
		button: 'Voir vos billets',
		qrHint: 'Présentez ce QR code à l’entrée de l’événement',
		calendar: 'Ajouter au calendrier',
		footer: 'Ceci est une confirmation automatique de Germinal.<br>Si vous avez des questions, n’hésitez pas à nous contacter.',
	} : {
		htmlTitle: 'Your Ticket Confirmation',
		heading: '🎫 Ticket Confirmation',
		order: 'Order #',
		greeting: `Hi ${escapeHtml(data.guestName)},`,
		confirmedPrefix: 'Your tickets for <strong>',
		confirmedSuffix: '</strong> are confirmed!',
		details: 'Event Details',
		practicalInfoHeading: 'Practical Info',
		tickets: 'Tickets',
		total: 'Total',
		depositPaid: 'Deposit paid',
		balanceDue: 'Balance due at the venue',
		button: 'View Your Tickets',
		qrHint: 'Present this QR code at the event entrance',
		calendar: 'Add to your calendar',
		footer: 'This is an automated confirmation from Germinal.<br>If you have any questions, please contact us.',
	};

	return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${L.htmlTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">${L.heading}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">${L.order}${data.reservation.id.substring(0, 8)}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.greeting}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.confirmedPrefix}${escapeHtml(eventTitleOf(data.event, lang))}${L.confirmedSuffix}</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.details}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(seatingTitle(data.session, lang, { timeZone: data.event.timeZone }))}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.session.startTime, data.event.timeZone, lang)}
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
    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.practicalInfoHeading}</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${escapeHtml(practicalInfo)}</p>
` : ''}

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.tickets}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${money(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
          ${money(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: 600;">${L.total}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600;">
          ${money(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>${data.reservation.balanceAmount > 0 ? `
      <tr>
        <td style="padding: 8px 0; border-top: 1px solid #e9ecef;">${L.depositPaid}</td>
        <td style="padding: 8px 0; border-top: 1px solid #e9ecef; text-align: right;">
          ${money(data.reservation.depositAmount, data.reservation.currency)}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600;">${L.balanceDue}</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">
          ${money(data.reservation.balanceAmount, data.reservation.currency)}
        </td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        ${L.button}
      </a>
    </div>

    ${data.qrCode ? `
    <div style="margin-top: 24px; text-align: center;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6c757d;">${L.qrHint}</p>
      <img src="${data.qrCode}" alt="Entry QR Code" width="200" height="200" style="display: block; margin: 0 auto; border: 1px solid #e9ecef; border-radius: 8px;" />
    </div>
    ` : ''}

    ${data.googleCalendarUrl || data.icsUrl ? `
    <div style="margin-top: 24px; text-align: center; border-top: 1px solid #e9ecef; padding-top: 20px;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6c757d; font-weight: 600;">${L.calendar}</p>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        ${data.googleCalendarUrl ? `<a href="${escapeHtmlAttr(data.googleCalendarUrl)}" style="display: inline-block; background-color: #ffffff; border: 1px solid #e9ecef; color: #495057; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 14px;">Google Calendar</a>` : ''}
        ${data.icsUrl ? `<a href="${escapeHtmlAttr(data.icsUrl)}" style="display: inline-block; background-color: #ffffff; border: 1px solid #e9ecef; color: #495057; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 14px;">Download .ics</a>` : ''}
      </div>
    </div>
    ` : ''}
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${L.footer}
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
	const lang = data.locale ?? 'en';
	await queueEmail({
		type: 'ticket_confirmation',
		recipient: data.guestEmail,
		subject: lang === 'fr'
			? `Vos billets - ${eventTitleOf(data.event, lang)}`
			: `Your Tickets - ${eventTitleOf(data.event, lang)}`,
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
	// Issue 026: the email is written in the Guest's language, defaulting
	// to English when it is unknown (null).
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const timePhrase = fr
		? (data.daysUntil === 1 ? 'demain' : `dans ${data.daysUntil} jours`)
		: (data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`);
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event, lang);
	const practicalInfo = localizedPracticalInfo(data.event, lang);

	const L = fr ? {
		heading: `Rappel d’événement : ${eventTitleOf(data.event, lang)}`,
		greeting: `Bonjour ${data.guestName},`,
		reminder: `Petit rappel : votre événement a lieu ${timePhrase} !`,
		details: "DÉTAILS DE L'ÉVÉNEMENT :",
		practicalInfo: 'INFOS PRATIQUES :',
		tickets: 'BILLETS :',
		view: 'VOIR VOS BILLETS :',
		closing: 'Nous nous réjouissons de vous y voir !',
		footer: 'Ceci est un rappel automatique de Germinal.',
	} : {
		heading: `Event Reminder: ${eventTitleOf(data.event, lang)}`,
		greeting: `Hi ${data.guestName},`,
		reminder: `This is a friendly reminder that your event is coming up ${timePhrase}!`,
		details: 'EVENT DETAILS:',
		practicalInfo: 'PRACTICAL INFO:',
		tickets: 'TICKETS:',
		view: 'VIEW YOUR TICKETS:',
		closing: 'We look forward to seeing you there!',
		footer: 'This is an automated reminder from Germinal.',
	};

	return `
${L.heading}

${L.greeting}

${L.reminder}

${L.details}
${seatingTitle(data.session, lang, { timeZone: data.event.timeZone })}
${formatSeatingDateTime(data.session.startTime, data.event.timeZone, lang)}
${where.join('\n')}
${practicalInfo ? `\n${L.practicalInfo}\n${practicalInfo}` : ''}

${L.tickets}
${data.reservation.quantity} × ${formatCurrency(bookedUnitPriceAmount(data.reservation), data.reservation.currency)}

${L.view}
${env.PUBLIC_URL}/tickets/${data.accessToken}

${L.closing}

---
${L.footer}
  `.trim();
}

/**
 * Generate event reminder email HTML template
 */
export function generateEventReminderHtmlTemplate(data: TicketEmailData & { daysUntil: number }): string {
	// Issue 026: the email is written in the Guest's language, defaulting
	// to English when it is unknown (null).
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const timePhrase = fr
		? (data.daysUntil === 1 ? 'demain' : `dans ${data.daysUntil} jours`)
		: (data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`);
	// The venue's address and the Practical Info (issue 040): what a Guest
	// needs to arrive. The Practical Info falls back to the other language;
	// empty renders no section at all.
	const where = venueOf(data.event, lang);
	const practicalInfo = localizedPracticalInfo(data.event, lang);

	const L = fr ? {
		htmlTitle: 'Rappel d’événement',
		heading: '🔔 Rappel d’événement',
		banner: `Votre événement a lieu ${timePhrase} !`,
		greeting: `Bonjour ${escapeHtml(data.guestName)},`,
		reminderPrefix: 'Petit rappel : <strong>',
		reminderSuffix: `</strong> a lieu ${timePhrase}.`,
		details: "Détails de l'événement",
		practicalInfoHeading: 'Infos pratiques',
		tickets: 'Vos billets',
		button: 'Voir vos billets',
		closing: 'Nous nous réjouissons de vous y voir !',
		footer: 'Ceci est un rappel automatique de Germinal.<br>Si vous avez des questions, n’hésitez pas à nous contacter.',
	} : {
		htmlTitle: 'Event Reminder',
		heading: '🔔 Event Reminder',
		banner: `Your event is coming up ${timePhrase}!`,
		greeting: `Hi ${escapeHtml(data.guestName)},`,
		reminderPrefix: 'This is a friendly reminder that <strong>',
		reminderSuffix: `</strong> is coming up ${timePhrase}.`,
		details: 'Event Details',
		practicalInfoHeading: 'Practical Info',
		tickets: 'Your Tickets',
		button: 'View Your Tickets',
		closing: 'We look forward to seeing you there!',
		footer: 'This is an automated reminder from Germinal.<br>If you have any questions, please contact us.',
	};

	return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${L.htmlTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">${L.heading}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">${L.banner}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.greeting}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.reminderPrefix}${escapeHtml(eventTitleOf(data.event, lang))}${L.reminderSuffix}</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.details}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(seatingTitle(data.session, lang, { timeZone: data.event.timeZone }))}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.session.startTime, data.event.timeZone, lang)}
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
    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.practicalInfoHeading}</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${escapeHtml(practicalInfo)}</p>
` : ''}

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.tickets}</h3>
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
        ${L.button}
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d; text-align: center;">
      ${L.closing}
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${L.footer}
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
			event: eventTitleOf(data.event, data.locale ?? 'en'),
			daysUntil: data.daysUntil,
		}, '🔔 Brevo not configured - event reminder email would be sent');
		return;
	}

	// Always queue for delivery with automatic retry
	const { queueEmail } = await import('../jobs/process-email-queue');
	const lang = data.locale ?? 'en';
	const timePhrase = lang === 'fr'
		? (data.daysUntil === 1 ? 'demain' : `dans ${data.daysUntil} jours`)
		: (data.daysUntil === 1 ? 'tomorrow' : `in ${data.daysUntil} days`);
	await queueEmail({
		type: 'event_reminder',
		recipient: data.guestEmail,
		subject: lang === 'fr'
			? `Rappel : ${eventTitleOf(data.event, lang)} a lieu ${timePhrase}`
			: `Reminder: ${eventTitleOf(data.event, lang)} is coming up ${timePhrase}`,
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
	/** Issue 026: the Reservation's language. Null falls back to English. */
	locale: 'fr' | 'en' | null;
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
	/** Issue 026: the Reservation's language. Null falls back to English. */
	locale: 'fr' | 'en' | null;
}

export function generateCancellationTextTemplate(data: CancellationEmailData): string {
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';

	const L = fr ? {
		heading: 'Réservation annulée',
		greeting: `Bonjour ${data.guestName},`,
		cancelled: `Votre réservation pour ${data.eventTitle} a été annulée.`,
		details: 'DÉTAILS DE LA RÉSERVATION :',
		id: 'Numéro de réservation : ',
		contact: 'Si vous n’êtes pas à l’origine de cette annulation ou si vous avez des questions, n’hésitez pas à nous contacter.',
		footer: 'Ceci est une notification automatique de Germinal.',
	} : {
		heading: 'Reservation Cancelled',
		greeting: `Hi ${data.guestName},`,
		cancelled: `Your reservation for ${data.eventTitle} has been cancelled.`,
		details: 'RESERVATION DETAILS:',
		id: 'Reservation ID: ',
		contact: "If you didn't request this cancellation or have any questions, please contact us.",
		footer: 'This is an automated notification from Germinal.',
	};

	return `
${L.heading}

${L.greeting}

${L.cancelled}

${L.details}
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, lang)}

${L.id}${data.reservationId.substring(0, 8)}

${L.contact}

---
${L.footer}
  `.trim();
}

function generateCancellationHtmlTemplate(data: CancellationEmailData): string {
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';

	const L = fr ? {
		htmlTitle: 'Réservation annulée',
		heading: 'Réservation annulée',
		order: 'Réservation n° ',
		greeting: `Bonjour ${escapeHtml(data.guestName)},`,
		cancelledPrefix: 'Votre réservation pour <strong>',
		cancelledSuffix: '</strong> a été annulée.',
		details: 'Détails de la réservation',
		contact: 'Si vous n’êtes pas à l’origine de cette annulation ou si vous avez des questions, n’hésitez pas à nous contacter.',
		footer: 'Ceci est une notification automatique de Germinal.',
	} : {
		htmlTitle: 'Reservation Cancelled',
		heading: 'Reservation Cancelled',
		order: 'Reservation #',
		greeting: `Hi ${escapeHtml(data.guestName)},`,
		cancelledPrefix: 'Your reservation for <strong>',
		cancelledSuffix: '</strong> has been cancelled.',
		details: 'Reservation Details',
		contact: "If you didn't request this cancellation or have any questions, please contact us.",
		footer: 'This is an automated notification from Germinal.',
	};

	return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${L.htmlTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">${L.heading}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">${L.order}${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.greeting}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.cancelledPrefix}${escapeHtml(data.eventTitle)}${L.cancelledSuffix}</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.details}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, lang)}
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      ${L.contact}
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${L.footer}
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
	/** Issue 046: set when the change is a party-size change (not a Move):
	 * the new number of Guests and what is left to pay on site. */
	partyChange?: {
		quantity: number;
		balanceDue: number;
		currency: string;
		/** Issue 047: refunded when the removal went past the Balance into
		 * the Deposit already paid. */
		refundedAmount?: number;
	};
}

export function generateModifiedTextTemplate(data: ModifiedEmailData): string {
	const lang = data.locale ?? 'en';
	const money = (n: number) => formatCurrency(n, data.partyChange?.currency ?? 'EUR', currencyLocaleOf(lang));
	if (lang === 'fr') {
		return `
Réservation modifiée

Bonjour ${data.guestName},

${data.partyChange
		? `Le nombre de personnes de votre réservation pour ${data.eventTitle} a été modifié : vous êtes désormais ${data.partyChange.quantity} personne${data.partyChange.quantity > 1 ? 's' : ''}.

${data.partyChange.balanceDue > 0
			? `Reste à payer sur place : ${money(data.partyChange.balanceDue)}`
			: 'Il ne reste rien à payer sur place.'}
${data.partyChange.refundedAmount
			? `Montant remboursé : ${money(data.partyChange.refundedAmount)}`
			: ''}

SÉANCE :
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'fr')}`
		: `Votre réservation pour ${data.eventTitle} a été déplacée vers une autre séance.

NOUVELLE SÉANCE :
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'fr')}`}

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

${data.partyChange
		? `The number of people on your reservation for ${data.eventTitle} has been changed: you are now ${data.partyChange.quantity} ${data.partyChange.quantity > 1 ? 'people' : 'person'}.

${data.partyChange.balanceDue > 0
			? `Left to pay on site: ${money(data.partyChange.balanceDue)}`
			: 'There is nothing left to pay on site.'}
${data.partyChange.refundedAmount
			? `Amount refunded: ${money(data.partyChange.refundedAmount)}`
			: ''}

SEATING:
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}`
		: `Your reservation for ${data.eventTitle} has been moved to another seating.

NEW SEATING:
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, 'en')}`}

Your tickets remain valid — no need to book again:
${env.PUBLIC_URL}/tickets/${data.accessToken}

If you have any questions, please contact us.

---
This is an automated notification from Germinal.
  `.trim();
}

function generateModifiedHtmlTemplate(data: ModifiedEmailData): string {
	const lang = data.locale ?? 'en';
	const money = (n: number) => formatCurrency(n, data.partyChange?.currency ?? 'EUR', currencyLocaleOf(lang));
	if (data.partyChange) {
		return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lang === 'fr' ? 'Réservation modifiée' : 'Reservation Modified'}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">${lang === 'fr' ? 'Réservation modifiée' : 'Reservation Modified'}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">${lang === 'fr' ? 'Réservation n°' : 'Reservation #'}${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${lang === 'fr' ? `Bonjour ${escapeHtml(data.guestName)},` : `Hi ${escapeHtml(data.guestName)},`}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      ${lang === 'fr'
		? `Le nombre de personnes de votre réservation pour <strong>${escapeHtml(data.eventTitle)}</strong> a été modifié : vous êtes désormais <strong>${data.partyChange.quantity}</strong> personne${data.partyChange.quantity > 1 ? 's' : ''}.`
		: `The number of people on your reservation for <strong>${escapeHtml(data.eventTitle)}</strong> has been changed: you are now <strong>${data.partyChange.quantity}</strong> ${data.partyChange.quantity > 1 ? 'people' : 'person'}.`}
    </p>

    <div style="background-color: #f8f9fa; border-radius: 6px; padding: 16px; margin: 0 0 16px 0;">
      <p style="margin: 0; font-size: 15px;">
        <strong>${lang === 'fr' ? 'Reste à payer sur place :' : 'Left to pay on site:'}</strong> ${money(data.partyChange.balanceDue)}
      </p>
      ${data.partyChange.refundedAmount
		? `<p style="margin: 12px 0 0 0; font-size: 15px;">
        <strong>${lang === 'fr' ? 'Montant remboursé :' : 'Amount refunded:'}</strong> ${money(data.partyChange.refundedAmount)}
      </p>`
		: ''}
    </div>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${lang === 'fr' ? 'Séance' : 'Seating'}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, lang)}
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">${lang === 'fr' ? 'Voir vos billets' : 'View your tickets'}</a>
    </p>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      ${lang === 'fr' ? 'Vos billets restent valables — inutile de réserver à nouveau. Si vous avez des questions, n’hésitez pas à nous contacter.' : 'Your tickets remain valid — no need to book again. If you have any questions, please contact us.'}
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${lang === 'fr' ? 'Ceci est une notification automatique de Germinal.' : 'This is an automated notification from Germinal.'}
    </p>
  </div>
</body>
</html>
  `.trim();
	}
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
	const lang = data.locale ?? 'en';
	await queueEmail({
		type: 'reservation_cancelled',
		recipient: data.guestEmail,
		subject: lang === 'fr'
			? `Réservation annulée - ${data.eventTitle}`
			: `Reservation Cancelled - ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservationId,
			guestName: data.guestName,
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Cancellation email queued');
}

export interface ThankYouEmailData {
	guestEmail: string | null;
	guestName: string;
	eventTitle: string;
	/** The Event's message, in the email's language, with empty falling
	 * back to the other one (issue 054). Paragraphs, plain text. */
	message: string;
	/** Optional link: its label (same fallback as the message) and URL. */
	linkUrl: string | null;
	linkLabel: string | null;
	reservationId: string;
	/** Issue 026: the Reservation's language. Null falls back to English. */
	locale: 'fr' | 'en' | null;
}

export function generateThankYouTextTemplate(data: ThankYouEmailData): string {
	const fr = (data.locale ?? 'en') === 'fr';
	const paragraphs = data.message.split(/\n\s*\n/).filter((p) => p.trim() !== '');
	const link = data.linkUrl
		? `${data.linkLabel ?? data.linkUrl}\n${data.linkUrl}`
		: '';

	const heading = fr ? 'Merci d’avoir été des nôtres' : 'Thank you for joining us';
	const greeting = fr ? `Bonjour ${data.guestName},` : `Hi ${data.guestName},`;
	const intro = fr
		? `Merci d’avoir assisté à ${data.eventTitle}. Nous avons été ravis de vous accueillir.`
		: `Thank you for attending ${data.eventTitle}. It was a pleasure to have you with us.`;
	const linkLabel = fr ? 'POUR ALLER PLUS LOIN :' : 'FURTHER READING:';
	const closing = fr ? 'À très bientôt,' : 'See you soon,';
	const signature = fr ? 'L’équipe Germinal' : 'The Germinal team';
	const footer = fr
		? 'Ceci est un message de service de Germinal.'
		: 'This is a service message from Germinal.';

	return `
${heading}

${greeting}

${intro}

${paragraphs.join('\n\n')}
${link ? `\n\n${linkLabel}\n${link}` : ''}

${closing}
${signature}

---
${footer}
  `.trim();
}

function generateThankYouHtmlTemplate(data: ThankYouEmailData): string {
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const paragraphs = data.message.split(/\n\s*\n/).filter((p) => p.trim() !== '');
	const link = data.linkUrl
		? `<p style="margin: 24px 0;"><a href="${escapeHtmlAttr(data.linkUrl)}" style="color: #1a1a1a; font-weight: 600;">${escapeHtml(data.linkLabel ?? data.linkUrl)}</a></p>`
		: '';

	const L = fr ? {
		title: 'Merci d’avoir été des nôtres',
		heading: 'Merci d’avoir été des nôtres',
		greeting: `Bonjour ${escapeHtml(data.guestName)},`,
		intro: `Merci d’avoir assisté à <strong>${escapeHtml(data.eventTitle)}</strong>. Nous avons été ravis de vous accueillir.`,
		closing: 'À très bientôt,',
		signature: 'L’équipe Germinal',
		footer: 'Ceci est un message de service de Germinal.',
	} : {
		title: 'Thank you for joining us',
		heading: 'Thank you for joining us',
		greeting: `Hi ${escapeHtml(data.guestName)},`,
		intro: `Thank you for attending <strong>${escapeHtml(data.eventTitle)}</strong>. It was a pleasure to have you with us.`,
		closing: 'See you soon,',
		signature: 'The Germinal team',
		footer: 'This is a service message from Germinal.',
	};

	return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${L.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff;">
    <h1 style="margin: 0 0 24px 0; font-size: 22px; color: #212529;">${L.heading}</h1>
    <p style="margin: 0 0 16px 0; color: #212529;">${L.greeting}</p>
    <p style="margin: 0 0 16px 0; color: #212529;">${L.intro}</p>
    ${paragraphs.map((p) => `<p style="margin: 0 0 16px 0; color: #212529; white-space: pre-wrap;">${escapeHtml(p)}</p>`).join('\n')}
    ${link}
    <p style="margin: 24px 0 0 0; color: #212529;">
      ${L.closing}<br>
      <strong>${L.signature}</strong>
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${L.footer}
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * The post-event Thank-you (issue 054): a service message — no
 * unsubscribe from news — queued the morning after a Day to Guests who
 * came.
 */
export async function sendThankYouEmail(data: ThankYouEmailData): Promise<void> {
	// A Walk-in (issue 020) may have no email: nobody to thank by mail.
	if (!data.guestEmail) return;
	const textBody = generateThankYouTextTemplate(data);
	const htmlBody = generateThankYouHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({
			to: data.guestEmail,
			reservationId: data.reservationId,
		}, '📧 Brevo not configured - thank-you email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	const lang = data.locale ?? 'en';
	await queueEmail({
		type: 'thank_you',
		recipient: data.guestEmail,
		subject: lang === 'fr'
			? `Merci — ${data.eventTitle}`
			: `Thank you — ${data.eventTitle}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: data.reservationId,
			guestName: data.guestName,
		},
	});
	logger.info({ to: data.guestEmail }, '📋 Thank-you email queued');
}

export interface GiftCardEmailData {
	recipientEmail: string | null;
	recipientName: string | null;
	/** Formatted code, e.g. GERM-7ZK9-M3XT. */
	code: string;
	/** Minor units (cents). */
	amount: number;
	expiry: Date;
	message: string | null;
	/** The printable card page (issue 064), included when present. */
	printUrl?: string | null;
}

export function generateGiftCardTextTemplate(data: GiftCardEmailData): string {
	const intro = data.recipientName
		? `Bonjour ${data.recipientName},`
		: 'Bonjour,';
	const message = data.message?.trim()
		? `Un mot vous accompagne :

${data.message.trim()}`
		: '';
	return `
Votre carte cadeau Germinal

${intro}

Voici votre carte cadeau d'une valeur de ${formatCurrency(data.amount, 'EUR', 'fr-FR')}.

Code : ${data.code}
Valable jusqu'au ${data.expiry.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
${data.printUrl ? `Carte imprimable : ${data.printUrl}\n` : ''}${message ? `\n${message}\n` : ''}
Présentez ce code lors de vos réservations pour l'utiliser.

À très bientôt,
L'équipe Germinal

---
Ceci est un message de service de Germinal.
  `.trim();
}

function generateGiftCardHtmlTemplate(data: GiftCardEmailData): string {
	const message = data.message?.trim()
		? `<p style="margin: 0 0 16px 0; color: #212529; white-space: pre-wrap;">${escapeHtml(data.message.trim())}</p>`
		: '';
	return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre carte cadeau Germinal</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff;">
    <h1 style="margin: 0 0 24px 0; font-size: 22px; color: #212529;">Votre carte cadeau Germinal</h1>
    <p style="margin: 0 0 16px 0; color: #212529;">${data.recipientName ? escapeHtml(`Bonjour ${data.recipientName},`) : 'Bonjour,'}</p>
    <p style="margin: 0 0 16px 0; color: #212529;">Voici votre carte cadeau d'une valeur de <strong>${formatCurrency(data.amount, 'EUR', 'fr-FR')}</strong>.</p>
    <p style="margin: 24px 0; padding: 16px; background-color: #f8f9fa; border-radius: 8px; text-align: center; font-size: 20px; letter-spacing: 2px; color: #212529;"><strong>${escapeHtml(data.code)}</strong></p>
    <p style="margin: 0 0 16px 0; color: #212529;">Valable jusqu'au ${data.expiry.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    ${data.printUrl ? `<p style="margin: 0 0 16px 0;"><a href="${data.printUrl}" style="color: #212529;">Imprimer la carte</a></p>` : ''}
    ${message}
    <p style="margin: 0 0 16px 0; color: #212529;">Présentez ce code lors de vos réservations pour l'utiliser.</p>
    <p style="margin: 24px 0 0 0; color: #212529;">
      À très bientôt,<br>
      <strong>L'équipe Germinal</strong>
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      Ceci est un message de service de Germinal.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * The gift card email (issue 063): code, amount, expiry and message.
 * A service message, FR only, queued when an Admin issues a card.
 */
export async function sendGiftCardEmail(data: GiftCardEmailData): Promise<void> {
	if (!data.recipientEmail) return;
	const textBody = generateGiftCardTextTemplate(data);
	const htmlBody = generateGiftCardHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({ to: data.recipientEmail }, '📧 Brevo not configured - gift card email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'gift_card',
		recipient: data.recipientEmail,
		subject: 'Votre carte cadeau Germinal',
		textBody,
		htmlBody,
		metadata: { code: data.code, amount: data.amount }
	});
	logger.info({ to: data.recipientEmail }, '📋 Gift card email queued');
}

export interface GiftCardReceiptEmailData {
	buyerEmail: string;
	buyerName: string | null;
	recipientName: string | null;
	/** Set only when the card went straight to the recipient. */
	recipientEmail: string | null;
	/** Minor units (cents). */
	amount: number;
	delivery: 'buyer' | 'recipient';
	printUrl: string;
}

export function generateGiftCardReceiptTextTemplate(data: GiftCardReceiptEmailData): string {
	const intro = data.buyerName ? `Bonjour ${data.buyerName},` : 'Bonjour,';
	const sent = data.delivery === 'recipient'
		? `La carte a été envoyée à ${data.recipientName}${data.recipientEmail ? ` (${data.recipientEmail})` : ''}.`
		: 'La carte vous a été envoyée par e-mail.';
	return `
Votre achat de carte cadeau Germinal

${intro}

Merci pour votre achat d'une carte cadeau d'une valeur de ${formatCurrency(data.amount, 'EUR', 'fr-FR')}.
${sent}

Vous pouvez la retrouver et l'imprimer ici :
${data.printUrl}

À très bientôt,
L'équipe Germinal

---
Ceci est un message de service de Germinal.
  `.trim();
}

function generateGiftCardReceiptHtmlTemplate(data: GiftCardReceiptEmailData): string {
	const escape = (s: string) => escapeHtml(s);
	const sent = data.delivery === 'recipient'
		? `La carte a été envoyée à <strong>${escape(data.recipientName ?? '')}</strong>${data.recipientEmail ? ` (${escape(data.recipientEmail)})` : ''}.`
		: 'La carte vous a été envoyée par e-mail.';
	return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre achat de carte cadeau Germinal</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff;">
    <h1 style="margin: 0 0 24px 0; font-size: 22px; color: #212529;">Votre achat de carte cadeau Germinal</h1>
    <p style="margin: 0 0 16px 0; color: #212529;">${data.buyerName ? escape(`Bonjour ${data.buyerName},`) : 'Bonjour,'}</p>
    <p style="margin: 0 0 16px 0; color: #212529;">Merci pour votre achat d'une carte cadeau d'une valeur de <strong>${formatCurrency(data.amount, 'EUR', 'fr-FR')}</strong>.</p>
    <p style="margin: 0 0 16px 0; color: #212529;">${sent}</p>
    <p style="margin: 0 0 16px 0; color: #212529;"><a href="${data.printUrl}" style="color: #212529;">Imprimer la carte</a></p>
    <p style="margin: 24px 0 0 0; color: #212529;">
      À très bientôt,<br>
      <strong>L'équipe Germinal</strong>
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      Ceci est un message de service de Germinal.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * The buyer's receipt for an online gift card purchase (issue 064): a
 * service message, FR only, queued once the card is issued. It never
 * shows the code — only where the card was sent and the printable link.
 */
export async function sendGiftCardReceiptEmail(data: GiftCardReceiptEmailData): Promise<void> {
	if (!data.buyerEmail) return;
	const textBody = generateGiftCardReceiptTextTemplate(data);
	const htmlBody = generateGiftCardReceiptHtmlTemplate(data);

	if (!isBrevoConfigured()) {
		logger.info({ to: data.buyerEmail }, '📧 Brevo not configured - gift card receipt would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'gift_card_receipt',
		recipient: data.buyerEmail,
		subject: 'Votre achat de carte cadeau Germinal',
		textBody,
		htmlBody,
		metadata: { amount: data.amount, delivery: data.delivery }
	});
	logger.info({ to: data.buyerEmail }, '📋 Gift card receipt email queued');
}

export interface NewsletterConfirmationEmailData {
	email: string;
	locale: string;
	confirmationToken: string;
}

/**
 * The newsletter double opt-in email (issue 053): sent only on a form
 * signup, with the confirmation link. In the visitor's language.
 */
export async function sendNewsletterConfirmationEmail(
	data: NewsletterConfirmationEmailData
): Promise<void> {
	const lang = data.locale === 'fr' ? 'fr' : 'en';
	const fr = lang === 'fr';
	const link = `${env.PUBLIC_URL}/newsletter/confirm?token=${data.confirmationToken}`;

	const L = fr ? {
		subject: 'Confirmez votre inscription à la lettre de Germinal',
		heading: 'Un dernier clic',
		intro: 'Vous avez demandé à recevoir les prochains événements de Germinal. Confirmez votre adresse pour terminer l’inscription :',
		linkLabel: 'Confirmer mon inscription',
		ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message : rien ne sera enregistré sans confirmation.',
		footer: 'Ceci est un message de service de Germinal.',
	} : {
		subject: 'Confirm your subscription to Germinal\u2019s newsletter',
		heading: 'One last click',
		intro: 'You asked to hear about Germinal\u2019s next events. Confirm your address to finish signing up:',
		linkLabel: 'Confirm my subscription',
		ignore: 'If you did not ask for this, simply ignore this message: nothing is recorded without confirmation.',
		footer: 'This is a service message from Germinal.',
	};

	const textBody = `
${L.heading}

${L.intro}

${L.linkLabel}
${link}

${L.ignore}

---
${L.footer}
`.trim();

	const htmlBody = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(L.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff;">
    <h1 style="margin: 0 0 24px 0; font-size: 22px; color: #212529;">${escapeHtml(L.heading)}</h1>
    <p style="margin: 0 0 16px 0; color: #212529;">${escapeHtml(L.intro)}</p>
    <p style="margin: 24px 0;"><a href="${escapeHtmlAttr(link)}" style="color: #1a1a1a; font-weight: 600;">${escapeHtml(L.linkLabel)}</a></p>
    <p style="margin: 0 0 16px 0; color: #6c757d; font-size: 14px;">${escapeHtml(L.ignore)}</p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">${escapeHtml(L.footer)}</p>
  </div>
</body>
</html>
`.trim();

	if (!isBrevoConfigured()) {
		logger.info({ to: data.email }, '📧 Brevo not configured - newsletter confirmation email would be sent');
		return;
	}

	const { queueEmail } = await import('../jobs/process-email-queue');
	await queueEmail({
		type: 'newsletter_confirmation',
		recipient: data.email,
		subject: L.subject,
		textBody,
		htmlBody,
	});
	logger.info({ to: data.email }, '📋 Newsletter confirmation email queued');
}

function generateRefundTextTemplate(data: RefundEmailData): string {
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const money = (n: number, c: string) => formatCurrency(n, c, currencyLocaleOf(lang));
	const refundLabel = data.isPartialRefund
		? (fr ? 'Remboursement partiel effectué' : 'Partial Refund Processed')
		: (fr ? 'Remboursement effectué' : 'Refund Processed');

	const L = fr ? {
		greeting: `Bonjour ${data.guestName},`,
		body: `Votre réservation pour ${data.eventTitle} a été annulée et ${data.isPartialRefund ? 'un remboursement partiel' : 'un remboursement'} de ${money(data.amount, data.currency)} a été effectué.`,
		details: 'DÉTAILS DE LA RÉSERVATION :',
		id: 'Numéro de réservation : ',
		refundAmount: 'Montant remboursé : ',
		timeline: 'Le remboursement apparaît généralement sur votre relevé sous 5 à 10 jours ouvrés, selon votre banque.',
		footer: 'Ceci est une notification automatique de Germinal.',
	} : {
		greeting: `Hi ${data.guestName},`,
		body: `Your reservation for ${data.eventTitle} has been cancelled and ${data.isPartialRefund ? 'a partial refund' : 'a refund'} of ${money(data.amount, data.currency)} has been processed.`,
		details: 'RESERVATION DETAILS:',
		id: 'Reservation ID: ',
		refundAmount: 'Refund Amount: ',
		timeline: 'Refunds typically appear on your statement within 5-10 business days, depending on your bank.',
		footer: 'This is an automated notification from Germinal.',
	};

	return `
${refundLabel}

${L.greeting}

${L.body}

${L.details}
${data.sessionTitle}
${formatSeatingDateTime(data.sessionStartTime, data.timeZone, lang)}

${L.id}${data.reservationId.substring(0, 8)}
${L.refundAmount}${money(data.amount, data.currency)}

${L.timeline}

---
${L.footer}
  `.trim();
}

function generateRefundHtmlTemplate(data: RefundEmailData): string {
	const lang = data.locale ?? 'en';
	const fr = lang === 'fr';
	const money = (n: number, c: string) => formatCurrency(n, c, currencyLocaleOf(lang));
	const refundLabel = data.isPartialRefund
		? (fr ? 'Remboursement partiel effectué' : 'Partial Refund Processed')
		: (fr ? 'Remboursement effectué' : 'Refund Processed');

	const L = fr ? {
		order: 'Réservation n° ',
		greeting: `Bonjour ${escapeHtml(data.guestName)},`,
		bodyPrefix: 'Votre réservation pour <strong>',
		bodySuffix: `</strong> a été annulée et ${data.isPartialRefund ? 'un remboursement partiel' : 'un remboursement'} de <strong>`,
		bodyEnd: '</strong> a été effectué.',
		details: 'Détails de la réservation',
		refundAmount: 'Montant remboursé',
		timeline: 'Le remboursement apparaît généralement sur votre relevé sous 5 à 10 jours ouvrés, selon votre banque.',
		footer: 'Ceci est une notification automatique de Germinal.',
	} : {
		order: 'Reservation #',
		greeting: `Hi ${escapeHtml(data.guestName)},`,
		bodyPrefix: 'Your reservation for <strong>',
		bodySuffix: `</strong> has been cancelled and ${data.isPartialRefund ? 'a partial refund' : 'a refund'} of <strong>`,
		bodyEnd: '</strong> has been processed.',
		details: 'Reservation Details',
		refundAmount: 'Refund Amount',
		timeline: 'Refunds typically appear on your statement within 5-10 business days, depending on your bank.',
		footer: 'This is an automated notification from Germinal.',
	};

	return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${refundLabel}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">💳 ${escapeHtml(refundLabel)}</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">${L.order}${escapeHtml(data.reservationId.substring(0, 8))}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${L.greeting}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      ${L.bodyPrefix}${escapeHtml(data.eventTitle)}${L.bodySuffix}${escapeHtml(money(data.amount, data.currency))}${L.bodyEnd}
    </p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">${L.details}</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.sessionTitle)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${formatSeatingDateTime(data.sessionStartTime, data.timeZone, lang)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0 0 0; font-weight: 600;">${L.refundAmount}</td>
      </tr>
      <tr>
        <td style="padding: 0 0 8px 0;">${escapeHtml(money(data.amount, data.currency))}</td>
      </tr>
    </table>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d;">
      ${L.timeline}
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      ${L.footer}
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
	const lang = data.locale ?? 'en';
	await queueEmail({
		type: 'reservation_refunded',
		recipient: data.guestEmail,
		subject: data.isPartialRefund
			? (lang === 'fr' ? `Remboursement partiel effectué - ${data.eventTitle}` : `Partial Refund Processed - ${data.eventTitle}`)
			: (lang === 'fr' ? `Remboursement effectué - ${data.eventTitle}` : `Refund Processed - ${data.eventTitle}`),
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
