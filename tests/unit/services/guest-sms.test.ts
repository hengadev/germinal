// @vitest-environment node
/**
 * Issue 027 — the five Guest SMS (ticket confirmation, event reminder,
 * ticket reminder, cancellation, refund) are written in the Reservation's
 * language: French for `fr`, English for `en` and for an unknown language
 * (null), which is the pre-issue behaviour. Twilio is not configured in
 * tests, so sendSMS logs the message instead: we capture it via the
 * mocked logger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/server/env', () => ({
	env: { PUBLIC_URL: 'http://localhost:5173' },
}));

vi.mock('../../../src/lib/server/logger', () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
	sendTicketConfirmationSMS,
	sendEventReminderSMS,
	sendTicketReminderSMS,
	sendCancellationSMS,
	sendRefundSMS,
} from '../../../src/lib/server/services/sms';
import { logger } from '../../../src/lib/server/logger';

const startTime = new Date('2099-06-01T19:00:00Z');
const timeZone = 'UTC';
// The Event's French title differs so the choice is visible in the message.
const event = { titleEn: 'The Big Night', titleFr: 'La Grande Nuit' };

/** The message sendSMS would have sent (Twilio is not configured in tests). */
async function sentMessage(): Promise<string> {
	const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
	const call = calls.find((args) => args[0] && typeof args[0] === 'object' && 'message' in args[0]);
	return call?.[0].message as string;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('sendTicketConfirmationSMS', () => {
	const base = {
		phone: '+15551234567',
		guestName: 'Alice Martin',
		event,
		sessionStartTime: startTime,
		timeZone,
		accessToken: 'tok',
	};

	it('is French for a fr Reservation', async () => {
		await sendTicketConfirmationSMS({ ...base, locale: 'fr' });
		const message = await sentMessage();
		expect(message).toContain('La Grande Nuit');
		expect(message).toContain('Bonjour Alice Martin ! Vos billets sont confirmés.');
		expect(message).toContain('📅 1 juin à 19:00');
		expect(message).toContain('http://localhost:5173/tickets/tok');
	});

	it('is English for en (unchanged)', async () => {
		await sendTicketConfirmationSMS({ ...base, locale: 'en' });
		const message = await sentMessage();
		expect(message).toBe(`🎫 The Big Night

Hi Alice Martin! Your tickets are confirmed.

📅 1 Jun at 19:00

View your tickets: http://localhost:5173/tickets/tok

Present your QR code at the entrance. See you there!`);
	});

	it('falls back to English for a null locale', async () => {
		await sendTicketConfirmationSMS({ ...base, locale: null });
		const message = await sentMessage();
		expect(message).toContain('Hi Alice Martin! Your tickets are confirmed.');
		expect(message).toContain('📅 1 Jun at 19:00');
	});
});

describe('sendEventReminderSMS', () => {
	const base = {
		phone: '+15551234567',
		guestName: 'Alice Martin',
		event,
		sessionStartTime: startTime,
		timeZone,
		accessToken: 'tok',
		daysUntil: 1,
	};

	it('is French for a fr Reservation', async () => {
		await sendEventReminderSMS({ ...base, locale: 'fr' });
		const message = await sentMessage();
		expect(message).toContain('🔔 Rappel : La Grande Nuit');
		expect(message).toContain('Votre événement a lieu demain.');
		expect(message).toContain('📅 1 juin à 19:00');
	});

	it('is English for en (unchanged) and for null', async () => {
		await sendEventReminderSMS({ ...base, daysUntil: 3, locale: 'en' });
		expect(await sentMessage()).toContain('coming up in 3 days');
		await sendEventReminderSMS({ ...base, daysUntil: 3, locale: null });
		expect(await sentMessage()).toBe(`🔔 Reminder: The Big Night

Hi Alice Martin! Your event is coming up in 3 days.

📅 1 Jun at 19:00

View your tickets: http://localhost:5173/tickets/tok`);
	});
});

describe('sendTicketReminderSMS', () => {
	const base = {
		phone: '+15551234567',
		name: 'Alice Martin',
		event,
		eventTime: startTime,
		timeZone,
	};

	it('is French for a fr Reservation', async () => {
		await sendTicketReminderSMS({ ...base, locale: 'fr' });
		const message = await sentMessage();
		expect(message).toContain('🔔 Rappel billets : La Grande Nuit');
		expect(message).toContain('📅 1 juin à 19:00');
		expect(message).toContain("N'oubliez pas vos billets ! À bientôt.");
	});

	it('is English for en and null (unchanged)', async () => {
		await sendTicketReminderSMS({ ...base, locale: 'en' });
		expect(await sentMessage()).toContain('Ticket Reminder: The Big Night');
		await sendTicketReminderSMS({ ...base, locale: null });
		const message = await sentMessage();
		expect(message).toBe(`🔔 Ticket Reminder: The Big Night

Hi Alice Martin! Here's a reminder for your upcoming event.

📅 1 Jun at 19:00

Don't forget to bring your tickets! See you there.`);
	});
});

describe('sendCancellationSMS', () => {
	const base = {
		phone: '+15551234567',
		name: 'Alice Martin',
		event,
		sessionStartTime: startTime,
		timeZone,
	};

	it('is French for a fr Reservation', async () => {
		await sendCancellationSMS({ ...base, locale: 'fr' });
		const message = await sentMessage();
		expect(message).toContain('Réservation annulée : La Grande Nuit');
		expect(message).toContain('du 1 juin à 19:00 a été annulée.');
	});

	it('is English for en and null (unchanged)', async () => {
		await sendCancellationSMS({ ...base, locale: 'en' });
		expect(await sentMessage()).toContain('Reservation Cancelled: The Big Night');
		await sendCancellationSMS({ ...base, locale: null });
		expect(await sentMessage()).toBe(`Reservation Cancelled: The Big Night

Hi Alice Martin, your reservation for 1 Jun at 19:00 has been cancelled.

Questions? Contact us.`);
	});
});

describe('sendRefundSMS', () => {
	const base = {
		phone: '+15551234567',
		name: 'Alice Martin',
		event,
		amount: 5000,
		currency: 'EUR',
	};

	it('is French for a fr Reservation', async () => {
		await sendRefundSMS({ ...base, locale: 'fr' });
		const message = await sentMessage();
		expect(message).toContain('💳 Remboursement effectué : La Grande Nuit');
		// French currency formatting (fr-FR): 50,00 €
		expect(message).toMatch(/50[.,]00\s€/);
		expect(message).toContain('5 à 10 jours ouvrables');
	});

	it('is English for en and null (unchanged)', async () => {
		await sendRefundSMS({ ...base, locale: 'en' });
		expect(await sentMessage()).toContain('$50.00'.replace('$', '€'));
		await sendRefundSMS({ ...base, locale: null });
		const message = await sentMessage();
		expect(message).toBe(`💳 Refund Processed: The Big Night

Hi Alice Martin, your reservation has been cancelled and €50.00 has been refunded.

It may take 5-10 business days to appear on your statement.`);
	});
});

describe('French title fallback (as in the emails, issue 026)', () => {
	it('falls back to the English title when the French one is missing', async () => {
		await sendCancellationSMS({
			phone: '+15551234567',
			name: 'Alice Martin',
			event: { titleEn: 'The Big Night', titleFr: null },
			sessionStartTime: startTime,
			timeZone,
			locale: 'fr',
		});
		expect(await sentMessage()).toContain('Réservation annulée : The Big Night');
	});
});
