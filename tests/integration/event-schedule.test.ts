// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { events, eventSessions, eventDays, eventServices, reservations } from '../../src/lib/server/db/schema';
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

	it('moving a Seating across the cut-off re-attaches it and keeps the Day and Service it left', async () => {
		const { createEventSession, updateEventSession } = await import('../../src/lib/server/services/event-sessions');

		const session = await createEventSession(sessionInput({
			startTime: new Date('2099-06-10T12:00:00Z'),
			endTime: new Date('2099-06-10T13:30:00Z'),
		}));

		await updateEventSession(session.id, {
			startTime: new Date('2099-06-12T19:00:00Z'),
			endTime: new Date('2099-06-12T22:00:00Z'),
		});

		// The Seating now sits under a dinner Service on the new Day. The
		// lunch Service and its Day stay: Days and Services are picked by the
		// Admin and only the Days picker removes them (issue 020).
		const schedule = await loadSchedule(event.id);
		expect(schedule).toEqual([
			{ dayDate: '2099-06-12', kind: 'dinner', duration: 180, sessionId: session.id },
		]);
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id)).orderBy(eventDays.date);
		expect(days.map((d) => d.date)).toEqual(['2099-06-10', '2099-06-12']);
		const lunch = await testDb.select().from(eventServices).where(eq(eventServices.dayId, days[0].id));
		expect(lunch.map((service) => service.kind)).toEqual(['lunch']);

		const [updated] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(updated.startDate.toISOString()).toBe('2099-06-10T00:00:00.000Z');
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

	it('deleting the last Seating of a draft keeps its picked Day and Service', async () => {
		const { createEventSession, deleteEventSession } = await import('../../src/lib/server/services/event-sessions');
		await testDb.update(events).set({ published: false }).where(eq(events.id, event.id));

		const session = await createEventSession(sessionInput());
		await deleteEventSession(session.id);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings).toHaveLength(0);
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days.map((d) => d.date)).toEqual(['2099-06-10']);
		const services = await testDb.select().from(eventServices).where(eq(eventServices.dayId, days[0].id));
		expect(services.map((service) => service.kind)).toEqual(['dinner']);
	});

	it('refuses to delete the last Seating of a published Event', async () => {
		const { createEventSession, deleteEventSession } = await import('../../src/lib/server/services/event-sessions');
		const { PublishedEventWithoutSeatingError } = await import('../../src/lib/server/services/event-schedule');

		const session = await createEventSession(sessionInput());
		await expect(deleteEventSession(session.id)).rejects.toBeInstanceOf(PublishedEventWithoutSeatingError);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings.map((seating) => seating.id)).toEqual([session.id]);
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

// ---------------------------------------------------------------------------
// Saving the admin Days picker (issue 019): the picked Days and their
// lunch/dinner Services are saved in one transaction, the Event's dates
// follow its first and last Day, and removals touching booked Seatings
// are refused.
// ---------------------------------------------------------------------------

describe('saveEventSchedule (admin Days picker)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedEvent();
	});

	async function loadPickerShape(eventId: string) {
		const rows = await testDb
			.select({ date: eventDays.date, kind: eventServices.kind })
			.from(eventDays)
			.innerJoin(eventServices, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventDays.eventId, eventId))
			.orderBy(eventDays.date, eventServices.kind);
		const days: { date: string; kinds: ('lunch' | 'dinner')[] }[] = [];
		for (const row of rows) {
			const date = typeof row.date === 'string' ? row.date : String(row.date).slice(0, 10);
			const current = days.find((day) => day.date === date);
			if (current) current.kinds.push(row.kind);
			else days.push({ date, kinds: [row.kind] });
		}
		return days;
	}

	async function seedSeating(
		startTime: Date,
		endTime: Date,
		reservationStatuses: ('pending' | 'processing' | 'confirmed' | 'cancelled' | 'expired')[] = []
	) {
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');
		const session = await createEventSession(sessionInput({ startTime, endTime }));
		for (const [i, status] of reservationStatuses.entries()) {
			await testDb.insert(reservations).values({
				eventSessionId: session.id,
				guestEmail: `guest-${i}@example.com`,
				guestName: `Guest ${i}`,
				quantity: 1,
				totalAmount: 5000,
				status,
				accessToken: `tok-${session.id}-${i}-${Math.random().toString(36).slice(2, 8)}`,
				expiresAt: new Date('2099-12-31T23:59:59Z'),
			});
		}
		return session;
	}

	it('saves non-consecutive Days with their meals and derives the Event dates', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');

		await saveEventSchedule(event.id, [
			{ date: '2099-06-08', kinds: ['lunch', 'dinner'] },
			{ date: '2099-06-10', kinds: ['dinner'] },
		]);

		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-08', kinds: ['lunch', 'dinner'] },
			{ date: '2099-06-10', kinds: ['dinner'] },
		]);

		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe('2099-06-08T00:00:00.000Z');
		expect(row.endDate.toISOString()).toBe('2099-06-10T23:59:59.999Z');

		// Services created by the picker get a meal-default duration until a
		// Seating carries one over.
		const services = await testDb.select().from(eventServices);
		expect(services.map((s) => s.defaultSeatingDurationMinutes).sort((a, b) => a - b))
			.toEqual([90, 180, 180]);
	});

	it('adds and removes Days and meals on re-save, re-deriving the dates', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');

		await saveEventSchedule(event.id, [
			{ date: '2099-06-08', kinds: ['dinner'] },
			{ date: '2099-06-10', kinds: ['lunch', 'dinner'] },
		]);
		// Monday stays with dinner only (lunch dropped), Wednesday goes,
		// Thursday dinner is new.
		await saveEventSchedule(event.id, [
			{ date: '2099-06-08', kinds: ['dinner'] },
			{ date: '2099-06-11', kinds: ['dinner'] },
		]);

		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-08', kinds: ['dinner'] },
			{ date: '2099-06-11', kinds: ['dinner'] },
		]);

		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe('2099-06-08T00:00:00.000Z');
		expect(row.endDate.toISOString()).toBe('2099-06-11T23:59:59.999Z');
	});

	it('attaches a later Seating to the picked Service instead of creating a duplicate', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');

		await saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['dinner'] }]);
		const session = await createEventSession(sessionInput());

		const services = await testDb.select().from(eventServices);
		expect(services).toHaveLength(1);
		expect(session.serviceId).toBe(services[0].id);
		// The picked Service keeps its default duration; the Seating did not
		// reset it.
		expect(services[0].defaultSeatingDurationMinutes).toBe(180);
	});

	it('refuses to remove a Day with a live Reservation and writes nothing', async () => {
		const { saveEventSchedule, ScheduleRemovalRefusedError } = await import('../../src/lib/server/services/event-schedule');

		await seedSeating(new Date('2099-06-10T19:00:00Z'), new Date('2099-06-10T22:00:00Z'), ['confirmed']);
		await saveEventSchedule(event.id, [
			{ date: '2099-06-10', kinds: ['dinner'] },
			{ date: '2099-06-12', kinds: ['dinner'] },
		]);

		const attempt = saveEventSchedule(event.id, [{ date: '2099-06-12', kinds: ['dinner'] }]);
		await expect(attempt).rejects.toBeInstanceOf(ScheduleRemovalRefusedError);
		await expect(attempt).rejects.toThrow(/journée du .*réservation en cours/);

		// Nothing was written: the Day, its Service and the dates stay.
		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-10', kinds: ['dinner'] },
			{ date: '2099-06-12', kinds: ['dinner'] },
		]);
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe('2099-06-10T00:00:00.000Z');
		expect(row.endDate.toISOString()).toBe('2099-06-12T23:59:59.999Z');
	});

	it('refuses to remove a meal on a kept Day when its Seating is booked', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');

		await seedSeating(new Date('2099-06-10T12:00:00Z'), new Date('2099-06-10T13:30:00Z'), ['pending']);
		await saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['lunch'] }]);

		await expect(
			saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['dinner'] }])
		).rejects.toThrow(/déjeuner du .*réservation en cours/);

		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-10', kinds: ['lunch'] },
		]);
	});

	it('refuses to remove a Day whose Seatings only hold past Reservations', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');

		await seedSeating(new Date('2099-06-10T19:00:00Z'), new Date('2099-06-10T22:00:00Z'), ['cancelled', 'expired']);
		await saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['dinner'] }]);

		await expect(
			saveEventSchedule(event.id, [{ date: '2099-06-12', kinds: ['dinner'] }])
		).rejects.toThrow(/journée du .*réservations passées/);

		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-10', kinds: ['dinner'] },
		]);
	});

	it('removes a Day whose Seatings were never reserved, cascading the Seatings', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');
		await testDb.update(events).set({ published: false }).where(eq(events.id, event.id));

		const session = await seedSeating(new Date('2099-06-10T19:00:00Z'), new Date('2099-06-10T22:00:00Z'));
		await saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['dinner'] }]);
		await saveEventSchedule(event.id, [{ date: '2099-06-12', kinds: ['dinner'] }]);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.id, session.id));
		expect(seatings).toHaveLength(0);
		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-12', kinds: ['dinner'] },
		]);

		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.startDate.toISOString()).toBe('2099-06-12T00:00:00.000Z');
		expect(row.endDate.toISOString()).toBe('2099-06-12T23:59:59.999Z');
	});

	it('refuses removals that would leave a published Event without any Seating', async () => {
		const { saveEventSchedule, PublishedEventWithoutSeatingError } = await import('../../src/lib/server/services/event-schedule');

		const session = await seedSeating(new Date('2099-06-10T19:00:00Z'), new Date('2099-06-10T22:00:00Z'));
		await saveEventSchedule(event.id, [{ date: '2099-06-10', kinds: ['dinner'] }]);

		await expect(
			saveEventSchedule(event.id, [{ date: '2099-06-12', kinds: ['dinner'] }])
		).rejects.toBeInstanceOf(PublishedEventWithoutSeatingError);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.id, session.id));
		expect(seatings).toHaveLength(1);
		expect(await loadPickerShape(event.id)).toEqual([
			{ date: '2099-06-10', kinds: ['dinner'] },
		]);
	});

	it('throws on an unknown Event', async () => {
		const { saveEventSchedule } = await import('../../src/lib/server/services/event-schedule');

		await expect(
			saveEventSchedule('00000000-0000-0000-0000-000000000000', [{ date: '2099-06-10', kinds: ['dinner'] }])
		).rejects.toThrow('Event not found');
	});
});

