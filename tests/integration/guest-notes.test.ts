// @vitest-environment node
/**
 * Issue 050 — Notes and tags on a Guest.
 *
 * Save and read a note and tags (keyed by normalised email), the 5-tag
 * and 30-character limits, trimming and duplicates, the tag filter on
 * the Clients list, and the personal-data purge of rows left without an
 * identity.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, users } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false },
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

const guestNotesService = await import('../../src/lib/server/services/guest-notes');
const { saveGuestNotes, getGuestNotes, tagSuggestions, parseTags } = guestNotesService;
const { listGuests, getGuest } = await import('../../src/lib/server/services/guest-summary');
const { purgePersonalData, ANONYMISED_EMAIL } = await import(
	'../../src/lib/server/jobs/purge-personal-data'
);
const { guestKeyFromEmail } = await import('../../src/lib/utils/guest-email');

afterAll(async () => {
	await closeTestDatabase();
});

const NOW = new Date('2030-06-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

async function seedAdmin() {
	seq += 1;
	const [admin] = await testDb
		.insert(users)
		.values({
			email: `admin-${seq}@example.com`,
			firstName: 'Admin',
			lastName: 'Test',
			passwordHash: 'hash',
			role: 'admin',
		})
		.returning();
	return admin;
}

async function seedSession(endedDaysAgo: number) {
	const end = new Date(NOW.getTime() - endedDaysAgo * DAY);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Notes Event',
			titleFr: 'Événement notes',
			descriptionEn: 'd',
			descriptionFr: 'd',
			locationEn: 'Paris',
			locationFr: 'Paris',
			startDate: new Date(end.getTime() - DAY),
			endDate: end,
			visibility: 'public',
		})
		.returning();
	const startTime = new Date(end.getTime() - 4 * 60 * 60 * 1000);
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, end),
			titleEn: 'Session',
			titleFr: 'Session',
			startTime,
			endTime: end,
			totalCapacity: 10,
			availableCapacity: 10,
			published: true,
		})
		.returning();
	return session;
}

async function seedReservation(sessionId: string, guestEmail: string) {
	seq += 1;
	const [row] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail,
			guestName: 'Guest',
			quantity: 2,
			totalAmount: 6500,
			depositAmount: 6500,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'confirmed',
			accessToken: `atk-notes-${Date.now()}-${seq}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		})
		.returning();
	return row;
}

describe('guest notes and tags', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('saves and reads a note and tags, keyed by normalised email, with trim and duplicates dropped', async () => {
		const admin = await seedAdmin();
		const session = await seedSession(10);
		await seedReservation(session.id, ' Alice@Example.com ');

		const saved = await saveGuestNotes(
			'alice@example.com',
			{ note: '  Préfère la table du fond.  ', tags: ['Habitué', ' VIP ', 'habitué', ''] },
			admin.id
		);
		expect(saved.ok).toBe(true);

		const record = await getGuestNotes('alice@example.com');
		expect(record?.note).toBe('Préfère la table du fond.');
		expect(record?.tags).toEqual(['Habitué', 'VIP']);
		expect(record?.updatedByEmail).toBe(admin.email);

		// The detail page sees the tags through getGuest.
		const detail = await getGuest(guestKeyFromEmail('alice@example.com')!);
		expect(detail?.tags).toEqual(['Habitué', 'VIP']);
		expect(detail?.notes?.note).toBe('Préfère la table du fond.');
	});

	it('clears the note and replaces the tags on a second save', async () => {
		const admin = await seedAdmin();
		await saveGuestNotes('bob@example.com', { note: 'À suivre', tags: ['VIP'] }, admin.id);
		const saved = await saveGuestNotes('bob@example.com', { note: '   ', tags: ['Presse'] }, admin.id);
		expect(saved.ok).toBe(true);

		const record = await getGuestNotes('bob@example.com');
		expect(record?.note).toBeNull();
		expect(record?.tags).toEqual(['Presse']);
	});

	it('enforces the 5-tag, 30-character and 2000-character limits', async () => {
		const admin = await seedAdmin();
		expect(
			(await saveGuestNotes('carol@example.com', { note: '', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, admin.id)).ok
		).toBe(false);
		expect(
			(await saveGuestNotes('carol@example.com', { note: '', tags: ['x'.repeat(31)] }, admin.id)).ok
		).toBe(false);
		expect(
			(await saveGuestNotes('carol@example.com', { note: 'n'.repeat(2001), tags: [] }, admin.id)).ok
		).toBe(false);
		// Nothing was saved.
		expect(await getGuestNotes('carol@example.com')).toBeNull();
		// The boundary values pass.
		expect(
			(await saveGuestNotes(
				'carol@example.com',
				{ note: 'n'.repeat(2000), tags: ['a', 'b', 'c', 'd', 'e'].map((t, i) => (i === 4 ? 'y'.repeat(30) : t)) },
				admin.id
			)).ok
		).toBe(true);
		expect(parseTags('a, b ,,A,')).toEqual(['a', 'b']);
	});

	it('shows tags on the Clients list and filters by tag, case-insensitively', async () => {
		const admin = await seedAdmin();
		const session = await seedSession(10);
		await seedReservation(session.id, 'alice@example.com');
		await seedReservation(session.id, 'dave@example.com');
		await saveGuestNotes('alice@example.com', { note: '', tags: ['Habitué'] }, admin.id);
		await saveGuestNotes('dave@example.com', { note: '', tags: ['presse'] }, admin.id);

		const all = await listGuests({});
		expect(all.total).toBe(2);
		expect(all.guests.find((g) => g.email === 'alice@example.com')?.tags).toEqual(['Habitué']);

		const filtered = await listGuests({ tag: 'Presse' });
		expect(filtered.total).toBe(1);
		expect(filtered.guests[0].email).toBe('dave@example.com');

		// Suggestions carry the tags in use plus the defaults.
		const suggestions = await tagSuggestions();
		expect(suggestions).toContain('Habitué');
		expect(suggestions).toContain('presse');
		expect(suggestions).toContain('VIP');
	});

	it('the purge deletes notes once no non-anonymised Reservation remains, and counts them', async () => {
		const admin = await seedAdmin();
		const old = await seedSession(400); // past the 365-day retention
		const recent = await seedSession(10);
		await seedReservation(old.id, 'gone@example.com');
		const kept = await seedReservation(recent.id, 'kept@example.com');
		await saveGuestNotes('gone@example.com', { note: 'n', tags: ['VIP'] }, admin.id);
		await saveGuestNotes('kept@example.com', { note: 'n', tags: ['VIP'] }, admin.id);
		// No Reservation at all.
		await saveGuestNotes('never@example.com', { note: 'n', tags: [] }, admin.id);
		expect(kept.guestEmail).toBe('kept@example.com');

		const result = await purgePersonalData(NOW);
		expect(result.guestNotesDeleted).toBe(2);
		expect(await getGuestNotes('gone@example.com')).toBeNull();
		expect(await getGuestNotes('never@example.com')).toBeNull();
		// The identity that survives keeps its note.
		const keptRecord = await getGuestNotes('kept@example.com');
		expect(keptRecord?.tags).toEqual(['VIP']);
		// The anonymised email never counts as an identity (idempotence).
		await saveGuestNotes(ANONYMISED_EMAIL, { note: 'n', tags: [] }, admin.id);
		const second = await purgePersonalData(NOW);
		expect(second.guestNotesDeleted).toBe(1);
	});
});
