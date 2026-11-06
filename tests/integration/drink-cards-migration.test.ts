// @vitest-environment node
/**
 * Issue 087 — migration 0061 turns the one Drinks card per Event into a
 * list: the name columns are added, each existing card keeps its content
 * and takes the name « Boissons »/« Drinks », and every Service of its
 * Event is offered it. The migration runs on an old-shape database again,
 * so the test first reverts its DDL.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTestDatabase, setupTestDatabase, closeTestDatabase } from '../fixtures/database';

const testDb = getTestDatabase();

const MIGRATION = readFileSync(join(__dirname, '../../drizzle/migrations/0061_drinks_cards_per_meal.sql'), 'utf8')
	.split('--> statement-breakpoint')
	.map((statement) => statement.trim())
	.filter(Boolean);

afterAll(async () => {
	await closeTestDatabase();
});

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const OTHER = '00000000-0000-4000-8000-0000000000e2';

describe('0061_drinks_cards_per_meal', () => {
	it('names the existing cards and offers them on every Service of their Event', async () => {
		await setupTestDatabase();
		// Back to the old shape: one unnamed card per Event, no Service link.
		await testDb.execute(`ALTER TABLE event_services DROP COLUMN IF EXISTS drink_card_id`);
		await testDb.execute(`ALTER TABLE event_drink_cards DROP COLUMN IF EXISTS name_en`);
		await testDb.execute(`ALTER TABLE event_drink_cards DROP COLUMN IF EXISTS name_fr`);
		await testDb.execute(`DROP INDEX IF EXISTS event_drink_cards_event_id_idx`);
		await testDb.execute(`ALTER TABLE event_drink_cards ADD CONSTRAINT event_drink_cards_event_id_unique UNIQUE (event_id)`);

		await testDb.execute(
			`INSERT INTO events (id, title_en, title_fr, visibility) VALUES ('${EVENT}', 'T', 'T', 'public'), ('${OTHER}', 'T2', 'T2', 'public')`
		);
		const card = (
			await testDb.execute(
				`INSERT INTO event_drink_cards (event_id, sections) VALUES ('${EVENT}', '[{"labelEn":"","labelFr":"Soft","drinks":[{"nameEn":"","nameFr":"Citronnade","descriptionEn":null,"descriptionFr":null,"priceAmount":500}]}]') RETURNING id`
			)
		) as unknown as { id: string }[];
		const otherCard = (
			await testDb.execute(`INSERT INTO event_drink_cards (event_id, sections) VALUES ('${OTHER}', '[]') RETURNING id`)
		) as unknown as { id: string }[];
		const [day] = (await testDb.execute(
			`INSERT INTO event_days (event_id, date) VALUES ('${EVENT}', '2025-05-12') RETURNING id`
		)) as unknown as { id: string }[];
		const [otherDay] = (await testDb.execute(
			`INSERT INTO event_days (event_id, date) VALUES ('${OTHER}', '2025-05-12') RETURNING id`
		)) as unknown as { id: string }[];
		const [lunch] = (await testDb.execute(
			`INSERT INTO event_services (day_id, kind, default_seating_duration_minutes) VALUES ('${day.id}', 'lunch', 90) RETURNING id`
		)) as unknown as { id: string }[];
		const [dinner] = (await testDb.execute(
			`INSERT INTO event_services (day_id, kind, default_seating_duration_minutes) VALUES ('${day.id}', 'dinner', 120) RETURNING id`
		)) as unknown as { id: string }[];
		const [otherLunch] = (await testDb.execute(
			`INSERT INTO event_services (day_id, kind, default_seating_duration_minutes) VALUES ('${otherDay.id}', 'lunch', 90) RETURNING id`
		)) as unknown as { id: string }[];

		for (const statement of MIGRATION) {
			await testDb.execute(statement);
		}

		const named = (await testDb.execute(
			`SELECT name_fr, name_en, sections FROM event_drink_cards WHERE id = '${card[0].id}'`
		)) as unknown as { name_fr: string; name_en: string; sections: unknown }[];
		expect(named[0]).toMatchObject({ name_fr: 'Boissons', name_en: 'Drinks' });
		// The card keeps its content.
		expect(named[0].sections).toEqual([
			{ labelEn: '', labelFr: 'Soft', drinks: [{ nameEn: '', nameFr: 'Citronnade', descriptionEn: null, descriptionFr: null, priceAmount: 500 }] },
		]);

		// Every Service of the Event is offered the card; the other Event's
		// Services keep none.
		const linked = (await testDb.execute(
			`SELECT id, drink_card_id FROM event_services ORDER BY kind`
		)) as unknown as { id: string; drink_card_id: string | null }[];
		const byId = new Map(linked.map((row) => [row.id, row.drink_card_id]));
		expect(byId.get(lunch.id)).toBe(card[0].id);
		expect(byId.get(dinner.id)).toBe(card[0].id);
		expect(byId.get(otherLunch.id)).toBe(otherCard[0].id);
	});
});