// ---------------------------------------------------------------------------
// Seatings per Service (issue 020): the admin Seatings editor's save
// ---------------------------------------------------------------------------

describe('saveServiceSeatings (admin Seatings editor)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedEvent();
		await testDb.update(events).set({ published: false }).where(eq(events.id, event.id));
	});

	/** Pick Days/Services, then return the editor's Services. */
	async function pickAndLoad(days: { date: string; kinds: ('lunch' | 'dinner')[] }[]) {
		const { saveEventSchedule, loadSeatingsEditor } = await import('../../src/lib/server/services/event-schedule');
		await saveEventSchedule(event.id, days);
		return loadSeatingsEditor(event.id);
	}

	function seating(start: string, overrides: Record<string, unknown> = {}) {
		return {
			id: null,
			start,
			end: null,
			titleEn: null,
			titleFr: null,
			descriptionEn: null,
			descriptionFr: null,
			totalCapacity: 20,
			priceAmount: 4500,
			currency: 'EUR',
			published: true,
			allowWaitlist: false,
			badgeType: 'none',
			...overrides,
		};
	}

	async function save(payload: unknown) {
		const { parseSeatingsPayload, saveServiceSeatings } = await import('../../src/lib/server/services/event-schedule');
		const parsed = parseSeatingsPayload(JSON.stringify(payload));
		if (!parsed.ok) throw new Error(`payload rejected: ${parsed.reason}`);
		return saveServiceSeatings(event.id, parsed.services);
	}

	async function bookSeating(sessionId: string, status: 'confirmed' | 'cancelled', quantity = 1) {
		await testDb.insert(reservations).values({
			eventSessionId: sessionId,
			guestEmail: `guest-${Math.random().toString(36).slice(2, 8)}@example.com`,
			guestName: 'Guest',
			quantity,
			totalAmount: 4500 * quantity,
			status,
			accessToken: `tok-${sessionId}-${Math.random().toString(36).slice(2, 10)}`,
			expiresAt: new Date('2099-12-31T23:59:59Z'),
		});
	}

	it('sets the default duration and creates untitled Seatings with ends filled from it', async () => {
		const { loadSeatingsEditor } = await import('../../src/lib/server/services/event-schedule');
		const [lunch] = await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		expect(lunch.seatings).toEqual([]);

		const result = await save([{
			serviceId: lunch.serviceId,
			defaultDurationMinutes: 75,
			seatings: [seating('12:00'), seating('13:15', { end: '15:00', totalCapacity: 8 })],
		}]);
		expect(result.overlaps).toEqual([]);

		const [reloaded] = await loadSeatingsEditor(event.id);
		expect(reloaded.defaultDurationMinutes).toBe(75);
		expect(reloaded.seatings.map((s) => [s.start, s.end, s.totalCapacity, s.availableCapacity, s.titleEn])).toEqual([
			['12:00', '13:15', 20, 20, null],
			['13:15', '15:00', 8, 8, null],
		]);
		const rows = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id)).orderBy(eventSessions.startTime);
		expect(rows[0].startTime.toISOString()).toBe('2099-06-10T12:00:00.000Z');
		expect(rows[0].endTime.toISOString()).toBe('2099-06-10T13:15:00.000Z');
		expect(rows.every((row) => row.serviceId === lunch.serviceId)).toBe(true);
	});

	it('reports overlapping Seatings without refusing the save', async () => {
		const [dinner] = await pickAndLoad([{ date: '2099-06-10', kinds: ['dinner'] }]);
		const result = await save([{
			serviceId: dinner.serviceId,
			defaultDurationMinutes: 120,
			seatings: [seating('19:00'), seating('20:30')],
		}]);
		expect(result.overlaps).toEqual([
			{ serviceIndex: 0, seatingIndex: 1, start: '20:30', previousEnd: '21:00' },
		]);
		const rows = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(rows).toHaveLength(2);
	});

	it('updates kept Seatings, deletes dropped unbooked ones and keeps the Day and Service', async () => {
		const { loadSeatingsEditor } = await import('../../src/lib/server/services/event-schedule');
		const [lunch] = await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		await save([{ serviceId: lunch.serviceId, defaultDurationMinutes: 90, seatings: [seating('12:00'), seating('13:30')] }]);
		const [loaded] = await loadSeatingsEditor(event.id);

		const result = await save([{
			serviceId: lunch.serviceId,
			defaultDurationMinutes: 90,
			seatings: [seating('12:15', { id: loaded.seatings[0].id, titleFr: 'Table du chef' })],
		}]);
		expect(result.removedSeatingIds).toEqual([loaded.seatings[1].id]);

		const [reloaded] = await loadSeatingsEditor(event.id);
		expect(reloaded.serviceId).toBe(lunch.serviceId);
		expect(reloaded.seatings.map((s) => [s.id, s.start, s.end, s.titleFr])).toEqual([
			[loaded.seatings[0].id, '12:15', '13:45', 'Table du chef'],
		]);
	});

	it('refuses to delete a Seating with Reservations, writing nothing', async () => {
		const { loadSeatingsEditor, SeatingRemovalRefusedError } = await import('../../src/lib/server/services/event-schedule');
		const [lunch] = await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		await save([{ serviceId: lunch.serviceId, defaultDurationMinutes: 90, seatings: [seating('12:00'), seating('13:30')] }]);
		const [loaded] = await loadSeatingsEditor(event.id);
		await bookSeating(loaded.seatings[1].id, 'cancelled');

		const attempt = save([{
			serviceId: lunch.serviceId,
			defaultDurationMinutes: 60,
			seatings: [seating('12:00', { id: loaded.seatings[0].id })],
		}]);
		await expect(attempt).rejects.toBeInstanceOf(SeatingRemovalRefusedError);
		await expect(attempt).rejects.toThrow(/13h30 du déjeuner .*1 réservation passée/);

		const [reloaded] = await loadSeatingsEditor(event.id);
		expect(reloaded.defaultDurationMinutes).toBe(90);
		expect(reloaded.seatings).toHaveLength(2);
	});

	it('refuses to lower capacity below the seats sold and keeps available seats in step', async () => {
		const { loadSeatingsEditor, SeatingCapacityRefusedError } = await import('../../src/lib/server/services/event-schedule');
		const [dinner] = await pickAndLoad([{ date: '2099-06-10', kinds: ['dinner'] }]);
		await save([{ serviceId: dinner.serviceId, defaultDurationMinutes: 180, seatings: [seating('19:00')] }]);
		const [loaded] = await loadSeatingsEditor(event.id);
		const id = loaded.seatings[0].id;
		await bookSeating(id, 'confirmed');
		await bookSeating(id, 'confirmed');

		await expect(save([{
			serviceId: dinner.serviceId,
			defaultDurationMinutes: 180,
			seatings: [seating('19:00', { id, totalCapacity: 1 })],
		}])).rejects.toBeInstanceOf(SeatingCapacityRefusedError);

		await save([{
			serviceId: dinner.serviceId,
			defaultDurationMinutes: 180,
			seatings: [seating('19:00', { id, totalCapacity: 10 })],
		}]);
		const [reloaded] = await loadSeatingsEditor(event.id);
		expect(reloaded.seatings[0]).toMatchObject({ totalCapacity: 10, availableCapacity: 8, reservationCount: 2 });
	});

	it('refuses a start on the other side of the 16:00 UTC cut-off', async () => {
		const { SeatingServiceMismatchError } = await import('../../src/lib/server/services/event-schedule');
		const [lunch] = await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		await expect(save([{
			serviceId: lunch.serviceId,
			defaultDurationMinutes: 90,
			seatings: [seating('19:00')],
		}])).rejects.toBeInstanceOf(SeatingServiceMismatchError);
	});

	it('refuses a Service of another Event', async () => {
		const { UnknownScheduleServiceError } = await import('../../src/lib/server/services/event-schedule');
		await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		await expect(save([{
			serviceId: '00000000-0000-4000-8000-000000000000',
			defaultDurationMinutes: 90,
			seatings: [],
		}])).rejects.toBeInstanceOf(UnknownScheduleServiceError);
	});

	it('refuses to remove every Seating of a published Event (ADR 0001)', async () => {
		const { loadSeatingsEditor, PublishedEventWithoutSeatingError } = await import('../../src/lib/server/services/event-schedule');
		const [lunch] = await pickAndLoad([{ date: '2099-06-10', kinds: ['lunch'] }]);
		await save([{ serviceId: lunch.serviceId, defaultDurationMinutes: 90, seatings: [seating('12:00')] }]);
		await testDb.update(events).set({ published: true }).where(eq(events.id, event.id));

		await expect(save([{ serviceId: lunch.serviceId, defaultDurationMinutes: 90, seatings: [] }]))
			.rejects.toBeInstanceOf(PublishedEventWithoutSeatingError);
		const [reloaded] = await loadSeatingsEditor(event.id);
		expect(reloaded.seatings).toHaveLength(1);
	});
});
