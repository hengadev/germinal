// @vitest-environment node
/**
 * Issue 055 — Erase a Guest's data (RGPD). eraseGuest anonymises every
 * Reservation with that normalised email, clears Dietary Requirements and
 * consent, deletes the notes-and-tags row, the subscriber row and the
 * waitlist entries — and refuses while a confirmed Reservation sits on a
 * Seating that hasn't ended. The audit entry records counts only.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	auditLog,
	eventDays,
	events,
	eventServices,
	eventSessions,
	guestNotes,
	reservations,
	subscribers,
	users,
	waitlist
} from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL
} from '../fixtures/database';
import { eraseGuest } from '../../src/lib/server/services/guest-erasure';
import { guestAuditId } from '../../src/lib/server/services/guest-notes';
import { recordAuditLog } from '../../src/lib/server/services/audit-log';
import { ANONYMISED_EMAIL, ANONYMISED_NAME } from '../../src/lib/server/jobs/purge-personal-data';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	get db() {
		return testDb;
	},
	runMigrations: vi.fn(),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173'
	}
}));

beforeEach(async () => {
	await setupTestDatabase();
});

afterAll(async () => {
	await closeTestDatabase();
});

const ZONE = 'Europe/Paris';

/** An Event with one Day, one Service, and one Seating per call. */
async function seedSeating(now: Date, hoursFromNow: number): Promise<string> {
	const day = new Date(now.getTime() + hoursFromNow * 3600 * 1000);
	const date = day.toISOString().slice(0, 10);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date(`${date}T19:00:00Z`),
			endDate: new Date(`${date}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE
		})
		.returning();
	const [dayRow] = await testDb
		.insert(eventDays)
		.values({ eventId: event.id, date })
		.returning();
	const [service] = await testDb
		.insert(eventServices)
		.values({ dayId: dayRow.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: service.id,
			startTime: new Date(now.getTime() + (hoursFromNow - 1) * 3600 * 1000),
			endTime: day
		})
		.returning();
	return seating.id;
}

async function seedReservation(
	seatingId: string,
	email: string,
	status: 'confirmed' | 'pending' | 'cancelled' | 'expired' = 'confirmed',
	expires: Date = new Date(Date.now() + 3600 * 1000)
) {
	const [row] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: seatingId,
			guestEmail: email,
			guestName: 'Jeanne Example',
			guestPhone: '+33612345678',
			quantity: 2,
			totalAmount: 5000,
			depositAmount: 5000,
			balanceAmount: 0,
			currency: 'EUR',
			status,
			dietaryRequirements: 'Végétarien',
			dietaryConsentAt: new Date(),
			ipAddress: '1.2.3.4',
			userAgent: 'test-agent',
			accessToken: crypto.randomUUID().replace(/-/g, ''),
			expiresAt: expires
		})
		.returning();
	return row;
}

async function seedSubscriber(email: string) {
	return testDb
		.insert(subscribers)
		.values({
			email,
			name: 'Jeanne',
			source: 'booking',
			consentAt: new Date(),
			confirmedAt: new Date(),
			confirmationToken: crypto.randomUUID().replace(/-/g, ''),
			unsubscribeToken: crypto.randomUUID().replace(/-/g, '')
		})
		.returning();
}

describe('eraseGuest (issue 055)', () => {
	it('anonymises reservations (any case), clears dietary data, deletes note, subscriber and waitlist', async () => {
		const now = new Date();
		const pastSeating = await seedSeating(now, -48);
		const otherPastSeating = await seedSeating(now, -24);
		const reservation = await seedReservation(pastSeating, ' Jeanne@Example.com ');
		await seedReservation(otherPastSeating, 'jeanne@example.com');
		const other = await seedReservation(pastSeating, 'autre@example.com');
		await seedSubscriber('jeanne@example.com');
		await testDb.insert(guestNotes).values({
			email: 'jeanne@example.com',
			note: 'Note privée',
			tags: ['VIP']
		});
		await testDb.insert(waitlist).values({
			eventSessionId: otherPastSeating,
			email: 'Jeanne@Example.com',
			name: 'Jeanne',
			quantity: 2,
			expiresAt: new Date(now.getTime() + 3600 * 1000)
		});

		const result = await eraseGuest('jeanne@example.com', now);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.counts).toEqual({
			reservationsAnonymised: 2,
			notesDeleted: 1,
			subscribersDeleted: 1,
			waitlistDeleted: 1
		});

		const [erased] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(erased.guestEmail).toBe(ANONYMISED_EMAIL);
		expect(erased.guestName).toBe(ANONYMISED_NAME);
		expect(erased.guestPhone).toBeNull();
		expect(erased.ipAddress).toBeNull();
		expect(erased.userAgent).toBeNull();
		expect(erased.dietaryRequirements).toBeNull();
		expect(erased.dietaryConsentAt).toBeNull();
		// Accounting data survives.
		expect(erased.totalAmount).toBe(5000);
		expect(erased.status).toBe('confirmed');

		expect(await testDb.select().from(guestNotes)).toHaveLength(0);
		expect(await testDb.select().from(subscribers)).toHaveLength(0);
		expect(await testDb.select().from(waitlist)).toHaveLength(0);

		// Other guests keep their data.
		const [untouched] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, other.id));
		expect(untouched.guestEmail).toBe('autre@example.com');
	});

	it('refuses with a confirmed reservation on an upcoming seating', async () => {
		const now = new Date();
		const futureSeating = await seedSeating(now, 48);
		const reservation = await seedReservation(futureSeating, 'jeanne@example.com');

		const result = await eraseGuest('jeanne@example.com', now);
		expect(result.ok).toBe(false);

		const [row] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(row.guestEmail).toBe('jeanne@example.com');
	});

	it('is idempotent and the audit entry holds counts only, never the email', async () => {
		const now = new Date();
		const pastSeating = await seedSeating(now, -48);
		await seedReservation(pastSeating, 'jeanne@example.com');

		const [admin] = await testDb
			.insert(users)
			.values({
				email: 'admin@example.com',
				firstName: 'Ada',
				lastName: 'Min',
				passwordHash: 'x',
				role: 'admin'
			})
			.returning();

		const first = await eraseGuest('jeanne@example.com', now);
		expect(first.ok).toBe(true);
		const second = await eraseGuest('jeanne@example.com', now);
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.counts?.reservationsAnonymised).toBe(0);

		await recordAuditLog({
			adminId: admin.id,
			action: 'guest.erase',
			entityType: 'guest',
			entityId: guestAuditId('jeanne@example.com'),
			metadata: first.ok ? first.counts : undefined
		});

		const entries = await testDb.select().from(auditLog);
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry.entityId).toBe(guestAuditId('jeanne@example.com'));
		expect(entry.entityId).not.toContain('jeanne');
		const raw = JSON.stringify(entry.metadata ?? {});
		expect(raw).not.toContain('jeanne@example.com');
		expect((entry.metadata as Record<string, number>).reservationsAnonymised).toBe(1);
	});
});
