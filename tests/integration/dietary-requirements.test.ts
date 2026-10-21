// @vitest-environment node
/**
 * Issue 041 — Dietary Requirements: an Event can ask for them (« Infos
 * pratiques » switch); the booking form's answer is optional, stored only
 * with the Guest's consent and its instant, and only on an Event that asks.
 * Admins see it on the reservations list, the Reservation's page and the
 * CSV export. (The purge is covered in purge-personal-data.test.ts.)
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
const createCheckoutSessionMock = vi.fn().mockResolvedValue({
	id: 'cs_test_mock_checkout_session',
	url: 'https://checkout.stripe.test/mock',
});

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: queueEmailMock,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: createCheckoutSessionMock,
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/csrf', () => ({
	validateCsrfToken: () => true,
}));

vi.mock('../../src/lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed' }),
}));

vi.mock('../../src/lib/mock-data', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/mock-data')>()),
	USE_MOCK_DATA: false,
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
		RESERVATION_EXPIRY_MINUTES: 15,
		STRIPE_SECRET_KEY: 'sk_test_fake',
		STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
	},
	config: { reservations: { maxTicketsPerReservation: 10 } },
	isStripeEnabled: () => true,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANONYMOUS_LOCALS = { user: null, csrfToken: 'token' };
const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};

async function seedEvent(published: boolean, overrides: Partial<typeof events.$inferInsert> = {}) {
	// A published Event is Public, an unpublished one a Draft (issue 032).
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: published ? 'Published Dinner' : 'Draft Dinner',
			titleFr: published ? 'Dîner publié' : 'Dîner brouillon',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01'),
			endDate: new Date('2099-06-01'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility: published ? 'public' : 'draft',
			...overrides,
		})
		.returning();
	return event;
}

async function seedSeating(
	eventId: string,
	overrides: Partial<typeof eventSessions.$inferInsert> = {},
	price: { priceAmount?: number | null } = {}
) {
	const startTime = overrides.startTime ?? new Date('2099-06-01T19:00:00Z');
	const endTime = overrides.endTime ?? new Date('2099-06-01T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime, price);
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId,
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startTime,
			endTime,
			totalCapacity: 10,
			availableCapacity: 10,
			published: true,
			allowWaitlist: true,
			...overrides,
		})
		.returning();
	return seating;
}

function postJson(url: string, body: unknown) {
	return {
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		getClientAddress: () => '127.0.0.1',
		locals: ANONYMOUS_LOCALS,
	} as any;
}

const reservationBody = (sessionId: string, extra: Record<string, unknown> = {}) => ({
	sessionId,
	email: 'guest@example.com',
	name: 'Guest',
	quantity: 1,
	...extra,
});

function updateEventForm(eventId: string, entries: [string, string][]) {
	const form = new FormData();
	for (const [key, value] of entries) form.append(key, value);
	return {
		request: new Request(`http://x/admin/events/${eventId}?/updateEvent`, { method: 'POST', body: form }),
		params: { id: eventId },
		locals: ADMIN_LOCALS,
	} as any;
}

async function book(sessionId: string, extra: Record<string, unknown> = {}) {
	const { POST } = await import('../../src/routes/api/reservations/create/+server');
	return POST(postJson('http://x/api/reservations/create', reservationBody(sessionId, extra)));
}

async function onlyReservation() {
	const rows = await testDb.select().from(reservations);
	expect(rows).toHaveLength(1);
	return rows[0];
}

const ANSWER = 'Allergie aux fruits à coque';

describe('the « Infos pratiques » switch', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('is off by default, and saved on and off through updateEvent', async () => {
		const event = await seedEvent(true);
		expect(event.askDietaryRequirements).toBe(false);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');

		const on: any = await actions.updateEvent(
			updateEventForm(event.id, [['practicalInfoFr', ''], ['askDietaryRequirements', 'false'], ['askDietaryRequirements', 'true']])
		);
		expect(on?.status).toBeUndefined();
		let [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.askDietaryRequirements).toBe(true);

		// Another tab's save leaves it alone.
		await actions.updateEvent(updateEventForm(event.id, [['titleFr', 'Dîner renommé']]));
		[row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.askDietaryRequirements).toBe(true);

		// Unchecked, only the hidden `false` is posted: the switch goes off.
		await actions.updateEvent(updateEventForm(event.id, [['askDietaryRequirements', 'false']]));
		[row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.askDietaryRequirements).toBe(false);
	});

	it('the booking page tells the form whether to ask', async () => {
		const { load } = await import('../../src/routes/(public)/events/[id]/book/[sessionId]/+page.server');
		for (const ask of [false, true]) {
			const event = await seedEvent(true, { askDietaryRequirements: ask });
			const seating = await seedSeating(event.id);
			const data: any = await load({ params: { id: event.id, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any);
			expect(data.asksDietaryRequirements).toBe(ask);
		}
	});
});

describe('booking with Dietary Requirements', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('stores the answer with the consent instant on an Event that asks', async () => {
		const event = await seedEvent(true, { askDietaryRequirements: true });
		const seating = await seedSeating(event.id);
		const before = new Date();

		const response = await book(seating.id, { dietaryRequirements: `  ${ANSWER} `, dietaryConsent: true });

		expect(response.status).toBe(201);
		const row = await onlyReservation();
		expect(row.dietaryRequirements).toBe(ANSWER);
		expect(row.dietaryConsentAt).toBeInstanceOf(Date);
		expect(row.dietaryConsentAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
	});

	it('stores it too when there is no Deposit and the booking is confirmed at once', async () => {
		const event = await seedEvent(true, { askDietaryRequirements: true, depositType: 'none', depositValue: 0 });
		const seating = await seedSeating(event.id);

		const response = await book(seating.id, { dietaryRequirements: ANSWER, dietaryConsent: true });

		expect(response.status).toBe(201);
		const row = await onlyReservation();
		expect(row.status).toBe('confirmed');
		expect(row.dietaryRequirements).toBe(ANSWER);
		expect(row.dietaryConsentAt).not.toBeNull();
	});

	it('books without answering', async () => {
		const event = await seedEvent(true, { askDietaryRequirements: true });
		const seating = await seedSeating(event.id);

		expect((await book(seating.id)).status).toBe(201);
		const row = await onlyReservation();
		expect(row.dietaryRequirements).toBeNull();
		expect(row.dietaryConsentAt).toBeNull();
	});

	it('refuses a filled answer without consent, booking nothing', async () => {
		const event = await seedEvent(true, { askDietaryRequirements: true });
		const seating = await seedSeating(event.id);

		const response = await book(seating.id, { dietaryRequirements: ANSWER });
		expect(response.status).toBe(400);
		expect(await testDb.select().from(reservations)).toHaveLength(0);

		const { createReservation, DietaryConsentRequiredError } = await import('../../src/lib/server/services/reservations');
		await expect(
			createReservation({ ...reservationBody(seating.id), dietaryRequirements: ANSWER, dietaryConsent: false })
		).rejects.toBeInstanceOf(DietaryConsentRequiredError);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
		expect(createCheckoutSessionMock).not.toHaveBeenCalled();
	});

	it('ignores an answer on an Event that does not ask', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);

		expect((await book(seating.id, { dietaryRequirements: ANSWER, dietaryConsent: true })).status).toBe(201);
		const row = await onlyReservation();
		expect(row.dietaryRequirements).toBeNull();
		expect(row.dietaryConsentAt).toBeNull();
	});

	it('the database refuses an answer without its consent instant', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);
		await expect(
			testDb.insert(reservations).values({
				eventSessionId: seating.id,
				guestEmail: 'guest@example.com',
				guestName: 'Guest',
				totalAmount: 0,
				depositAmount: 0,
				balanceAmount: 0,
				accessToken: 'atk-dietary-check',
				expiresAt: new Date(),
				dietaryRequirements: ANSWER,
			})
		).rejects.toThrow();
	});
});

describe('Admins see the Dietary Requirements', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	async function seedAnswered() {
		const event = await seedEvent(true, { askDietaryRequirements: true });
		const seating = await seedSeating(event.id);
		await book(seating.id, { dietaryRequirements: ANSWER, dietaryConsent: true });
		return { event, reservation: await onlyReservation() };
	}

	it('on the reservations list, the Event’s Reservations tab and the Reservation’s page', async () => {
		const { event, reservation } = await seedAnswered();

		const list = await import('../../src/routes/(admin)/admin/reservations/+page.server');
		const listed: any = await list.load({ url: new URL('http://x/admin/reservations'), locals: ADMIN_LOCALS } as any);
		expect(listed.reservations[0].dietaryRequirements).toBe(ANSWER);

		const editor = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const tab: any = await editor.load({ params: { id: event.id }, locals: ADMIN_LOCALS } as any);
		expect(tab.reservations[0].dietaryRequirements).toBe(ANSWER);

		const page = await import('../../src/routes/(admin)/admin/reservations/[id]/+page.server');
		const detail: any = await page.load({ params: { id: reservation.id }, locals: ADMIN_LOCALS } as any);
		expect(detail.reservation.dietaryRequirements).toBe(ANSWER);
		expect(detail.reservation.dietaryConsentAt).toBe(reservation.dietaryConsentAt!.toISOString());
	});

	it('in the CSV export', async () => {
		await seedAnswered();
		const { exportReservationsToCSV } = await import('../../src/lib/server/services/export');
		const csv = await exportReservationsToCSV();
		expect(csv.split('\n')[0]).toContain('Dietary Requirements');
		expect(csv).toContain(ANSWER);
	});
});
