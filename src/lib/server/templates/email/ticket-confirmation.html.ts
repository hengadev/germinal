import { escapeHtml, escapeHtmlAttr } from '$lib/utils/html';

export interface TicketEmailData {
	name: string;
	email: string;
	eventName: string;
	date: Date;
	time: string;
	quantity: number;
	totalAmount: number;
	currency: string;
}

export interface ContactEmailData {
	name: string;
	email: string;
	company?: string;
	inquiryType: string;
	message: string;
	submittedAt: Date;
}

export interface WaitlistEmailData {
	name: string;
	email: string;
	eventName: string;
	quantity: number;
	notifyTime?: Date;
}

export function generateTicketConfirmation(data: TicketEmailData): { html: string; text: string } {
	const html = `
		<div style="font-size: 16px; line-height: 1.5;">
			<p>Dear ${escapeHtml(data.name)},</p>
			<p>Thank you for booking your tickets!</p>
			<p><strong>Event:</strong> ${escapeHtml(data.eventName)}</p>
			<p><strong>Date:</strong> ${data.date.toLocaleDateString()}</p>
			<p><strong>Time:</strong> ${data.time}</p>
			<p><strong>Quantity:</strong> ${data.quantity}</p>
			<p><strong>Total:</strong> ${formatCurrency(data.totalAmount, data.currency)}</p>
			<p></p>
			<p><em>Your access token is: ${data.accessToken}</em></p>
			<p>Find your tickets attached below or use this token to view your reservation details.</p>
			<p>If you have any questions, please reply to this email.</p>
		</div>
	`;

	const text = `
Dear ${data.name},

Thank you for booking your tickets!

Event: ${data.eventName}
Date: ${data.date.toLocaleDateString()}
Time: ${data.time}
Quantity: ${data.quantity}
Total: ${formatCurrency(data.totalAmount, data.currency)}

Your access token is: ${data.accessToken}
Find your tickets below or use this token to view your reservation details.

If you have any questions, please reply to this email.
	`;

	return { html, text };
}

export function generateContactNotification(data: ContactEmailData): { html: string; text: string } {
	const inquiryTypeMap: {
		collaboration: 'Collaboration',
		new_project: 'New Project',
		join_roster: 'Join Roster',
		other: 'Other'
	};

	const html = `
	<div style="font-size: 16px; line-height: 1.5;">
			<h2 style="margin: 0 0 20px 0;">New Contact Form Submission</h2>
			<div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px;">
				<p><strong>From:</strong> ${escapeHtml(data.name)} (${escapeHtml(data.email)})</p>
				${data.company ? `<p><strong>Company:</strong> ${escapeHtml(data.company)}</p>` : ''}
				<p><strong>Type:</strong> ${inquiryTypeMap[data.inquiryType] || 'other'}</p>
				<p><strong>Submitted:</strong> ${data.submittedAt.toLocaleString()}</p>
			</div>

			<h3 style="margin: 20px 0 0;">Message</h3>
			<div style="white-space: pre-wrap; font-size: 14px; color: #374151;">
				${escapeHtml(data.message)}
			</div>
	</div>
	`;

	const text = `
New Contact Form Submission

From: ${data.name} (${data.email})
${data.company ? `Company: ${data.company}` : ''}
Type: ${inquiryTypeMap[data.inquiryType] || 'other'}
Submitted: ${data.submittedAt.toLocaleString()}

Message:
${data.message}
`;

	return { html, text };
}

export function generateWaitlistNotification(data: WaitlistEmailData): { html: string; text: string } {
	const html = `
	<div style="font-size: 16px; line-height: 1.5;">
			<h2 style="margin: 0 0 20px 0;">Tickets Available!</h2>
			<p>Hi ${escapeHtml(data.name)},</p>
			<p>Great news! Tickets for <strong>${escapeHtml(data.eventName)}</strong> are now available!</p>
			<p>We have ${data.quantity} ticket${data.quantity > 1 ? 's' : ''} reserved for you.</p>
			${data.notifyTime ? `<p><strong>Reservation expires at:</strong> ${data.notifyTime.toLocaleString()}</p>` : ''}
			<p></p>
			<p>Please complete your purchase within 24 hours to secure your tickets.</p>
			</div>
	`;

	const text = `
Tickets Available!

Hi ${data.name},

Great news! Tickets for ${data.eventName} are now available!
We have ${data.quantity} ticket${data.quantity > 1 ? 's' : ''} reserved for you.
${data.notifyTime ? `Reservation expires at: ${data.notifyTime.toLocaleString()}` : ''}

Please complete your purchase within 24 hours to secure your tickets.
`;

	return { html, text };
}
