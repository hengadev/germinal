// @vitest-environment node
/**
 * Issue 045 — Portfolio content: the Recap and the Event Photos (kept apart
 * from the Visuals, one cover per role), the project page a Portfolio Event
 * is shown as, and the Event Photos cover in "Projets" and the homepage.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, media } from '../../src/lib/server/db/schema';
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
	strictRateLimiter: { check: vi.fn().mockResolvedValue(true), getReset: vi.fn().mockResolvedValue(0) },
	RateLimitUnavailableError: class extends Error {},
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

vi.mock('../../src/lib/server/services/s3', () => ({
	deleteFromS3: vi.fn().mockResolvedValue(undefined),
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

async function seedEvent(isPortfolio = false) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'The Long Table',
			titleFr: 'La longue table',
			descriptionEn: 'An announcement.',
			descriptionFr: 'Une annonce.',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			isPortfolio,
			recapEn: isPortfolio ? 'Forty guests shared a long table.' : null,
			recapFr: isPortfolio ? 'Quarante convives autour d’une longue table.' : null,
		})
		.returning();
	const startTime = new Date('2025-03-12T19:00:00Z');
	const endTime = new Date('2025-03-12T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, event.id, startTime, endTime);
	await testDb.insert(eventSessions).values({
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
	});
	return event;
}

async function seedMedia(
	fields: { eventId?: string | null; role: 'visual' | 'event_photo'; isCover?: boolean; altEn?: string; altFr?: string }
) {
	const [row] = await testDb
		.insert(media)
		.values({
			type: 'image',
			url: `https://cdn.test/${crypto.randomUUID()}.webp`,
			s3Key: `test/${crypto.randomUUID()}.webp`,
			mimeType: 'image/webp',
			size: 1000,
			eventId: fields.eventId ?? null,
			role: fields.role,
			isCover: fields.isCover ?? false,
			altEn: fields.altEn,
			altFr: fields.altFr,
		})
		.returning();
	return row;
}

async function adminAction(name: string, eventId: string, fields: Record<string, string>) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return (actions as any)[name]({
		request: new Request(`http://x/admin/events/${eventId}?/${name}`, { method: 'POST', body: form }),
		params: { id: eventId },
		locals: ADMIN_LOCALS,
	});
}

async function eventMedia(eventId: string) {
	return testDb.select().from(media).where(eq(media.eventId, eventId));
}

async function publicPage(eventId: string) {
	const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
	return (await load({ params: { id: eventId }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any)) as any;
}

beforeEach(async () => {
	vi.clearAllMocks();
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// The « Portfolio » tab
// ---------------------------------------------------------------------------

describe('the « Portfolio » tab', () => {
	it('saves the Recap in both languages, leaving the other fields alone', async () => {
		const event = await seedEvent();
		const result = await adminAction('updateEvent', event.id, { recapFr: 'Ce qui a eu lieu.', recapEn: '  ' });
		expect(result).toEqual({ success: expect.any(String) });
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.recapFr).toBe('Ce qui a eu lieu.');
		expect(row.recapEn).toBeNull();
		expect(row.descriptionEn).toBe('An announcement.');
	});

	it('links the Event Photos and picks their cover, without touching the Visuals', async () => {
		const event = await seedEvent();
		const visual = await seedMedia({ eventId: event.id, role: 'visual', isCover: true });
		const a = await seedMedia({ role: 'event_photo' });
		const b = await seedMedia({ role: 'event_photo' });

		await adminAction('updateEventPhotos', event.id, {
			eventPhotoIds: JSON.stringify([a.id, b.id, visual.id]),
			eventPhotoCoverId: b.id,
		});

		const rows = Object.fromEntries((await eventMedia(event.id)).map((row: any) => [row.id, row]));
		expect(rows[a.id]).toMatchObject({ role: 'event_photo', isCover: false });
		expect(rows[b.id]).toMatchObject({ role: 'event_photo', isCover: true });
		// The Visual stays a Visual, with its own cover.
		expect(rows[visual.id]).toMatchObject({ role: 'visual', isCover: true });

		// Moving the cover keeps one per role.
		await adminAction('updateEventPhotos', event.id, {
			eventPhotoIds: JSON.stringify([a.id, b.id]),
			eventPhotoCoverId: a.id,
		});
		const covers = (await eventMedia(event.id)).filter((row: any) => row.isCover).map((row: any) => row.id).sort();
		expect(covers).toEqual([a.id, visual.id].sort());
	});

	it('never takes an Event Photo as a Visual in « Visuels »', async () => {
		const event = await seedEvent();
		const photo = await seedMedia({ eventId: event.id, role: 'event_photo', isCover: true });
		const visual = await seedMedia({ role: 'visual' });

		await adminAction('updateMedia', event.id, {
			coverMediaId: photo.id,
			galleryMediaIds: JSON.stringify([visual.id]),
		});

		const rows = Object.fromEntries((await eventMedia(event.id)).map((row: any) => [row.id, row]));
		expect(rows[photo.id]).toMatchObject({ role: 'event_photo', isCover: true });
		expect(rows[visual.id]).toMatchObject({ role: 'visual' });
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.coverMediaId).toBeNull();
	});

	it('adds an Event that is over to the Portfolio without a Recap or Event Photos', async () => {
		const event = await seedEvent();
		const result = await adminAction('updateEvent', event.id, { visibility: 'public', isPortfolio: 'true' });
		expect(result).toEqual({ success: expect.any(String) });
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.isPortfolio).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

describe('a Portfolio Event’s page is its project', () => {
	it('shows the Recap, Event Photos, credits, dates and venue — no announcement text, Seatings or prices', async () => {
		const event = await seedEvent(true);
		await seedMedia({ eventId: event.id, role: 'visual', isCover: true });
		const photo = await seedMedia({ eventId: event.id, role: 'event_photo', isCover: true });
		const other = await seedMedia({ eventId: event.id, role: 'event_photo' });

		const data = await publicPage(event.id);
		expect(data.view).toBe('portfolio');
		expect(data.event).toBeNull();
		expect(data.schedule).toEqual([]);
		expect(data.sessions).toEqual([]);
		expect(data.project.recapFr).toBe('Quarante convives autour d’une longue table.');
		expect(data.project.cover.id).toBe(photo.id);
		expect(data.project.eventPhotos.map((m: { id: string }) => m.id)).toEqual([photo.id, other.id]);
		expect(data.project.days).toEqual(['2025-03-12']);
		expect(data.project.titleEn).toBe('The Long Table');
		expect(data.project).not.toHaveProperty('descriptionEn');
		expect(data.project).not.toHaveProperty('media');
		expect(data.project).not.toHaveProperty('practicalInfoEn');
	});

	it('an announcement shows only its Visuals', async () => {
		const event = await seedEvent(false);
		const visual = await seedMedia({ eventId: event.id, role: 'visual' });
		await seedMedia({ eventId: event.id, role: 'event_photo' });

		const data = await publicPage(event.id);
		expect(data.view).toBe('announcement');
		expect(data.project).toBeNull();
		expect(data.event.media.map((m: { id: string }) => m.id)).toEqual([visual.id]);
	});
});

describe('"Projets" and the homepage gallery use the Event Photos cover', () => {
	it('shows the Event Photos cover, falling back to the Visual cover', async () => {
		const withPhotos = await seedEvent(true);
		const visualCover = await seedMedia({ eventId: withPhotos.id, role: 'visual', isCover: true });
		await testDb.update(events).set({ coverMediaId: visualCover.id }).where(eq(events.id, withPhotos.id));
		const photoCover = await seedMedia({ eventId: withPhotos.id, role: 'event_photo', isCover: true });

		const visualsOnly = await seedEvent(true);
		const onlyVisual = await seedMedia({ eventId: visualsOnly.id, role: 'visual', isCover: true });
		await testDb.update(events).set({ coverMediaId: onlyVisual.id }).where(eq(events.id, visualsOnly.id));

		const expected = { [withPhotos.id]: photoCover.id, [visualsOnly.id]: onlyVisual.id };

		const projets = await import('../../src/routes/(public)/events/+page.server');
		const listed: any = await projets.load({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
		for (const e of listed.events) expect(e.coverMedia.id).toBe(expected[e.id]);
		expect(listed.events).toHaveLength(2);

		const home = await import('../../src/routes/(public)/+page.server');
		const homeData: any = await home.load({ locals: ANONYMOUS_LOCALS } as any);
		for (const e of homeData.events) expect(e.coverMedia.id).toBe(expected[e.id]);
	});
});
