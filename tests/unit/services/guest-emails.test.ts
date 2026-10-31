// @vitest-environment node
/**
 * Issue 026 — the four Guest emails (ticket confirmation, event reminder,
 * cancellation, refund) are written in the Reservation's language: French
 * for `fr`, English for `en` and for an unknown language (null), which is
 * the pre-issue behaviour. Also covers a caller passing the stored locale
 * through (the cancellation notification path).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/server/env', () => ({
	env: { PUBLIC_URL: 'http://localhost:5173' },
	isBrevoConfigured: () => true,
}));

vi.mock('../../../src/lib/server/logger', () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: queueEmailMock,
}));

vi.mock('../../../src/lib/server/db', () => ({ db: {} }));

import {
	generateTicketTextTemplate,
	generateTicketHtmlTemplate,
	generateEventReminderTextTemplate,
	generateEventReminderHtmlTemplate,
	generateCancellationTextTemplate,
	sendTicketConfirmationEmail,
	sendEventReminderEmail,
	sendCancellationEmail,
	sendRefundEmail,
} from '../../../src/lib/server/services/email';
import { notifyGuestOfCancellation } from '../../../src/lib/server/services/cancellation-effects';
import type { CancellationEmailData, RefundEmailData } from '../../../src/lib/server/services/email';
import type { TicketEmailData } from '../../../src/lib/types/reservations';

const startTime = new Date('2099-06-01T19:00:00Z');

const reservation = {
	id: '01234567-89ab-cdef-0123-456789abcdef',
	quantity: 2,
	totalAmount: 5000,
	depositAmount: 5000,
	discountAmount: null,
	balanceAmount: 0,
	currency: 'EUR',
} as any;

const ticketBase: TicketEmailData = {
	guestEmail: 'guest@example.com',
	guestName: 'Alice Martin',
	accessToken: 'tok',
	reservation,
	session: { titleEn: 'Evening', titleFr: 'Soirée', startTime } as any,
	event: {
		id: 'e1',
		titleEn: 'Dinner',
		titleFr: 'Dîner',
		locationEn: 'London',
		locationFr: 'Londres',
		timeZone: 'Europe/Paris',
	},
};

describe('ticket confirmation email (issue 026)', () => {
	it('writes French when locale is fr', () => {
		const data = { ...ticketBase, locale: 'fr' as const };
		const text = generateTicketTextTemplate(data);
		expect(text).toContain('Confirmation de votre billet');
		expect(text).toContain('Bonjour Alice Martin');
		expect(text).toContain('Vos billets pour Dîner sont confirmés');
		expect(text).toContain("DÉTAILS DE L'ÉVÉNEMENT :");
		expect(text).toContain('Londres');
		// Amounts formatted the French way, and the Seating's French title.
		expect(text).toContain('50,00\u00a0€');
		expect(text).toContain('Soirée');
		expect(text).toContain('Ceci est une confirmation automatique de Germinal.');

		const html = generateTicketHtmlTemplate(data);
		expect(html).toContain('<html lang="fr">');
		expect(html).toContain('Voir vos billets');
		expect(html).toContain('Dîner');
	});

	it('falls back to the English Event title when the French one is empty', () => {
		const text = generateTicketTextTemplate({
			...ticketBase,
			locale: 'fr',
			event: { ...ticketBase.event, titleFr: null, locationFr: null },
		});
		expect(text).toContain('Vos billets pour Dinner sont confirmés');
		expect(text).toContain('London');
	});

	it('writes English when locale is en, and when it is null', () => {
		for (const locale of ['en', null] as const) {
			const text = generateTicketTextTemplate({ ...ticketBase, locale });
			expect(text).toContain('Your Ticket Confirmation');
			expect(text).toContain('Hi Alice Martin');
			expect(text).toContain('Your tickets for Dinner are confirmed');
			expect(text).toContain('€50.00');
			expect(text).toContain('This is an automated confirmation from Germinal.');
			const html = generateTicketHtmlTemplate({ ...ticketBase, locale });
			expect(html).toContain('<html lang="en">');
			expect(html).toContain('View Your Tickets');
		}
	});
});

describe('event reminder email (issue 026)', () => {
	it('writes French when locale is fr', () => {
		const data = { ...ticketBase, locale: 'fr' as const, daysUntil: 1 };
		const text = generateEventReminderTextTemplate(data);
		expect(text).toContain('Rappel d’événement : Dîner');
		expect(text).toContain('votre événement a lieu demain');
		expect(text).toContain('VOIR VOS BILLETS');
		expect(text).toContain('Ceci est un rappel automatique de Germinal.');

		const html = generateEventReminderHtmlTemplate(data);
		expect(html).toContain('<html lang="fr">');
	});

	it('writes English when locale is en or null', () => {
		for (const locale of ['en', null] as const) {
			const data = { ...ticketBase, locale, daysUntil: 7 };
			const text = generateEventReminderTextTemplate(data);
			expect(text).toContain('Event Reminder: Dinner');
			expect(text).toContain('in 7 days');
			expect(text).toContain('This is an automated reminder from Germinal.');
			const html = generateEventReminderHtmlTemplate(data);
			expect(html).toContain('<html lang="en">');
		}
	});
});

const cancellationBase: CancellationEmailData = {
	guestEmail: 'guest@example.com',
	guestName: 'Alice Martin',
	eventTitle: 'Dîner',
	sessionTitle: 'Soirée',
	sessionStartTime: startTime,
	timeZone: 'Europe/Paris',
	reservationId: '01234567-89ab-cdef-0123-456789abcdef',
	locale: null,
};

describe('cancellation email (issue 026)', () => {
	it('writes French when locale is fr', () => {
		const text = generateCancellationTextTemplate({ ...cancellationBase, locale: 'fr' });
		expect(text).toContain('Réservation annulée');
		expect(text).toContain('Bonjour Alice Martin');
		expect(text).toContain('a été annulée');
		expect(text).toContain('Numéro de réservation :');
	});

	it('writes English when locale is en or null', () => {
		for (const locale of ['en', null] as const) {
			const text = generateCancellationTextTemplate({ ...cancellationBase, locale });
			expect(text).toContain('Reservation Cancelled');
			expect(text).toContain('Hi Alice Martin');
			expect(text).toContain('Reservation ID:');
		}
	});

	it('queues the subject in the Guest\'s language and sets <html lang>', async () => {
		queueEmailMock.mockClear();
		await sendCancellationEmail({ ...cancellationBase, locale: 'fr' });
		await sendCancellationEmail({ ...cancellationBase, locale: 'en' });
		expect(queueEmailMock).toHaveBeenCalledTimes(2);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Réservation annulée - Dîner');
		expect(queueEmailMock.mock.calls[0][0].htmlBody).toContain('<html lang="fr">');
		expect(queueEmailMock.mock.calls[1][0].subject).toBe('Reservation Cancelled - Dîner');
		expect(queueEmailMock.mock.calls[1][0].htmlBody).toContain('<html lang="en">');
	});
});

const refundBase: RefundEmailData = {
	guestEmail: 'guest@example.com',
	guestName: 'Alice Martin',
	eventTitle: 'Dîner',
	sessionTitle: 'Soirée',
	sessionStartTime: startTime,
	timeZone: 'Europe/Paris',
	reservationId: '01234567-89ab-cdef-0123-456789abcdef',
	amount: 2500,
	currency: 'EUR',
	isPartialRefund: false,
	locale: null,
};

describe('refund email (issue 026)', () => {
	it('writes French for both refund wordings when locale is fr', async () => {
		queueEmailMock.mockClear();
		await sendRefundEmail({ ...refundBase, locale: 'fr' });
		await sendRefundEmail({ ...refundBase, locale: 'fr', isPartialRefund: true });
		expect(queueEmailMock).toHaveBeenCalledTimes(2);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Remboursement effectué - Dîner');
		expect(queueEmailMock.mock.calls[1][0].subject).toBe('Remboursement partiel effectué - Dîner');
		const text = queueEmailMock.mock.calls[1][0].textBody as string;
		expect(text).toContain('Remboursement partiel effectué');
		expect(text).toContain('un remboursement partiel de 25,00\u00a0€');
		expect(text).toContain('5 à 10 jours ouvrés');
		const html = queueEmailMock.mock.calls[1][0].htmlBody as string;
		expect(html).toContain('<html lang="fr">');
	});

	it('writes English when locale is en or null', async () => {
		queueEmailMock.mockClear();
		await sendRefundEmail({ ...refundBase, locale: 'en' });
		await sendRefundEmail(refundBase);
		expect(queueEmailMock).toHaveBeenCalledTimes(2);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Refund Processed - Dîner');
		expect(queueEmailMock.mock.calls[1][0].subject).toBe('Refund Processed - Dîner');
		expect(queueEmailMock.mock.calls[0][0].textBody).toContain('€25.00');
		expect(queueEmailMock.mock.calls[0][0].textBody).toContain('5-10 business days');
		expect(queueEmailMock.mock.calls[0][0].htmlBody).toContain('<html lang="en">');
	});
});

describe('queued subjects of the ticket emails (issue 026)', () => {
	it('queues the confirmation and reminder subjects in the Guest\'s language', async () => {
		queueEmailMock.mockClear();
		await sendEventReminderEmail({ ...ticketBase, locale: 'fr', daysUntil: 1 });
		expect(queueEmailMock).toHaveBeenCalledTimes(1);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Rappel : Dîner a lieu demain');
		expect(queueEmailMock.mock.calls[0][0].textBody).toContain('Rappel d’événement : Dîner');

		queueEmailMock.mockClear();
		await sendEventReminderEmail({ ...ticketBase, locale: 'en', daysUntil: 3 });
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Reminder: Dinner is coming up in 3 days');
	});
});

describe('notifyGuestOfCancellation passes the stored locale (issue 026)', () => {
	const reservationForNotification = {
		id: '01234567-89ab-cdef-0123-456789abcdef',
		guestEmail: 'guest@example.com',
		guestName: 'Alice Martin',
		guestPhone: null,
		notificationPreference: 'email',
		locale: 'fr',
		eventSession: {
			titleEn: 'Evening',
			titleFr: 'Soirée',
			startTime,
			event: { titleEn: 'Dinner', titleFr: 'Dîner', timeZone: 'Europe/Paris' },
		},
	};

	it('sends the cancellation email in the Reservation\'s language', async () => {
		queueEmailMock.mockClear();
		await notifyGuestOfCancellation(reservationForNotification, null);
		expect(queueEmailMock).toHaveBeenCalledTimes(1);
		const queued = queueEmailMock.mock.calls[0][0];
		expect(queued.subject).toBe('Réservation annulée - Dîner');
		expect(queued.textBody).toContain('Soirée');

		queueEmailMock.mockClear();
		await notifyGuestOfCancellation(
			{ ...reservationForNotification, locale: null },
			{ amount: 2500, currency: 'EUR' }
		);
		expect(queueEmailMock).toHaveBeenCalledTimes(1);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Refund Processed - Dinner');
	});
});
