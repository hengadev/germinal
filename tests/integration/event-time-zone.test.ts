// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventDays, eventServices, eventSessions, reservations } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

// ---------------------------------------------------------------------------
// Seatings in the Event's Time Zone (ADR 0006, issue 034): the Admin types
// wall-clock times in the Event's zone, every display (editor, public page,
// Ticket, emails) reads them on that clock, the .ics keeps UTC instants, and
// changing the zone keeps the typed times — refused once a Seating is booked.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
		RESERVATION_EXPIRY_MINUTES: 15,
	},
	isStripeEnabled: () => false,
	isAWSConfigured: () => false,
	isDevelopment: () => true,
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

async function seedEvent(timeZone: string) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Supper',
			titleFr: 'Souper',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01T00:00:00Z'),
			endDate: new Date('2099-12-31T23:59:59Z'),
			locationEn: 'London',
			locationFr: 'Londres',
			venueCapacity: 20,
			visibility: 'public',
			timeZone,
		})
		.returning();
	return event;
}

/** Pick Days with a dinner and type the given Seatings for each. */
async function typeDinners(eventId: string, days: { date: string; starts: string[] }[]) {
	const { saveEventSchedule, loadSeatingsEditor, parseSeatingsPayload, saveServiceSeatings } = await import(
		'../../src/lib/server/services/event-schedule'
	);
	await saveEventSchedule(eventId, days.map((day) => ({ date: day.date, kinds: ['dinner'] })));
	const editor = await loadSeatingsEditor(eventId);
	const payload = editor.map((service) => ({
		serviceId: service.serviceId,
		defaultDurationMinutes: 60,
		seatings: days.find((day) => day.date === service.date)!.starts.map((start) => ({
			id: null,
			start,
			end: null,
			titleEn: null,
			titleFr: null,
			descriptionEn: null,
			descriptionFr: null,
			capacityOverride: null,
			published: true,
			allowWaitlist: false,
			badgeType: 'none',
		})),
	}));
	const parsed = parseSeatingsPayload(JSON.stringify(payload));
	if (!parsed.ok) throw new Error(parsed.reason);
	await saveServiceSeatings(eventId, parsed.services);
}

async function seatingsOf(eventId: string) {
	return testDb.select().from(eventSessions).where(eq(eventSessions.eventId, eventId)).orderBy(eventSessions.startTime);
}

async function book(seatingId: string) {
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: seatingId,
			guestEmail: 'guest@example.com',
			guestName: 'Guest',
			quantity: 2,
			totalAmount: 9000,
			depositAmount: 9000,
			balanceAmount: 0,
			currency: 'GBP',
			status: 'confirmed',
			accessToken: `token-${seatingId}`,
			expiresAt: new Date('2099-12-31T00:00:00Z'),
		})
		.returning();
	return reservation;
}

