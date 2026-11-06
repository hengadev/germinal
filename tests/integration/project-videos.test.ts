// @vitest-environment node
/**
 * Issue 084 — Project videos: an Event's promotional videos are Event
 * media of the Event Photos' role, type video. They are saved with the
 * Portfolio tab (never as the cover) and the public project page (and its
 * Admin preview) streams them after the cover, before the other photos.
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
// Mocks (the same as the other editor/public page tests)
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout',
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

async function seedEvent(fields: { visibility: 'public' | 'draft'; isPortfolio?: boolean }) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'The Long Table',
			titleFr: 'La longue table',
			descriptionEn: 'An announcement.',
			descriptionFr: 'Une annonce.',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: fields.visibility,
			isPortfolio: fields.isPortfolio ?? false,
			recapEn: fields.isPortfolio ? 'Forty guests shared a long table.' : null,
			recapFr: fields.isPortfolio ? 'Quarante convives autour d’une longue table.' : null,
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
	fields: {
		eventId?: string | null;
		role: 'visual' | 'event_photo';
		type?: 'image' | 'video';
		isCover?: boolean;
	}
) {
	const type = fields.type ?? 'image';
	const [row] = await testDb
		.insert(media)
		.values({
			type,
			url: `https://cdn.test/${crypto.randomUUID()}.${type === 'video' ? 'mp4' : 'webp'}`,
			s3Key: `test/${crypto.randomUUID()}`,
			mimeType: type === 'video' ? 'video/mp4' : 'image/webp',
			size: 1000,
			eventId: fields.eventId ?? null,
			role: fields.role,
			isCover: fields.isCover ?? false,
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

async function publicPage(eventId: string, locals: unknown = ANONYMOUS_LOCALS) {
	const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
	return (await load({ params: { id: eventId }, locals, setHeaders: () => {} } as any)) as any;
}

beforeEach(async () => {
	vi.clearAllMocks();
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// The « Portfolio » tab
// ---------------------------------------------------------------------------

describe('the « Portfolio » tab with project videos', () => {
	it('saves videos as Event Photos in their order, never as the cover', async () => {
		const event = await seedEvent({ visibility: 'public' });
		const photo = await seedMedia({ role: 'event_photo' });
		const other = await seedMedia({ role: 'event_photo' });
		const videoA = await seedMedia({ role: 'event_photo', type: 'video' });
		const videoB = await seedMedia({ role: 'event_photo', type: 'video' });

		// A video posted as the cover is not taken as one.
		await adminAction('updateEventPhotos', event.id, {
			eventPhotoIds: JSON.stringify([photo.id, videoB.id, videoA.id, other.id]),
			eventPhotoCoverId: videoB.id,
		});

		const rows = Object.fromEntries((await eventMedia(event.id)).map((row: any) => [row.id, row]));
		expect(rows[photo.id]).toMatchObject({ role: 'event_photo', isCover: false });
		expect(rows[other.id]).toMatchObject({ role: 'event_photo', isCover: false });
		expect(rows[videoA.id]).toMatchObject({ role: 'event_photo', type: 'video', isCover: false });
		expect(rows[videoB.id]).toMatchObject({ role: 'event_photo', type: 'video', isCover: false });

		// An image cover is taken as before, the videos stay Event Photos.
		await adminAction('updateEventPhotos', event.id, {
			eventPhotoIds: JSON.stringify([other.id, photo.id, videoA.id, videoB.id]),
			eventPhotoCoverId: photo.id,
		});
		const rowsAfter = Object.fromEntries((await eventMedia(event.id)).map((row: any) => [row.id, row]));
		expect(rowsAfter[photo.id]).toMatchObject({ role: 'event_photo', isCover: true });
		expect(rowsAfter[videoB.id]).toMatchObject({ role: 'event_photo', type: 'video', isCover: false });
	});
});

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

describe('a project with videos', () => {
	it('streams the cover, then the videos, then the other photos', async () => {
		const event = await seedEvent({ visibility: 'public', isPortfolio: true });
		const visual = await seedMedia({ eventId: event.id, role: 'visual', isCover: true });
		const photo = await seedMedia({ eventId: event.id, role: 'event_photo', isCover: true });
		const other = await seedMedia({ eventId: event.id, role: 'event_photo' });
		const videoA = await seedMedia({ eventId: event.id, role: 'event_photo', type: 'video' });
		const videoB = await seedMedia({ eventId: event.id, role: 'event_photo', type: 'video' });

		const data = await publicPage(event.id);
		expect(data.view).toBe('portfolio');
		expect(data.project.cover.id).toBe(photo.id);
		const ids = data.project.eventPhotos.map((m: { id: string }) => m.id);
		// The cover leads, the photos close, the videos stand between.
		expect(ids[0]).toBe(photo.id);
		expect(ids.slice(1, 3).sort()).toEqual([videoA.id, videoB.id].sort());
		expect(ids[3]).toBe(other.id);
	});

	it('never takes a video as the cover, falling back to the Visual cover', async () => {
		const event = await seedEvent({ visibility: 'public', isPortfolio: true });
		const visual = await seedMedia({ eventId: event.id, role: 'visual', isCover: true });
		await testDb.update(events).set({ coverMediaId: visual.id }).where(eq(events.id, event.id));
		const photo = await seedMedia({ eventId: event.id, role: 'event_photo' });
		// A video left marked as cover (a row from before the rule): it is
		// skipped, the Visual cover stands.
		const video = await seedMedia({ eventId: event.id, role: 'event_photo', type: 'video', isCover: true });

		const data = await publicPage(event.id);
		expect(data.project.cover.id).toBe(visual.id);
		const ids = data.project.eventPhotos.map((m: { id: string }) => m.id);
		// The Visual cover still leads the stream; the video is not the cover.
		expect(ids[0]).toBe(visual.id);
		expect(new Set(ids)).toEqual(new Set([visual.id, video.id, photo.id]));
	});

	it('the Admin preview of a Portfolio-only Draft streams them the same way', async () => {
		const event = await seedEvent({ visibility: 'draft', isPortfolio: true });
		const photo = await seedMedia({ eventId: event.id, role: 'event_photo', isCover: true });
		const video = await seedMedia({ eventId: event.id, role: 'event_photo', type: 'video' });

		const data = await publicPage(event.id, ADMIN_LOCALS);
		expect(data.view).toBe('portfolio-preview');
		expect(data.project.cover.id).toBe(photo.id);
		expect(data.project.eventPhotos.map((m: { id: string }) => m.id)).toEqual([photo.id, video.id]);
	});
});
