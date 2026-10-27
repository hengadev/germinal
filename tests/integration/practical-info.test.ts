// @vitest-environment node
/**
 * Issue 040 — Practical Info (arrival instructions, door code, dress code,
 * a contact on the day) is written by the Admin in the « Infos pratiques »
 * tab and given only to Guests holding a Ticket: on the Ticket page and in
 * the confirmation and reminder emails (which also gain the venue name and
 * address and the Seating time in the Event's Time Zone). It never appears
 * on the public Event page or in any public loader.
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

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendTicketConfirmationSMS: vi.fn().mockResolvedValue(undefined),
	sendEventReminderSMS: vi.fn().mockResolvedValue(undefined),
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
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANONYMOUS_LOCALS = { user: null, csrfToken: 'token' };
const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};

const PRACTICAL_INFO_EN = 'Enter by the courtyard, door code 4512B.';
const PRACTICAL_INFO_FR = 'Entrez par la cour, code 4512B.';

async function seedEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Clocktower Dinner',
			titleFr: 'Dîner à la tour de l’horloge',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-07-15'),
			endDate: new Date('2099-07-15'),
			locationEn: 'The Clocktower, London',
			locationFr: 'La tour de l’horloge, Londres',
			venueNameEn: 'The Clocktower',
			venueNameFr: 'La tour de l’horloge',
			streetAddressEn: '12 Cloth Fair',
			streetAddressFr: '12 Cloth Fair',
			cityEn: 'London',
			cityFr: 'Londres',
			postalCode: 'EC1A 7JQ',
			countryEn: 'United Kingdom',
			countryFr: 'Royaume-Uni',
			// The venue is in London: times are shown on its clock (ADR 0006).
			timeZone: 'Europe/London',
			visibility: 'public',
			practicalInfoEn: PRACTICAL_INFO_EN,
			practicalInfoFr: PRACTICAL_INFO_FR,
			...overrides,
		})
		.returning();
	return event;
}

/** A London dinner stored at 19:00Z, which is 20:00 in Europe/London (BST). */
async function seedLondonDinner(eventId: string) {
	const startTime = new Date('2099-07-15T19:00:00Z');
	const endTime = new Date('2099-07-15T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime, { priceAmount: 2500 });
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
		})
		.returning();
	return seating;
}

async function book(seatingId: string) {
	const accessToken = 'a'.repeat(63) + Math.floor(Math.random() * 10);
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: seatingId,
			guestEmail: 'guest@example.com',
			guestName: 'Guest',
			quantity: 2,
			totalAmount: 5000,
			depositAmount: 5000,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'confirmed',
			accessToken,
			expiresAt: new Date(),
			confirmedAt: new Date(),
		})
		.returning();
	return reservation;
}

function updateEventForm(eventId: string, fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return {
		request: new Request(`http://x/admin/events/${eventId}?/updateEvent`, { method: 'POST', body: form }),
		params: { id: eventId },
		locals: ADMIN_LOCALS,
	} as any;
}

function headersOf() {
	const headers: Record<string, string> = {};
	return { headers, setHeaders: (h: Record<string, string>) => Object.assign(headers, h) };
}

/** Nothing in the serialized Event carries the Practical Info columns. */
function carriesNoPracticalInfo(event: Record<string, unknown>) {
	expect('practicalInfoEn' in event).toBe(false);
	expect('practicalInfoFr' in event).toBe(false);
}

// ---------------------------------------------------------------------------
// The « Infos pratiques » tab
// ---------------------------------------------------------------------------

describe('the « Infos pratiques » tab', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('saves both languages through updateEvent, which touches only the fields it posts', async () => {
		const event = await seedEvent({ practicalInfoEn: null, practicalInfoFr: null });
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');

		const saved: any = await actions.updateEvent(
			updateEventForm(event.id, { practicalInfoFr: PRACTICAL_INFO_FR, practicalInfoEn: PRACTICAL_INFO_EN })
		);
		expect(saved?.status).toBeUndefined();
		let [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.practicalInfoFr).toBe(PRACTICAL_INFO_FR);
		expect(row.practicalInfoEn).toBe(PRACTICAL_INFO_EN);

		// Saving the tab again with a blank field clears it and leaves the
		// Event's other fields (here its French title) alone.
		const cleared: any = await actions.updateEvent(
			updateEventForm(event.id, { practicalInfoEn: '' })
		);
		expect(cleared?.status).toBeUndefined();
		[row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.practicalInfoEn).toBeNull();
		expect(row.practicalInfoFr).toBe(PRACTICAL_INFO_FR);
		expect(row.titleFr).toBe('Dîner à la tour de l’horloge');
	});

	it('the admin Event editor loads it', async () => {
		const event = await seedEvent();
		const { load } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const data: any = await load({ params: { id: event.id }, locals: ADMIN_LOCALS } as any);
		expect(data.event.practicalInfoEn).toBe(PRACTICAL_INFO_EN);
		expect(data.event.practicalInfoFr).toBe(PRACTICAL_INFO_FR);
	});
});

