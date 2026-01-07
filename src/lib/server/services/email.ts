import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isSMTPEnabled } from '../env';
import type { ContactEmailData } from '$lib/types/contact';

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
          ${data.name}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Email:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <a href="mailto:${data.email}" style="color: #007bff; text-decoration: none;">${data.email}</a>
        </td>
      </tr>
      ${data.company ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Company/Organization:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${data.company}
        </td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef;">
          <strong style="color: #495057;">Inquiry Type:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e9ecef; color: #212529;">
          ${formatInquiryType(data.inquiryType)}
        </td>
      </tr>
    </table>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <h3 style="margin: 0 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Message:</h3>
    <p style="margin: 0; color: #212529; white-space: pre-wrap;">${data.message}</p>
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
