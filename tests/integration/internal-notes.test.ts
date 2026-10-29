// @vitest-environment node
/**
 * Issue 039 — Internal Notes are free text only Admins ever see. The admin
 * editor reads and saves them in « Essentiel »; the public Event page, the
 * Events listings, the Spotlight, the booking page and the Staff portal
 * never return them.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, eventStaff, staffRoles, tasks, users } from '../../src/lib/server/db/schema';
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

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
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
	isBrevoConfigured: () => false,
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

const NOTES = 'Contact du lieu : Mme Durand 06 12 34 56 78 — budget 4 000 €';
const ANONYMOUS_LOCALS = { user: null, csrfToken: 'token' };
const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};

/** Whether the notes appear anywhere in what a loader returned. */
function leaks(data: unknown): boolean {
	const serialized = JSON.stringify(data);
	return serialized.includes(NOTES) || serialized.includes('internalNotes');
}

/** A Public Spotlight with Internal Notes and one bookable Seating. */
async function seedEventWithNotes() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01T19:00:00Z'),
			endDate: new Date('2099-06-01T22:00:00Z'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility: 'public',
			isSpotlight: true,
			internalNotes: NOTES,
		})
		.returning();
	const startTime = new Date('2099-06-01T19:00:00Z');
	const endTime = new Date('2099-06-01T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, event.id, startTime, endTime);
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId,
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startTime,
			endTime,
			totalCapacity: 10,
			availableCapacity: 10,
			published: true,
			allowWaitlist: true,
		})
		.returning();
	return { event, seating };
}

async function seedStaffOn(eventId: string) {
	// Users outlive setupTestDatabase: unique emails keep reruns apart.
	const run = crypto.randomUUID();
	const [admin] = await testDb
		.insert(users)
		.values({ email: `admin-${run}@example.com`, firstName: 'A', lastName: 'Dmin', passwordHash: 'x', role: 'admin' })
		.returning();
	const [staff] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	const [role] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, 'Responsable'));
	await testDb.insert(eventStaff).values({ eventId, userId: staff.id, staffRoleId: role.id });
	await testDb.insert(tasks).values({ eventId, assignedTo: staff.id, createdBy: admin.id, title: 'Mise en place' });
	return { id: staff.id, email: staff.email, role: 'staff', createdAt: new Date() };
}

function updateEventForm(eventId: string, fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return {
		request: new Request('http://x/admin/events/' + eventId + '?/updateEvent', { method: 'POST', body: form }),
		params: { id: eventId },
		locals: ADMIN_LOCALS,
	} as any;
}

async function notesOf(eventId: string) {
	const [row] = await testDb.select({ internalNotes: events.internalNotes }).from(events).where(eq(events.id, eventId));
	return row.internalNotes;
}

// ---------------------------------------------------------------------------
// The Admin edits them
// ---------------------------------------------------------------------------

describe('the Admin edits Internal Notes in « Essentiel »', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('the admin editor loads them', async () => {
		const { event } = await seedEventWithNotes();
		const { load } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const data: any = await load({ params: { id: event.id }, locals: ADMIN_LOCALS } as any);
		expect(data.event.internalNotes).toBe(NOTES);
	});

	it('saving the Essentiel tab saves them, and a blank field clears them', async () => {
		const { event } = await seedEventWithNotes();
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');

		await actions.updateEvent!(updateEventForm(event.id, { titleFr: 'Dîner', internalNotes: 'Client : Maison Lenoir' }));
		expect(await notesOf(event.id)).toBe('Client : Maison Lenoir');

		await actions.updateEvent!(updateEventForm(event.id, { titleFr: 'Dîner', internalNotes: '  ' }));
		expect(await notesOf(event.id)).toBeNull();
	});

	it('a tab that does not post them leaves them as they are', async () => {
		const { event } = await seedEventWithNotes();
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		await actions.updateEvent!(updateEventForm(event.id, { cityFr: 'Paris' }));
		expect(await notesOf(event.id)).toBe(NOTES);
	});
});