// ---------------------------------------------------------------------------
// The Ticket and the emails
// ---------------------------------------------------------------------------

describe('the Ticket page and the emails give Practical Info to Guests', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('the Ticket page carries it in both languages, for the Guest’s own locale to choose', async () => {
		const event = await seedEvent();
		const seating = await seedLondonDinner(event.id);
		const reservation = await book(seating.id);

		const { load } = await import('../../src/routes/(public)/tickets/[token]/+page.server');
		const data: any = await load({ params: { token: reservation.accessToken } } as never);
		expect(data.reservation.session.event.practicalInfoEn).toBe(PRACTICAL_INFO_EN);
		expect(data.reservation.session.event.practicalInfoFr).toBe(PRACTICAL_INFO_FR);
	});

	it('the confirmation and reminder emails carry it, the venue name and address, and the Seating time in the Event’s Time Zone (HTML and text)', async () => {
		// The English text with markup, to check it is escaped in the HTML.
		const event = await seedEvent({
			practicalInfoEn: 'Arrive <b>on time</b> & ring the bell. ' + PRACTICAL_INFO_EN,
		});
		const seating = await seedLondonDinner(event.id);
		const reservation = await book(seating.id);

		const { getReservationByToken } = await import('../../src/lib/server/services/reservations');
		const found = await getReservationByToken(reservation.accessToken);
		expect(found).not.toBeNull();
		const ticketData = {
			guestEmail: found!.guestEmail,
			guestName: found!.guestName,
			accessToken: found!.accessToken,
			reservation: found!,
			session: found!.eventSession,
			event: found!.eventSession.event,
		};

		const { generateTicketTextTemplate, generateTicketHtmlTemplate, generateEventReminderTextTemplate, generateEventReminderHtmlTemplate } =
			await import('../../src/lib/server/services/email');
		const templates = {
			'confirmation text': generateTicketTextTemplate(ticketData),
			'confirmation html': generateTicketHtmlTemplate(ticketData),
			'reminder text': generateEventReminderTextTemplate({ ...ticketData, daysUntil: 1 }),
			'reminder html': generateEventReminderHtmlTemplate({ ...ticketData, daysUntil: 1 }),
		};

		for (const [name, body] of Object.entries(templates)) {
			// The Seating time on the venue's clock, not the server's.
			expect(body).toContain('15 July 2099 at 20:00');
			expect(body).not.toContain('19:00');
			// The venue's name and address.
			expect(body).toContain('The Clocktower');
			expect(body).toContain('12 Cloth Fair');
			expect(body).toContain('London');
			expect(body).toContain('United Kingdom');
			// The Practical Info.
			expect(body).toContain(PRACTICAL_INFO_EN);
			if (name.endsWith('html')) {
				expect(body).toContain('&lt;b&gt;on time&lt;/b&gt; &amp; ring the bell');
				expect(body).not.toContain('<b>on time</b>');
			}
		}
	});

	it('each language falls back to the other in the emails', async () => {
		const event = await seedEvent({ practicalInfoEn: null });
		const seating = await seedLondonDinner(event.id);
		const reservation = await book(seating.id);

		const { getReservationByToken } = await import('../../src/lib/server/services/reservations');
		const found = await getReservationByToken(reservation.accessToken);
		const { generateTicketTextTemplate } = await import('../../src/lib/server/services/email');
		const text = generateTicketTextTemplate({
			guestEmail: found!.guestEmail,
			guestName: found!.guestName,
			accessToken: found!.accessToken,
			reservation: found!,
			session: found!.eventSession,
			event: found!.eventSession.event,
		});
		expect(text).toContain(PRACTICAL_INFO_FR);
		expect(text).not.toContain(PRACTICAL_INFO_EN);
	});

	it('empty Practical Info renders no empty section', async () => {
		const event = await seedEvent({ practicalInfoEn: null, practicalInfoFr: null });
		const seating = await seedLondonDinner(event.id);
		const reservation = await book(seating.id);

		const { getReservationByToken } = await import('../../src/lib/server/services/reservations');
		const found = await getReservationByToken(reservation.accessToken);
		const email = await import('../../src/lib/server/services/email');
		const base = {
			guestEmail: found!.guestEmail,
			guestName: found!.guestName,
			accessToken: found!.accessToken,
			reservation: found!,
			session: found!.eventSession,
			event: found!.eventSession.event,
		};
		expect(email.generateTicketTextTemplate(base)).not.toContain('PRACTICAL INFO');
		expect(email.generateTicketHtmlTemplate(base)).not.toContain('Practical Info');
		expect(email.generateEventReminderTextTemplate({ ...base, daysUntil: 1 })).not.toContain('PRACTICAL INFO');
		expect(email.generateEventReminderHtmlTemplate({ ...base, daysUntil: 1 })).not.toContain('Practical Info');
	});
});

