import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { dayOf, DEFAULT_EVENT_TIME_ZONE, serviceKindOf } from '../../src/lib/utils/event-time';
import * as schema from '../../src/lib/server/db/schema';

export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/germinal_test';

let _client: postgres.Sql | null = null;

export function getTestDatabase() {
	if (!_client) {
		_client = postgres(TEST_DATABASE_URL, { max: 5 });
	}
	return drizzle(_client, { schema });
}

export async function closeTestDatabase() {
	if (_client) {
		await _client.end();
		_client = null;
	}
}

export async function setupTestDatabase() {
	const db = getTestDatabase();
	await db.execute(sql`TRUNCATE TABLE reservations CASCADE`);
	await db.execute(sql`TRUNCATE TABLE payments CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_sessions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_services CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_menus CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_days CASCADE`);
	await db.execute(sql`TRUNCATE TABLE waitlist CASCADE`);
	await db.execute(sql`TRUNCATE TABLE promotion_codes CASCADE`);
	await db.execute(sql`TRUNCATE TABLE coupons CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_staff CASCADE`);
	await db.execute(sql`TRUNCATE TABLE tasks CASCADE`);
	await db.execute(sql`TRUNCATE TABLE email_queue CASCADE`);
	await db.execute(sql`TRUNCATE TABLE contact_submissions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE media CASCADE`);
	await db.execute(sql`TRUNCATE TABLE talents CASCADE`);
	await db.execute(sql`TRUNCATE TABLE events CASCADE`);
	return db;
}

/**
 * Find-or-create the Day and Service a Seating with the given times belongs
 * to (on the Event's clock, like the event-schedule service), and
 * return the Service id — for tests that insert Seatings directly.
 *
 * Seatings are booked at their Service's price (issue 022): the Service is
 * priced at €25.00 unless `price` says otherwise (`priceAmount: null` leaves
 * it unpriced). The price is (re)applied when the Service already exists.
 * The currency is the Event's (issue 042): `price.currency`, when given, is
 * set on the Event.
 */
export async function seedServiceForSession(
	db: ReturnType<typeof getTestDatabase>,
	eventId: string,
	startTime: Date,
	endTime: Date,
	price: { priceAmount?: number | null; currency?: string } = {}
): Promise<string> {
	const priceAmount = price.priceAmount === undefined ? 2500 : price.priceAmount;
	// The Seating's Day and meal on the Event's clock (ADR 0006).
	const [event] = await db
		.select({ timeZone: schema.events.timeZone })
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	const zone = event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE;
	if (price.currency !== undefined) {
		await db
			.update(schema.events)
			.set({ currency: price.currency })
			.where(eq(schema.events.id, eventId));
	}
	const dayDate = dayOf(startTime, zone);
	const kind = serviceKindOf(startTime, zone);

	const [day] = await db
		.insert(schema.eventDays)
		.values({ eventId, date: dayDate })
		.onConflictDoUpdate({
			target: [schema.eventDays.eventId, schema.eventDays.date],
			set: { updatedAt: new Date() },
		})
		.returning();

	const [service] = await db
		.insert(schema.eventServices)
		.values({
			dayId: day.id,
			kind,
			defaultSeatingDurationMinutes: Math.max(
				1,
				Math.ceil((endTime.getTime() - startTime.getTime()) / 60000)
			),
			priceAmount,
		})
		.onConflictDoUpdate({
			target: [schema.eventServices.dayId, schema.eventServices.kind],
			set: { priceAmount, updatedAt: new Date() },
		})
		.returning();

	return service.id;
}
