// @vitest-environment node
/**
 * Issue 021 — Comps made on the spot: created confirmed, isComp, owing
 * nothing, fully checked in in one transaction, attributed to the actor,
 * with no Ticket email; a full Seating accepts one with the available
 * counter floored at 0; refused without the "offer a Comp" permission.
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

/** A Staff actor with the given permissions, working today. */
function actorAccess(now: string | Date, permissions: StaffPermission[] = ['comp']) {
	const day = dayOf(now, ZONE);
	return staffAccess(
		{ kind: 'assignment', rolePermissions: permissions },
		[day],
		ZONE,
		new Date(now)
	);
}

describe('comps on the spot', () => {
	it('creates a Comp confirmed, isComp, owing nothing, fully checked in, attributed, with no email', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now);

		const { createCompOnTheSpot } = await import('../../src/lib/server/services/comps');
		const result = await createCompOnTheSpot({
			access: actorAccess(now),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: '  Ami du Chef  ',
			quantity: 2,
			email: 'ami@example.com',
			actorId: s.actorId,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservationId));

		expect(reservation.status).toBe('confirmed');
		expect(reservation.isComp).toBe(true);
		expect(reservation.origin).toBe('staff');
		expect(reservation.madeBy).toBe(s.actorId);
		expect(reservation.guestName).toBe('Ami du Chef');
		expect(reservation.totalAmount).toBe(0);
		expect(reservation.depositAmount).toBe(0);
		expect(reservation.balanceAmount).toBe(0);

		const checkInsRows = await testDb
			.select()
			.from(checkIns)
			.where(eq(checkIns.reservationId, reservation.id));
		expect(checkInsRows).toHaveLength(1);
		expect(checkInsRows[0].guests).toBe(2);
		expect(checkInsRows[0].method).toBe('manual');

		const { sendTicketConfirmationEmail } = await import('../../src/lib/server/services/email');
		expect(sendTicketConfirmationEmail).not.toHaveBeenCalled();
	});

	it('accepts a Comp on a full Seating, the available counter floored at 0', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now, 4);
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 0 })
			.where(eq(eventSessions.id, s.seating.id));

		const { createCompOnTheSpot } = await import('../../src/lib/server/services/comps');
		const result = await createCompOnTheSpot({
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

	it('is refused without the comp permission', async () => {
		const now = new Date(`${dayOf(new Date(), ZONE)}T19:30:00Z`);
		const s = await seed(now);

		const { createCompOnTheSpot } = await import('../../src/lib/server/services/comps');
		const result = await createCompOnTheSpot({
			access: actorAccess(now, ['guest_list', 'walk_in']),
			eventId: s.event.id,
			seatingId: s.seating.id,
			name: 'Pas Le Droit',
			quantity: 2,
			actorId: s.actorId,
		});
		expect(result).toEqual({ ok: false, error: "Vous n'avez pas la permission d'offrir un comp." });

		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});
});
