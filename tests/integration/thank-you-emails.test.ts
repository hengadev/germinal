// @vitest-environment node
/**
 * Issue 054 — the post-event Thank-you job's selection and idempotence.
 *
 * Only confirmed, checked-in Reservations with an email are thanked, once
 * (thankYouSentAt), only for Days whose send window is open (10:00 local
 * the morning after, up to 3 days after the Day ended), and only when the
 * Event's Thank-you is on. Language fallback: an empty message falls back
 * to the other language.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, checkIns, emailQueue } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
	},
	// Queue the Thank-you for real: the test asserts on the email queue.
	isBrevoConfigured: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

// The Event's clock is Paris; its single Day is 2030-01-10, so the send
// window opens 2030-01-11 10:00 local (09:00 UTC) and closes 2030-01-14
// 06:00 local. `now` sits inside it.
const NOW = new Date('2030-01-12T12:00:00Z');

async function seedEvent(thankYouEnabled: boolean) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Winter Table',
			titleFr: 'Table d’hiver',
			descriptionEn: 'd',
			descriptionFr: 'd',
			startDate: new Date('2030-01-10'),
			endDate: new Date('2030-01-10'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			depositType: 'fixed',
			depositValue: 2000,
			thankYouEnabled,
			// No English message: it falls back to the French one.
			thankYouMessageFr: 'Merci d’avoir été des nôtres.',
			thankYouMessageEn: null,
			thankYouLinkUrl: 'https://example.com/photos',
			thankYouLinkLabelFr: 'Voir les photos',
			thankYouLinkLabelEn: null,
		})
		.returning();

	const startTime = new Date('2030-01-10T19:00:00Z');
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, new Date('2030-01-10T21:00:00Z')),
			startTime,
			endTime: new Date('2030-01-10T21:00:00Z'),
			totalCapacity: 40,
			availableCapacity: 40,
			published: true,
		})
		.returning();
	return { event, seating };
}

let seq = 0;
async function seedReservation(
	seatingId: string,
	values: {
		guestName: string;
		status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
		email?: string | null;
		locale?: string | null;
		thanked?: boolean;
	}
) {
	seq += 1;
	const [row] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: seatingId,
			guestEmail: values.email === undefined ? `guest${seq}@example.com` : values.email,
			guestName: values.guestName,
			quantity: 2,
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			currency: 'EUR',
			status: values.status ?? 'confirmed',
			locale: values.locale ?? null,
			accessToken: `atk-thankyou-${Date.now()}-${seq}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
			thankYouSentAt: values.thanked ? new Date('2030-01-11T10:00:00Z') : null,
		})
		.returning();
	return row;
}

async function seedCheckIn(reservationId: string, guests = 2, undone = false) {
	await testDb.insert(checkIns).values({
		reservationId,
		guests,
		method: 'manual',
		undoneAt: undone ? new Date() : null,
	});
}

async function queuedThankYous() {
	return testDb.select().from(emailQueue).where(eq(emailQueue.type, 'thank_you'));
}

describe('sendThankYouEmails', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('thanks only confirmed, checked-in Reservations with an email, once', async () => {
		const { seating } = await seedEvent(true);

		// Thanked: confirmed, checked in, with an email.
		const guest = await seedReservation(seating.id, { guestName: 'Guest' });
		await seedCheckIn(guest.id);

		// Not thanked: no Check-in.
		await seedReservation(seating.id, { guestName: 'No show' });
		// Not thanked: only an undone Check-in.
		const undone = await seedReservation(seating.id, { guestName: 'Undone' });
		await seedCheckIn(undone.id, 2, true);
		// Not thanked: cancelled.
		const cancelled = await seedReservation(seating.id, { guestName: 'Cancelled', status: 'cancelled' });
		await seedCheckIn(cancelled.id);
		// Not thanked: no email (a Walk-in shape).
		const noEmail = await seedReservation(seating.id, { guestName: 'No email', email: null });
		await seedCheckIn(noEmail.id);
		// Not thanked: already thanked.
		const thanked = await seedReservation(seating.id, { guestName: 'Thanked', thanked: true });
		await seedCheckIn(thanked.id);

		const { sendThankYouEmails } = await import('../../src/lib/server/jobs/send-thank-you-emails');
		const result = await sendThankYouEmails(NOW);
		expect(result.sent).toBe(1);

		const queued = await queuedThankYous();
		expect(queued).toHaveLength(1);
		expect(queued[0].recipient).toBe(guest.guestEmail);
		// The email is in the Guest's language, with the French fallback
		// message and label for an English-speaking Guest.
		expect(queued[0].textBody).toContain('Merci d’avoir été des nôtres.');
		expect(queued[0].textBody).toContain('https://example.com/photos');
		expect(queued[0].subject).toContain('Winter Table');

		const [after] = await testDb
			.select({ thankYouSentAt: reservations.thankYouSentAt })
			.from(reservations)
			.where(eq(reservations.id, guest.id));
		expect(after.thankYouSentAt).not.toBeNull();
	});

	it('is idempotent: a second run sends nothing', async () => {
		const { seating } = await seedEvent(true);
		const guest = await seedReservation(seating.id, { guestName: 'Guest' });
		await seedCheckIn(guest.id);

		const { sendThankYouEmails } = await import('../../src/lib/server/jobs/send-thank-you-emails');
		await sendThankYouEmails(NOW);
		const second = await sendThankYouEmails(NOW);
		expect(second.sent).toBe(0);

		expect(await queuedThankYous()).toHaveLength(1);
	});

	it("sends nothing when the Event's Thank-you is off", async () => {
		const { seating } = await seedEvent(false);
		const guest = await seedReservation(seating.id, { guestName: 'Guest' });
		await seedCheckIn(guest.id);

		const { sendThankYouEmails } = await import('../../src/lib/server/jobs/send-thank-you-emails');
		const result = await sendThankYouEmails(NOW);
		expect(result.sent).toBe(0);
		expect(await queuedThankYous()).toHaveLength(0);
	});

	it('sends nothing outside the send window', async () => {
		const { seating } = await seedEvent(true);
		const guest = await seedReservation(seating.id, { guestName: 'Guest' });
		await seedCheckIn(guest.id);

		const { sendThankYouEmails } = await import('../../src/lib/server/jobs/send-thank-you-emails');

		// Before 10:00 the morning after…
		expect((await sendThankYouEmails(new Date('2030-01-11T07:00:00Z'))).sent).toBe(0);
		// …and more than 3 days after the Day ended.
		expect((await sendThankYouEmails(new Date('2030-01-20T12:00:00Z'))).sent).toBe(0);
		expect(await queuedThankYous()).toHaveLength(0);

		// Inside the window (the last hour before it closes), it goes out.
		expect((await sendThankYouEmails(new Date('2030-01-14T04:30:00Z'))).sent).toBe(1);
	});
});
