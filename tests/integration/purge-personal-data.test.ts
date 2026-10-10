// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	auditLog,
	contactSubmissions,
	emailQueue,
	events,
	eventSessions,
	reservations,
	sessions,
	tasks,
	users,
	waitlist,
} from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false },
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

const { purgePersonalData, ANONYMISED_EMAIL, ANONYMISED_NAME } = await import(
	'../../src/lib/server/jobs/purge-personal-data'
);

const NOW = new Date('2030-06-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	await setupTestDatabase();
	await testDb.delete(auditLog);
	await testDb.delete(users);
});

async function seedSession(endedDaysAgo: number) {
	const end = daysBefore(endedDaysAgo);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Test Event',
			titleFr: 'Événement Test',
			slug: `purge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			locationEn: 'Paris',
			locationFr: 'Paris',
			startDate: new Date(end.getTime() - DAY),
			endDate: end,
			published: true,
		})
		.returning();
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			titleEn: 'Session',
			titleFr: 'Session',
			startTime: new Date(end.getTime() - 4 * 60 * 60 * 1000),
			endTime: end,
			totalCapacity: 10,
			availableCapacity: 10,
			priceAmount: 2500,
			published: true,
		})
		.returning();
	return session;
}

async function seedReservation(
	sessionId: string,
	values: Partial<typeof reservations.$inferInsert> = {}
) {
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: 'guest@example.com',
			guestName: 'Real Guest',
			guestPhone: '+33600000000',
			ipAddress: '203.0.113.7',
			userAgent: 'Mozilla/5.0',
			totalAmount: 2500,
			status: 'confirmed',
			accessToken: `atk-${Math.random().toString(36).slice(2, 12)}`,
			expiresAt: NOW,
			createdAt: NOW,
			...values,
		})
		.returning();
	return reservation;
}

async function reservation(id: string) {
	const [row] = await testDb.select().from(reservations).where(eq(reservations.id, id));
	return row;
}

describe('purgePersonalData', () => {
	it('anonymises a reservation one year after its session, keeping the amounts', async () => {
		const old = await seedReservation((await seedSession(366)).id);
		const recent = await seedReservation((await seedSession(300)).id);

		const result = await purgePersonalData(NOW);

		expect(result.reservationsAnonymised).toBe(1);
		const anonymised = await reservation(old.id);
		expect(anonymised).toMatchObject({
			guestEmail: ANONYMISED_EMAIL,
			guestName: ANONYMISED_NAME,
			guestPhone: null,
			ipAddress: null,
			userAgent: null,
			totalAmount: 2500,
			status: 'confirmed',
		});
		expect((await reservation(recent.id)).guestEmail).toBe('guest@example.com');
	});

	it('anonymises a never-paid reservation 30 days after it expired', async () => {
		const session = await seedSession(-60); // session still in the future
		const abandoned = await seedReservation(session.id, {
			status: 'expired',
			expiresAt: daysBefore(31),
		});
		const fresh = await seedReservation(session.id, {
			status: 'expired',
			expiresAt: daysBefore(10),
		});

		await purgePersonalData(NOW);

		expect((await reservation(abandoned.id)).guestEmail).toBe(ANONYMISED_EMAIL);
		expect((await reservation(fresh.id)).guestEmail).toBe('guest@example.com');
	});

	it('clears IP and user agent after 12 months even before the session ends', async () => {
		const session = await seedSession(-30);
		const booked = await seedReservation(session.id, { createdAt: daysBefore(366) });

		const result = await purgePersonalData(NOW);

		expect(result.technicalDataCleared).toBe(1);
		const row = await reservation(booked.id);
		expect(row.ipAddress).toBeNull();
		expect(row.userAgent).toBeNull();
		expect(row.guestEmail).toBe('guest@example.com');
	});

	it('deletes old waitlist entries, contact messages and sent emails, and nothing recent', async () => {
		const ended = await seedSession(31);
		const upcoming = await seedSession(-10);
		for (const sessionId of [ended.id, upcoming.id]) {
			await testDb.insert(waitlist).values({
				eventSessionId: sessionId,
				email: 'w@example.com',
				name: 'Waiting',
				expiresAt: NOW,
			});
		}
		for (const createdAt of [daysBefore(366), daysBefore(10)]) {
			await testDb.insert(contactSubmissions).values({
				name: 'Someone',
				email: 'c@example.com',
				inquiryType: 'other',
				message: 'Hello',
				createdAt,
			});
		}
		for (const [status, createdAt] of [
			['sent', daysBefore(31)],
			['failed', daysBefore(31)],
			['pending', daysBefore(31)],
			['sent', daysBefore(5)],
		] as const) {
			await testDb.insert(emailQueue).values({
				type: 'ticket_confirmation',
				recipient: 'e@example.com',
				subject: 'Ticket',
				textBody: 'Hi',
				htmlBody: '<p>Hi</p>',
				status,
				createdAt,
			});
		}

		const result = await purgePersonalData(NOW);

		expect(result).toMatchObject({
			waitlistDeleted: 1,
			contactSubmissionsDeleted: 1,
			emailsDeleted: 2,
		});
		expect(await testDb.select().from(waitlist)).toHaveLength(1);
		expect(await testDb.select().from(contactSubmissions)).toHaveLength(1);
		expect(await testDb.select().from(emailQueue)).toHaveLength(2);
	});

	it('is idempotent: a second run changes nothing', async () => {
		await seedReservation((await seedSession(400)).id);
		await purgePersonalData(NOW);

		const second = await purgePersonalData(NOW);

		expect(second).toEqual({
			reservationsAnonymised: 0,
			technicalDataCleared: 0,
			waitlistDeleted: 0,
			contactSubmissionsDeleted: 0,
			emailsDeleted: 0,
			teamAccountsAnonymised: 0,
			auditLogDeleted: 0,
		});
	});

	async function seedUser(values: Partial<typeof users.$inferInsert>) {
		const [user] = await testDb
			.insert(users)
			.values({
				email: `${Math.random().toString(36).slice(2, 10)}@example.com`,
				firstName: 'Team',
				lastName: 'Member',
				phone: '+33600000001',
				passwordHash: 'hash',
				role: 'staff',
				...values,
			})
			.returning();
		return user;
	}

	it('anonymises a team account a year after deactivation, keeping its row and tasks', async () => {
		const gone = await seedUser({ role: 'user', deactivatedAt: daysBefore(366) });
		const recent = await seedUser({ role: 'user', deactivatedAt: daysBefore(100) });
		const legacy = await seedUser({ role: 'user', updatedAt: daysBefore(400) });
		const active = await seedUser({ role: 'staff', updatedAt: daysBefore(800) });
		const session = await seedSession(-10);
		await testDb.insert(tasks).values({
			eventId: (await testDb.select().from(eventSessions).where(eq(eventSessions.id, session.id)))[0].eventId,
			createdBy: gone.id,
			title: 'Task',
		});
		await testDb.insert(sessions).values({ id: 'sess-gone', userId: gone.id, expiresAt: NOW });

		const result = await purgePersonalData(NOW);

		expect(result.teamAccountsAnonymised).toBe(2);
		const [row] = await testDb.select().from(users).where(eq(users.id, gone.id));
		expect(row).toMatchObject({
			email: `former-${gone.id}@former-member.invalid`,
			firstName: 'Former',
			lastName: 'team member',
			phone: null,
			passwordHash: '!',
		});
		expect(await testDb.select().from(tasks)).toHaveLength(1);
		expect(await testDb.select().from(sessions)).toHaveLength(0);
		for (const kept of [recent, active]) {
			const [r] = await testDb.select().from(users).where(eq(users.id, kept.id));
			expect(r.email).toBe(kept.email);
		}
		const [l] = await testDb.select().from(users).where(eq(users.id, legacy.id));
		expect(l.firstName).toBe('Former');

		expect((await purgePersonalData(NOW)).teamAccountsAnonymised).toBe(0);
	});

	it('deletes audit log entries older than 3 years', async () => {
		for (const createdAt of [daysBefore(3 * 365 + 1), daysBefore(30)]) {
			await testDb.insert(auditLog).values({ action: 'test', entityType: 'event', createdAt });
		}

		const result = await purgePersonalData(NOW);

		expect(result.auditLogDeleted).toBe(1);
		expect(await testDb.select().from(auditLog)).toHaveLength(1);
	});
});
