// @vitest-environment node
/**
 * Issue 020 — Walk-ins: created confirmed and fully checked in in one
 * transaction, owing the full price, attributed, with no Ticket email;
 * a full Seating accepts one with the available counter floored at 0;
 * refused without the permission; a Walk-in without an email breaks no
 * export, reminder or purge path.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	events,
	eventSessions,
	reservations,
	checkIns,
	users,
} from '../../src/lib/server/db/schema';
import { dayOf } from '../../src/lib/utils/event-time';
import { staffAccess, type StaffWho } from '../../src/lib/staff/access';
import type { StaffPermission } from '../../src/lib/staff/permissions';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendTicketConfirmationEmail: vi.fn().mockResolvedValue(undefined),
	sendEventReminderEmail: vi.fn().mockResolvedValue(undefined),
	sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn(),
}));

beforeEach(async () => {
	await setupTestDatabase();
});

afterAll(async () => {
	await closeTestDatabase();
});

const ZONE = 'Europe/Paris';
const UNIT_PRICE = 2500;

async function seed(now: Date, capacity: number | null = null) {
	const today = dayOf(now, ZONE);
	const [actor] = await testDb
		.insert(users)
		.values({
			email: `porte-${crypto.randomUUID()}@example.com`,
			firstName: 'Jean',
			lastName: 'Porte',
			passwordHash: 'x',
			role: 'staff',
		})
		.returning();
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date(`${today}T19:00:00Z`),
			endDate: new Date(`${today}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const serviceId = await seedServiceForSession(
		testDb,
		event.id,
		new Date(`${today}T19:00:00Z`),
		new Date(`${today}T21:00:00Z`),
		{ priceAmount: UNIT_PRICE }
	);
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId,
			startTime: new Date(`${today}T19:00:00Z`),
			endTime: new Date(`${today}T21:00:00Z`),
			totalCapacity: capacity,
			availableCapacity: capacity,
		})
		.returning();

	return { event, seating, today, actorId: actor.id };
}

function accessFor(who: StaffWho, dates: string[], now: Date) {
	return staffAccess(who, dates, ZONE, now);
}

/** A Staff actor with the given permissions, working today. */
function actorAccess(now: string | Date, permissions: StaffPermission[] = ['walk_in']) {
	const day = dayOf(now, ZONE);
	return accessFor({ kind: 'assignment', rolePermissions: permissions }, [day], new Date(now));
}

describe('walk-ins', () => {
	it('creates a Walk-in confirmed, fully checked in, owing the full price, attributed, with no email', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now);
		const access = actorAccess(now);

		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const result = await createWalkIn({
			access,
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: '  Marie Sans Billet  ',
			quantity: 3,
			email: undefined,
			phone: '06 11 22 33 44',
			actorId: s.actorId,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservationId));

		expect(reservation.status).toBe('confirmed');
		expect(reservation.origin).toBe('walk_in');
		expect(reservation.madeBy).toBe(s.actorId);
		expect(reservation.guestName).toBe('Marie Sans Billet');
		expect(reservation.guestEmail).toBeNull();
		expect(reservation.totalAmount).toBe(UNIT_PRICE * 3);
		expect(reservation.depositAmount).toBe(0);
		expect(reservation.balanceAmount).toBe(UNIT_PRICE * 3);

		const checkInsRows = await testDb
			.select()
			.from(checkIns)
			.where(eq(checkIns.reservationId, reservation.id));
		expect(checkInsRows).toHaveLength(1);
		expect(checkInsRows[0].guests).toBe(3);
		expect(checkInsRows[0].method).toBe('manual');

		const { sendTicketConfirmationEmail } = await import('../../src/lib/server/services/email');
		expect(sendTicketConfirmationEmail).not.toHaveBeenCalled();
	});

	it('accepts a Walk-in on a full Seating, the available counter floored at 0', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now, 4);
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 0 })
			.where(eq(eventSessions.id, s.seating.id));

		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const result = await createWalkIn({
			access: actorAccess(now),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: 'Complet Quand Même',
			quantity: 2,
			actorId: s.actorId,
		});
		expect(result.ok).toBe(true);

		const [seating] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, s.seating.id));
		expect(seating.availableCapacity).toBe(0);
	});

	it('is refused without the walk_in permission', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now);

		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const result = await createWalkIn({
			access: actorAccess(now, ['guest_list']),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: 'Pas Le Droit',
			quantity: 2,
			actorId: s.actorId,
		});
		expect(result).toEqual({ ok: false, error: "Vous n'avez pas la permission d'ajouter un walk-in." });

		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});

	it('is refused for a Seating of another Day', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(new Date(now.getTime() + 24 * 3600 * 1000));

		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const result = await createWalkIn({
			access: actorAccess(now),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: 'Autre Jour',
			quantity: 2,
			actorId: s.actorId,
		});
		expect(result.ok).toBe(false);
	});

	it('a Walk-in without an email breaks no export, reminder or purge path', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now);
		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const result = await createWalkIn({
			access: actorAccess(now),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: 'Sans Email',
			quantity: 2,
			actorId: s.actorId,
		});
		expect(result.ok).toBe(true);

		const { exportReservationsToCSV } = await import('../../src/lib/server/services/export');
		const csv = await exportReservationsToCSV({});
		expect(csv).toContain('Sans Email');
		expect(csv).toContain(',,'); // no email, no phone: empty cells

		const { sendEventReminders } = await import('../../src/lib/server/jobs/send-event-reminders');
		await expect(sendEventReminders()).resolves.toBeDefined();

		const { purgePersonalData } = await import('../../src/lib/server/jobs/purge-personal-data');
		await expect(purgePersonalData()).resolves.toBeDefined();

		// Once the Seating is long past, the Walk-in is anonymised like any
		// other party, its NULL email notwithstanding.
		const { ANONYMISED_NAME } = await import('../../src/lib/server/jobs/purge-personal-data');
		await purgePersonalData(new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000));
		const [purged] = await testDb
			.select({ guestName: reservations.guestName, guestPhone: reservations.guestPhone })
			.from(reservations)
			.where(eq(reservations.id, (result as { reservationId: string }).reservationId));
		expect(purged.guestName).toBe(ANONYMISED_NAME);
		expect(purged.guestPhone).toBeNull();
	});
});