// ---------------------------------------------------------------------------
// Never on the public page or in any public loader
// ---------------------------------------------------------------------------

describe('the public Event page and loaders never include Practical Info', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('the public Event page leaves it out, even for the Admin previewing a Draft', async () => {
		const draft = await seedEvent({ visibility: 'draft' });
		await seedLondonDinner(draft.id);
		const pub = await seedEvent();
		await seedLondonDinner(pub.id);
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');

		// A Draft answers 404 to an anonymous visitor (issue 033)...
		const { setHeaders: anonymousHeaders } = headersOf();
		await expect(
			load({ params: { id: draft.id }, locals: ANONYMOUS_LOCALS, setHeaders: anonymousHeaders } as any)
		).rejects.toMatchObject({ status: 404 });

		// ...its preview (Admin only) and a Public Event's page both leave
		// the Practical Info out.
		const { setHeaders: adminHeaders } = headersOf();
		const preview: any = await load({ params: { id: draft.id }, locals: ADMIN_LOCALS, setHeaders: adminHeaders } as any);
		expect(preview.view).toBe('preview');
		carriesNoPracticalInfo(preview.event);

		const { setHeaders: publicHeaders } = headersOf();
		const data: any = await load({ params: { id: pub.id }, locals: ANONYMOUS_LOCALS, setHeaders: publicHeaders } as any);
		expect(data.event.id).toBe(pub.id);
		carriesNoPracticalInfo(data.event);
	});

	it('the booking page leaves it out', async () => {
		const event = await seedEvent();
		const seating = await seedLondonDinner(event.id);
		const { load } = await import('../../src/routes/(public)/events/[id]/book/[sessionId]/+page.server');
		const data: any = await load({
			params: { id: event.id, sessionId: seating.id },
			locals: ANONYMOUS_LOCALS,
		} as any);
		expect(data.session.id).toBe(seating.id);
		carriesNoPracticalInfo(data.event);
	});

	it('the Event API leaves it out for anyone but an Admin', async () => {
		const event = await seedEvent();
		const { GET } = await import('../../src/routes/api/events/[id]/+server');
		const publicResponse = await GET({ params: { id: event.id }, locals: ANONYMOUS_LOCALS } as any);
		carriesNoPracticalInfo(await publicResponse.json());
		const adminResponse = await GET({ params: { id: event.id }, locals: ADMIN_LOCALS } as any);
		const adminBody = await adminResponse.json();
		expect(adminBody.practicalInfoEn).toBe(PRACTICAL_INFO_EN);
	});

	it('the homepage gallery, the Events listing and the Spotlight leave it out', async () => {
		await seedEvent({ isPortfolio: true });
		const spotlight = await seedEvent({ isSpotlight: true });

		const home = await import('../../src/routes/(public)/+page.server');
		const homeData: any = await home.load({ locals: ANONYMOUS_LOCALS } as any);
		homeData.events.forEach(carriesNoPracticalInfo);
		carriesNoPracticalInfo(homeData.spotlightEvent);

		const list = await import('../../src/routes/(public)/events/+page.server');
		const listData: any = await list.load({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
		listData.events.forEach(carriesNoPracticalInfo);

		const { getSpotlightEvent } = await import('../../src/lib/server/services/events');
		const spotlightRow = (await getSpotlightEvent()) as any;
		expect(spotlightRow.id).toBe(spotlight.id);
		carriesNoPracticalInfo(spotlightRow);

		const spotlightPage = await import('../../src/routes/(public)/spotlight/+page.server');
		// It returns no Event, only a redirect to the Event's page.
		const target = await spotlightPage.load({ locals: ANONYMOUS_LOCALS } as any)
			.then(() => null, (e: any) => e?.location ?? Promise.reject(e));
		expect(target).toBe(`/events/${spotlight.id}`);
	});
});

afterAll(async () => {
	await closeTestDatabase();
});