describe('Seatings in the Event’s Time Zone', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('a dinner typed at 20:00 in a Europe/London Event is stored at its instant and shown at 20:00', async () => {
		const event = await seedEvent('Europe/London');
		await typeDinners(event.id, [{ date: '2099-07-15', starts: ['20:00'] }]);

		const [seating] = await seatingsOf(event.id);
		// British Summer Time is UTC+1.
		expect(seating.startTime.toISOString()).toBe('2099-07-15T19:00:00.000Z');
		expect(seating.endTime.toISOString()).toBe('2099-07-15T20:00:00.000Z');

		const { loadSeatingsEditor, getPublishedScheduleByEventId } = await import(
			'../../src/lib/server/services/event-schedule'
		);
		const [service] = await loadSeatingsEditor(event.id);
		expect(service.seatings.map((s) => [s.start, s.end])).toEqual([['20:00', '21:00']]);

		const [row] = await getPublishedScheduleByEventId(event.id);
		expect(row.dayDate).toBe('2099-07-15');
		expect(row.item.titleEn).toBe('Dinner — Wednesday, 15 July 2099, 20:00');
		expect(row.item.titleFr).toBe('Dîner — mercredi 15 juillet 2099, 20h00');

		// The Event's dates are its Days, in its zone.
		const [saved] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(saved.startDate.toISOString()).toBe('2099-07-14T23:00:00.000Z');
		expect(saved.endDate.toISOString()).toBe('2099-07-15T22:59:59.999Z');
	});

	it('the Ticket, the emails and the .ics place the London dinner right, whatever the server’s zone', async () => {
		const event = await seedEvent('Europe/London');
		await typeDinners(event.id, [{ date: '2099-07-15', starts: ['20:00'] }]);
		const [seating] = await seatingsOf(event.id);
		const reservation = await book(seating.id);

		const { load } = await import('../../src/routes/(public)/tickets/[token]/+page.server');
		const page = (await load({ params: { token: reservation.accessToken } } as never)) as unknown as {
			reservation: { session: { titleEn: string; event: { timeZone: string } } };
		};
		expect(page.reservation.session.titleEn).toBe('Dinner — Wednesday, 15 July 2099, 20:00');
		expect(page.reservation.session.event.timeZone).toBe('Europe/London');

		const { generateTicketTextTemplate, generateEventReminderTextTemplate, generateCancellationTextTemplate } =
			await import('../../src/lib/server/services/email');
		const ticketData = {
			guestEmail: reservation.guestEmail,
			guestName: reservation.guestName,
			accessToken: reservation.accessToken,
			reservation,
			session: seating,
			event: { id: event.id, titleEn: event.titleEn, titleFr: event.titleFr, locationEn: event.locationEn, timeZone: event.timeZone },
		};
		for (const text of [
			generateTicketTextTemplate(ticketData),
			generateEventReminderTextTemplate({ ...ticketData, daysUntil: 1 }),
			generateCancellationTextTemplate({
				guestEmail: reservation.guestEmail,
				guestName: reservation.guestName,
				eventTitle: event.titleEn,
				sessionTitle: 'Dinner',
				sessionStartTime: seating.startTime,
				timeZone: event.timeZone,
				reservationId: reservation.id,
			}),
		]) {
			expect(text).toContain('15 July 2099 at 20:00');
			expect(text).not.toMatch(/19:00|21:00|UTC|GMT|BST/);
		}

		// The .ics keeps the UTC instant; calendar apps convert it.
		const { generateICS } = await import('../../src/lib/server/utils/calendar');
		const ics = generateICS(event as never, seating as never);
		expect(ics).toContain('DTSTART:20990715T190000Z');
		expect(ics).toContain('DTEND:20990715T200000Z');
		expect(ics).toContain('SUMMARY:Supper - Dinner — Wednesday\\, 15 July 2099\\, 20:00');
	});

	it('a Seating’s Day and meal are read in the Event’s Time Zone', async () => {
		const event = await seedEvent('Europe/Paris');
		// 22:45 in Paris is 20:45Z on the same Day; 17:00 is dinner in Paris
		// although it is 15:00 UTC.
		await typeDinners(event.id, [{ date: '2099-07-15', starts: ['17:00', '22:45'] }]);
		const rows = await testDb
			.select({ date: eventDays.date, kind: eventServices.kind, start: eventSessions.startTime })
			.from(eventSessions)
			.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventSessions.eventId, event.id))
			.orderBy(eventSessions.startTime);
		expect(rows.map((row) => [String(row.date).slice(0, 10), row.kind, row.start.toISOString()])).toEqual([
			['2099-07-15', 'dinner', '2099-07-15T15:00:00.000Z'],
			['2099-07-15', 'dinner', '2099-07-15T20:45:00.000Z'],
		]);

		// A Seating created through the session API is attached by its Paris
		// Day and meal: 22:30Z is 00:30 on the 16th in Paris.
		const { createEventSession } = await import('../../src/lib/server/services/event-sessions');
		await createEventSession({
			eventId: event.id,
			titleEn: 'Late',
			titleFr: 'Tard',
			startTime: new Date('2099-07-15T22:30:00Z'),
			endTime: new Date('2099-07-15T23:30:00Z'),
			totalCapacity: 20,
			published: true,
		});
		const days = await testDb.select({ date: eventDays.date }).from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days.map((day) => String(day.date).slice(0, 10)).sort()).toEqual(['2099-07-15', '2099-07-16']);
	});

	it('refuses a lunch typed after 16:00 on the Event’s clock, in French and without UTC', async () => {
		const event = await seedEvent('Europe/Paris');
		const { saveEventSchedule, loadSeatingsEditor, parseSeatingsPayload, saveServiceSeatings } = await import(
			'../../src/lib/server/services/event-schedule'
		);
		await saveEventSchedule(event.id, [{ date: '2099-07-15', kinds: ['lunch'] }]);
		const [lunch] = await loadSeatingsEditor(event.id);
		const parsed = parseSeatingsPayload(JSON.stringify([{
			serviceId: lunch.serviceId,
			defaultDurationMinutes: 60,
			seatings: [{
				id: null, start: '16:30', end: null, titleEn: null, titleFr: null, descriptionEn: null, descriptionFr: null,
				capacityOverride: null, published: true, allowWaitlist: false, badgeType: 'none',
			}],
		}]));
		if (!parsed.ok) throw new Error(parsed.reason);
		const refusal = await saveServiceSeatings(event.id, parsed.services).catch((error: Error) => error);
		expect(refusal).toBeInstanceOf(Error);
		expect((refusal as Error).message).toContain('doit commencer avant 16h00');
		expect((refusal as Error).message).not.toContain('UTC');
	});

	it('changing the Time Zone keeps the typed times and moves the instants', async () => {
		const event = await seedEvent('Europe/Paris');
		await typeDinners(event.id, [
			{ date: '2099-07-15', starts: ['20:00'] },
			{ date: '2099-12-10', starts: ['19:30'] },
		]);
		expect((await seatingsOf(event.id)).map((s) => s.startTime.toISOString())).toEqual([
			'2099-07-15T18:00:00.000Z',
			'2099-12-10T18:30:00.000Z',
		]);

		const { changeEventTimeZone, loadSeatingsEditor } = await import('../../src/lib/server/services/event-schedule');
		await changeEventTimeZone(event.id, 'Europe/London');

		const moved = await seatingsOf(event.id);
		expect(moved.map((s) => [s.startTime.toISOString(), s.endTime.toISOString()])).toEqual([
			['2099-07-15T19:00:00.000Z', '2099-07-15T20:00:00.000Z'],
			['2099-12-10T19:30:00.000Z', '2099-12-10T20:30:00.000Z'],
		]);
		const editor = await loadSeatingsEditor(event.id);
		expect(editor.map((service) => [service.date, service.seatings[0].start])).toEqual([
			['2099-07-15', '20:00'],
			['2099-12-10', '19:30'],
		]);
		const [saved] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(saved.timeZone).toBe('Europe/London');
		expect(saved.startDate.toISOString()).toBe('2099-07-14T23:00:00.000Z');
		expect(saved.endDate.toISOString()).toBe('2099-12-10T23:59:59.999Z');
	});

	it('refuses to change the Time Zone once a Seating has a Reservation, writing nothing', async () => {
		const event = await seedEvent('Europe/Paris');
		await typeDinners(event.id, [{ date: '2099-07-15', starts: ['20:00'] }]);
		const [seating] = await seatingsOf(event.id);
		await book(seating.id);

		const { changeEventTimeZone, TimeZoneChangeRefusedError } = await import(
			'../../src/lib/server/services/event-schedule'
		);
		const refusal = await changeEventTimeZone(event.id, 'Europe/London').catch((error: Error) => error);
		expect(refusal).toBeInstanceOf(TimeZoneChangeRefusedError);
		expect((refusal as Error).message).toBe(
			'Impossible de changer le fuseau horaire : des séances ont déjà des réservations, leurs billets changeraient d’heure.'
		);

		const [unchanged] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(unchanged.timeZone).toBe('Europe/Paris');
		expect((await seatingsOf(event.id))[0].startTime.toISOString()).toBe('2099-07-15T18:00:00.000Z');
	});

	it('the admin Lieu section saves the Time Zone and answers a refusal in French', async () => {
		const event = await seedEvent('Europe/Paris');
		await typeDinners(event.id, [{ date: '2099-07-15', starts: ['20:00'] }]);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const submit = (timeZone: string) => {
			const form = new FormData();
			for (const [name, value] of Object.entries({
				titleEn: event.titleEn,
				titleFr: event.titleFr,
				descriptionEn: event.descriptionEn,
				descriptionFr: event.descriptionFr,
				locationEn: event.locationEn,
				locationFr: event.locationFr,
				visibility: 'public',
				timeZone,
			})) form.set(name, value);
			return actions.updateEvent!({
				locals: { user: { id: 'admin', email: 'admin@example.com', role: 'admin' } },
				request: new Request('http://x', { method: 'POST', body: form }),
				params: { id: event.id },
			} as never);
		};

		expect(await submit('Mars/Olympus')).toMatchObject({ status: 400, data: { error: 'Le fuseau horaire choisi est invalide.' } });
		expect(await submit('Europe/London')).toMatchObject({ success: expect.any(String) });
		const [saved] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(saved.timeZone).toBe('Europe/London');
		expect((await seatingsOf(event.id))[0].startTime.toISOString()).toBe('2099-07-15T19:00:00.000Z');

		await book((await seatingsOf(event.id))[0].id);
		expect(await submit('Europe/Paris')).toMatchObject({
			status: 400,
			data: { error: expect.stringContaining('Impossible de changer le fuseau horaire') },
		});
	});
});
