// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { events, eventSessions, eventDays, eventServices } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import type { CreateEventSessionInput } from '../../src/lib/types/event-sessions';

// ---------------------------------------------------------------------------
// Schedule behaviour behind the unchanged admin session editor: creating,
// moving and deleting a Seating keeps it attached to the right Day →
// Service and recomputes the Event's derived dates.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

let event: typeof events.$inferSelect;

async function seedEvent() {
	const [row] = await testDb
		.insert(events)
		.values({
			titleEn: 'Schedule Event',
			titleFr: 'Événement Plan',
			slug: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01T00:00:00Z'),
			endDate: new Date('2099-12-31T23:59:59Z'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			published: true,
		})
		.returning();
	event = row;
}

function sessionInput(overrides: Partial<CreateEventSessionInput> = {}): CreateEventSessionInput {
	return {
		eventId: event.id,
		titleEn: 'Seating',
		titleFr: 'Séance',
		startTime: new Date('2099-06-10T19:00:00Z'),
		endTime: new Date('2099-06-10T22:00:00Z'),
		totalCapacity: 20,
		priceAmount: 5000,
		published: true,
		...overrides,
	};
}

async function loadSchedule(eventId: string) {
	const rows = await testDb
		.select({
			dayDate: eventDays.date,
			kind: eventServices.kind,
			duration: eventServices.defaultSeatingDurationMinutes,
			sessionId: eventSessions.id,
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(eventSessions.eventId, eventId));
	return rows.map((row) => ({
		...row,
		dayDate: typeof row.dayDate === 'string' ? row.dayDate : String(row.dayDate).slice(0, 10),
	}));
}

describe('event schedule (Days → Services → Seatings)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedEvent();
	});

	it('creating a Seating wraps it in one Day + one Service and derives the Event dates', async () => {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');

		const session = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T12:00:00Z'),
			endTime: new Date('2099-06-10T13:30:00Z'),
		}));

		const schedule = await loadSchedule(event.id);
		expect(schedule).toEqual([
			{ dayDate: '2099-06-10', kind: 'lunch', duration: 90, sessionId: session.id },
		]);

		const [updated] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(updated.startDate.toISOString()).toBe('2099-06-10T00:00:00.000Z');
		expect(updated.endDate.toISOString()).toBe('2099-06-10T23:59:59.999Z');
	});

	it('Seatings on the same Day and meal share one Service; other meals get their own', async () => {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');

		const lunch1 = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T12:00:00Z'),
			endTime: new Date('2099-06-10T13:15:00Z'),
		}));
		const lunch2 = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T12:45:00Z'),
			endTime: new Date('2099-06-10T14:00:00Z'),
		}));
		const dinner = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T19:30:00Z'),
			endTime: new Date('2099-06-10T22:30:00Z'),
		}));

		expect(lunch1.serviceId).toBe(lunch2.serviceId);
		expect(dinner.serviceId).not.toBe(lunch1.serviceId);

		// One Day, two Services, three Seatings
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days).toHaveLength(1);
		const services = await testDb.select().from(eventServices);
		expect(services).toHaveLength(2);
	});

	it('a Seating on a new first Day moves the Event start date', async () => {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');

		await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T19:00:00Z'),
			endTime: new Date('2099-06-10T22:00:00Z'),
		}));
		await createEventSession(sessionInput({
			startTime: new Date('2099-06-03T12:00:00Z'),
			endTime: new Date('2099-06-03T13:00:00Z'),
		}));

		const [updated] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(updated.startDate.toISOString()).toBe('2099-06-03T00:00:00.000Z');
		expect(updated.endDate.toISOString()).toBe('2099-06-10T23:59:59.999Z');
	});

	it('moving a Seating across the cut-off re-attaches it and prunes the emptied schedule nodes', async () => {
		const { createEventSession, updateEventSession } = await import('../../src/lib/server/services/event-sessions');

		const session = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T12:00:00Z'),
			endTime: new Date('2099-06-10T13:30:00Z'),
		}));

		await updateEventSession(session.id, {
			startTime: new Date('2099-06-12T19:00:00Z'),
			endTime: new Date('2099-06-12T22:00:00Z'),
		});

		// The Seating now sits under a dinner Service on the new Day; the
		// lunch Service and the emptied Day are gone.
		const schedule = await loadSchedule(event.id);
		expect(schedule).toEqual([
			{ dayDate: '2099-06-12', kind: 'dinner', duration: 180, sessionId: session.id },
		]);
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days.map((d) => d.date)).toEqual(['2099-06-12']);

		const [updated] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(updated.startDate.toISOString()).toBe('2099-06-12T00:00:00.000Z');
		expect(updated.endDate.toISOString()).toBe('2099-06-12T23:59:59.999Z');
	});

	it('a Seating outside the hand-set window is rejected while the Event has no Days', async () => {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');

		await expect(createEventSession(sessionInput({
			startTime: new Date('2098-06-10T12:00:00Z'),
			endTime: new Date('2098-06-10T13:30:00Z'),
		}))).rejects.toThrow('Session times must fall within the event dates');

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings).toHaveLength(0);
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days).toHaveLength(0);
	});

	it('deleting the last Seating prunes its Day and Service', async () => {
		const { createEventSession, deleteEventSession } = await import('../../src/lib/server/services/event-sessions');

		const session = await createEventSession(sessionInput());
		await deleteEventSession(session.id);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings).toHaveLength(0);
		const services = await testDb.select().from(eventServices)
			.where(eq(eventServices.dayId, testDb.select({ id: eventDays.id }).from(eventDays).where(eq(eventDays.eventId, event.id))));
		expect(services).toHaveLength(0);
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days).toHaveLength(0);
	});
	it('hand-set Event dates are kept while it has no Days and ignored once it has', async () => {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');
		const { updateEvent } = await import('../../src/lib/server/services/events');

		const newStart = new Date('2099-03-01T00:00:00Z');
		const newEnd = new Date('2099-03-31T23:59:59Z');
		await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
		let [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe(newStart.toISOString());
		expect(row.endDate.toISOString()).toBe(newEnd.toISOString());

		await createEventSession(sessionInput({
			startTime: new Date('2099-03-10T19:00:00Z'),
			endTime: new Date('2099-03-10T22:00:00Z'),
		}));
		await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
		[row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe('2099-03-10T00:00:00.000Z');
		expect(row.endDate.toISOString()).toBe('2099-03-10T23:59:59.999Z');
	});
});
