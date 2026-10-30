// @vitest-environment node
/**
 * Issue 025 — the "Réservation modifiée" email is written in the
 * Reservation's language: French for `fr`, English for `en` and for an
 * unknown language (null), which is the pre-issue behaviour.
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

import {
	generateModifiedTextTemplate,
	sendReservationModifiedEmail,
	type ModifiedEmailData,
} from '../../../src/lib/server/services/email';

const base: ModifiedEmailData = {
	guestEmail: 'guest@example.com',
	guestName: 'Alice Martin',
	eventTitle: 'Dîner',
	sessionTitle: 'Séance du soir',
	sessionStartTime: new Date('2099-06-01T19:00:00Z'),
	timeZone: 'Europe/Paris',
	reservationId: '01234567-89ab-cdef-0123-456789abcdef',
	accessToken: 'tok',
	locale: null,
};

describe('generateModifiedTextTemplate (issue 025)', () => {
	it('writes French when locale is fr', () => {
		const text = generateModifiedTextTemplate({ ...base, locale: 'fr' });
		expect(text).toContain('Réservation modifiée');
		expect(text).toContain('Bonjour Alice Martin');
		expect(text).toContain('NOUVELLE SÉANCE');
		expect(text).toContain('Vos billets restent valables, inutile de réserver à nouveau');
		expect(text).toContain('notification automatique');
	});

	it('writes English when locale is en', () => {
		const text = generateModifiedTextTemplate({ ...base, locale: 'en', eventTitle: 'Dinner' });
		expect(text).toContain('Reservation Modified');
		expect(text).toContain('Hi Alice Martin');
		expect(text).toContain('NEW SEATING');
		expect(text).toContain('Your tickets remain valid');
	});

	it('falls back to English when locale is null', () => {
		const text = generateModifiedTextTemplate(base);
		expect(text).toContain('Reservation Modified');
	});
});

describe('sendReservationModifiedEmail (issue 025)', () => {
	it('queues a French subject for fr, an English one for en or null', async () => {
		queueEmailMock.mockClear();
		await sendReservationModifiedEmail({ ...base, locale: 'fr' });
		await sendReservationModifiedEmail({ ...base, locale: 'en' });
		await sendReservationModifiedEmail(base);

		expect(queueEmailMock).toHaveBeenCalledTimes(3);
		expect(queueEmailMock.mock.calls[0][0].subject).toBe('Réservation modifiée - Dîner');
		expect(queueEmailMock.mock.calls[1][0].subject).toBe('Reservation Modified - Dîner');
		expect(queueEmailMock.mock.calls[2][0].subject).toBe('Reservation Modified - Dîner');
		// The HTML body carries its language.
		expect(queueEmailMock.mock.calls[0][0].htmlBody).toContain('<html lang="fr">');
		expect(queueEmailMock.mock.calls[1][0].htmlBody).toContain('<html lang="en">');
	});

	it('sends nothing without a Guest email', async () => {
		queueEmailMock.mockClear();
		await sendReservationModifiedEmail({ ...base, guestEmail: null });
		expect(queueEmailMock).not.toHaveBeenCalled();
	});
});