// ---------------------------------------------------------------------------
// Never returned outside the admin
// ---------------------------------------------------------------------------

describe('Internal Notes never leave the admin', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('the public Event page does not return them', async () => {
		const { event } = await seedEventWithNotes();
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const data: any = await load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any);
		expect(data.event.id).toBe(event.id);
		expect(leaks(data)).toBe(false);
	});

	it('the Event API does not return them, not even to an Admin', async () => {
		const { event } = await seedEventWithNotes();
		const { GET } = await import('../../src/routes/api/events/[id]/+server');
		for (const locals of [ANONYMOUS_LOCALS, ADMIN_LOCALS]) {
			const response = await GET({ params: { id: event.id }, locals } as any);
			const body = await response.json();
			expect(body.id).toBe(event.id);
			expect(leaks(body)).toBe(false);
		}
	});

	it('the Events listings do not return them', async () => {
		const { event } = await seedEventWithNotes();
		await testDb.update(events).set({ isSpotlight: false }).where(eq(events.id, event.id));

		const { load: listing } = await import('../../src/routes/(public)/events/+page.server');
		const listed: any = await listing({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
		expect(leaks(listed)).toBe(false);

		const { load: home } = await import('../../src/routes/(public)/+page.server');
		expect(leaks(await home({ locals: ANONYMOUS_LOCALS } as any))).toBe(false);

		const { GET } = await import('../../src/routes/api/events/+server');
		const response = await GET({ url: new URL('http://x/api/events?published=false'), setHeaders: () => {}, locals: ADMIN_LOCALS } as any);
		const body = await response.json();
		expect(body.data.map((e: { id: string }) => e.id)).toContain(event.id);
		expect(leaks(body)).toBe(false);
	});

	it('the Spotlight does not return them', async () => {
		const { event } = await seedEventWithNotes();
		const { getSpotlightEvent } = await import('../../src/lib/server/services/events');
		const spotlight = await getSpotlightEvent();
		expect(spotlight?.id).toBe(event.id);
		expect(leaks(spotlight)).toBe(false);

		const { load } = await import('../../src/routes/(public)/spotlight/+page.server');
		// It returns no Event, only a redirect to the Event's page.
		expect(await load({ locals: ANONYMOUS_LOCALS } as any).then(() => null, (e: any) => e?.location ?? Promise.reject(e))).toBe(`/events/${event.id}`);

		const { load: home } = await import('../../src/routes/(public)/+page.server');
		const homeData: any = await home({ locals: ANONYMOUS_LOCALS } as any);
		expect(homeData.spotlightEvent.id).toBe(event.id);
		expect(leaks(homeData)).toBe(false);
	});

	it('the booking page does not return them', async () => {
		const { event, seating } = await seedEventWithNotes();
		const { load } = await import('../../src/routes/(public)/events/[id]/book/[sessionId]/+page.server');
		const data: any = await load({ params: { id: event.id, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any);
		expect(data.session.id).toBe(seating.id);
		expect(leaks(data)).toBe(false);
	});

	it('the Staff portal does not return them', async () => {
		const { event } = await seedEventWithNotes();
		const staff = await seedStaffOn(event.id);

		const { load } = await import('../../src/routes/(staff)/staff/+page.server');
		const data: any = await load({ locals: { user: staff, csrfToken: 'token' } } as any);
		expect(data.events.map((e: { event: { id: string } }) => e.event.id)).toEqual([event.id]);
		expect(data.tasks).toHaveLength(1);
		expect(leaks(data)).toBe(false);

		const { GET } = await import('../../src/routes/api/staff/tasks/+server');
		const response = await GET({ locals: { user: staff, csrfToken: 'token' } } as any);
		const body = await response.json();
		expect(body).toHaveLength(1);
		expect(leaks(body)).toBe(false);
	});
});
