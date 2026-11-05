// @vitest-environment node
/**
 * Issue 078 — the announcement video: the Visuels tab saves it, its
 * shape and the cover's key-visual flag.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, media } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
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
afterAll(async () => {
	await closeTestDatabase();
});

const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};

async function seedEvent() {
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
		})
		.returning();
	return event;
}

async function seedMedia(type: 'image' | 'video', eventId?: string) {
	const [row] = await testDb
		.insert(media)
		.values({
			type,
			url: `https://cdn.test/${crypto.randomUUID()}.${type === 'video' ? 'mp4' : 'webp'}`,
			s3Key: `test/${crypto.randomUUID()}`,
			mimeType: type === 'video' ? 'video/mp4' : 'image/webp',
			size: 1000,
			eventId: eventId ?? null,
			role: 'visual',
			isCover: false,
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

beforeEach(async () => {
	vi.clearAllMocks();
	await setupTestDatabase();
});

describe('the announcement video (issue 078)', () => {
	it('saves the video, its shape and the cover key-visual flag', async () => {
		const event = await seedEvent();
		const video = await seedMedia('video', event.id);
		const cover = await seedMedia('image', event.id);

		const result = await adminAction('updateMedia', event.id, {
			coverMediaId: cover.id,
			galleryMediaIds: '[]',
			coverVideoId: video.id,
			coverVideoPortrait: 'true',
			coverShowsTitle: 'true',
		});
		expect(result).toEqual({ success: expect.any(String) });

		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.coverVideoId).toBe(video.id);
		expect(row.coverVideoPortrait).toBe(true);
		expect(row.coverShowsTitle).toBe(true);
		// The video stays linked to the Event, untouched by the Visuals save.
		const [videoRow] = await testDb.select().from(media).where(eq(media.id, video.id));
		expect(videoRow.eventId).toBe(event.id);
	});

	it('refuses a video of another Event, or an image, as the announcement video', async () => {
		const event = await seedEvent();
		const other = await seedEvent();
		const foreignVideo = await seedMedia('video', other.id);
		const image = await seedMedia('image', event.id);

		await adminAction('updateMedia', event.id, {
			galleryMediaIds: '[]',
			coverVideoId: foreignVideo.id,
			coverVideoPortrait: 'true',
			coverShowsTitle: 'false',
		});
		let [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.coverVideoId).toBeNull();
		expect(row.coverVideoPortrait).toBe(false);

		await adminAction('updateMedia', event.id, {
			galleryMediaIds: '[]',
			coverVideoId: image.id,
		});
		[row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.coverVideoId).toBeNull();
	});

	it('removes the video and resets its shape, keeping the cover flag', async () => {
		const event = await seedEvent();
		const video = await seedMedia('video', event.id);
		await adminAction('updateMedia', event.id, {
			galleryMediaIds: '[]',
			coverVideoId: video.id,
			coverVideoPortrait: 'true',
			coverShowsTitle: 'true',
		});

		await adminAction('updateMedia', event.id, {
			galleryMediaIds: '[]',
			coverVideoId: '',
			coverShowsTitle: 'true',
		});
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.coverVideoId).toBeNull();
		expect(row.coverVideoPortrait).toBe(false);
		expect(row.coverShowsTitle).toBe(true);
	});
});
