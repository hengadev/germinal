import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isSMTPEnabled } from '../env';
import type { ContactEmailData } from '$lib/types/contact';
import type { TicketEmailData } from '$lib/types/reservations';
import { formatCurrency } from '$lib/utils/currency';
import { escapeHtml, escapeHtmlAttr } from '$lib/utils/html';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (!isSMTPEnabled()) {
      throw new Error('SMTP is not configured. Check environment variables.');
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
  if (!isSMTPEnabled()) {
    console.log('\n📧 SMTP not configured. Email would have been sent:');
    console.log('---------------------------------------------------');
    console.log(`To: ${env.CONTACT_EMAIL}`);
    console.log(`From: ${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`);
    console.log(`Subject: New Contact Form Submission from ${data.name}`);
    console.log('\nContent:');
    console.log(generateTextTemplate(data));
    console.log('---------------------------------------------------\n');
    return;
  }

  const transport = getTransporter();

  const mailOptions = {
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
    to: env.CONTACT_EMAIL,
    replyTo: `"${data.name}" <${data.email}>`,
    subject: `New Contact Form Submission from ${data.name}`,
    text: generateTextTemplate(data),
    html: generateHtmlTemplate(data),
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log('📧 Contact email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send contact email:', error);
    throw new Error('Failed to send email notification');
  }
}

function generateTicketTextTemplate(data: TicketEmailData): string {
  return `
Your Ticket Confirmation

Hi ${data.guestName},

Your tickets for ${data.event.title} are confirmed!

EVENT DETAILS:
${data.session.title}
${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
${data.event.location}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
Total: ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}

VIEW YOUR TICKETS:
${env.PUBLIC_URL}/tickets/${data.accessToken}

Present this link or QR code at the event entrance.

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
        <td style="padding: 8px 0; color: #212529;"><strong>${escapeHtml(data.session.title)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${escapeHtml(data.event.location)}
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

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d; text-align: center;">
      Present this link or QR code at the event entrance.
    </p>
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
  const textBody = generateTicketTextTemplate(data);
  const htmlBody = generateTicketHtmlTemplate(data);

  if (!isSMTPEnabled()) {
    console.log('\n🎫 Ticket confirmation email would be sent to:', data.guestEmail);
    console.log('Access token:', data.accessToken);
    console.log('Ticket URL:', `${env.PUBLIC_URL}/tickets/${data.accessToken}`);
    return;
  }

  const transport = getTransporter();

  const mailOptions = {
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
    to: data.guestEmail,
    subject: `Your Tickets for ${data.event.title}`,
    text: textBody,
    html: htmlBody,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log('🎫 Ticket confirmation email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send ticket confirmation email:', error);
    // Queue for retry instead of throwing
    const { queueEmail } = await import('../jobs/process-email-queue');
    await queueEmail({
      type: 'ticket_confirmation',
      recipient: data.guestEmail,
      subject: `Your Tickets for ${data.event.title}`,
      textBody,
      htmlBody,
      metadata: {
        reservationId: data.reservation.id,
        accessToken: data.accessToken,
      },
    });
    console.log('📋 Email queued for retry');
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  if (!isSMTPEnabled()) {
    console.warn('⚠️  SMTP not configured');
    return false;
  }

  try {
    const transport = getTransporter();
    await transport.verify();
    console.log('✅ SMTP connection verified');
    return true;
  } catch (error) {
    console.error('❌ SMTP connection failed:', error);
    return false;
  }
}
