// @vitest-environment node
/**
 * Issue 085 — migration 0059 rewrites each Menu's stored dishes to the new
 * shape: the old text becomes the name, descriptions and notes stay empty,
 * and every dish after the first of its Course becomes an alternative. The
 * migration is idempotent on already-converted rows.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTestDatabase, setupTestDatabase, closeTestDatabase } from '../fixtures/database';

const testDb = getTestDatabase();

const MIGRATION = readFileSync(join(__dirname, '../../drizzle/migrations/0059_menu_dish_shape.sql'), 'utf8');

afterAll(async () => {
	await closeTestDatabase();
});

async function insertMenuWithCourses(eventId: string, courses: unknown) {
	const [row] = (await testDb.execute(
		`INSERT INTO event_menus (event_id, name_en, name_fr, courses) VALUES ('${eventId}', 'Carte', 'Carte', '${JSON.stringify(courses)}') RETURNING id, courses`
	)) as { id: string; courses: unknown }[];
	return row;
}

const EVENT = '00000000-0000-4000-8000-000000000001';

describe('0059_menu_dish_shape', () => {
	it('converts stored dishes and is idempotent', async () => {
		await setupTestDatabase();
		await testDb.execute(
			`INSERT INTO events (id, title_en, title_fr, visibility) VALUES ('${EVENT}', 'T', 'T', 'public')`
		);
		const old = await insertMenuWithCourses(EVENT, [
			{
				labelEn: 'Starter',
				labelFr: 'Entrée',
				dishes: [
					{ en: 'Oysters', fr: 'Huîtres' },
					{ en: 'Soup', fr: 'Velouté' },
					{ en: '', fr: 'Ravioles' },
				],
			},
			{ labelEn: '', labelFr: '', dishes: [{ en: 'Lamb', fr: 'Agneau' }] },
		]);

		await testDb.execute(MIGRATION);
		const converted = (await testDb.execute(
			`SELECT courses FROM event_menus WHERE id = '${old.id}'`
		)) as { courses: unknown }[];
		expect(converted[0].courses).toEqual([
			{
				labelEn: 'Starter',
				labelFr: 'Entrée',
				dishes: [
					{ nameFr: 'Huîtres', nameEn: 'Oysters', descriptionFr: null, descriptionEn: null, alternative: false, noteFr: null, noteEn: null },
					// Dishes after the first were choices: they become alternatives.
					{ nameFr: 'Velouté', nameEn: 'Soup', descriptionFr: null, descriptionEn: null, alternative: true, noteFr: null, noteEn: null },
					{ nameFr: 'Ravioles', nameEn: '', descriptionFr: null, descriptionEn: null, alternative: true, noteFr: null, noteEn: null },
				],
			},
			{
				labelEn: '',
				labelFr: '',
				dishes: [{ nameFr: 'Agneau', nameEn: 'Lamb', descriptionFr: null, descriptionEn: null, alternative: false, noteFr: null, noteEn: null }],
			},
		]);

		// Running it again leaves the converted row as it is.
		const again = await insertMenuWithCourses(EVENT, []);
		await testDb.execute(MIGRATION);
		const rows = (await testDb.execute(
			`SELECT courses FROM event_menus WHERE event_id = '${EVENT}' ORDER BY created_at, id`
		)) as { courses: unknown }[];
		expect(rows[0].courses).toEqual(converted[0].courses);
		expect(rows[1].courses).toEqual([]);
		expect(again.courses).toEqual([]);
	});
});
