// @vitest-environment node
/**
 * Issue 043 — bilingual alt text on images: the upload component saves an
 * image's alt texts with its media row, and they stay editable after upload.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { media } from '../../src/lib/server/db/schema';
import { getTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false, PUBLIC_URL: 'http://localhost:5173' },
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

const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};
const GUEST_LOCALS = {
	user: { id: 'user-1', email: 'guest@example.com', role: 'user', createdAt: new Date() },
	csrfToken: 'token',
};

async function seedImage() {
	const [row] = await testDb
		.insert(media)
		.values({
			type: 'image',
			url: 'https://cdn.test/a.webp',
			s3Key: `test/${crypto.randomUUID()}.webp`,
			mimeType: 'image/webp',
			size: 1000,
		})
		.returning();
	return row;
}

async function patch(id: string, body: unknown, locals: unknown = ADMIN_LOCALS) {
	const { PATCH } = await import('../../src/routes/api/media/[id]/+server');
	const request = new Request(`http://localhost/api/media/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return PATCH({ request, params: { id }, locals } as any);
}

async function altOf(id: string) {
	const [row] = await testDb.select().from(media).where(eq(media.id, id));
	return { altEn: row.altEn, altFr: row.altFr };
}

describe('alt text on media', () => {
	beforeEach(async () => {
		await testDb.delete(media);
	});

	it('starts without alt text', async () => {
		const image = await seedImage();
		expect(await altOf(image.id)).toEqual({ altEn: null, altFr: null });
	});

	it('saves each language on its own, trimmed', async () => {
		const image = await seedImage();
		const res = await patch(image.id, { altFr: '  Une table dressée ' });
		expect(res.status).toBe(200);
		expect(await altOf(image.id)).toEqual({ altEn: null, altFr: 'Une table dressée' });

		await patch(image.id, { altEn: 'A laid table' });
		expect(await altOf(image.id)).toEqual({ altEn: 'A laid table', altFr: 'Une table dressée' });
	});

	it('is editable later, and a blank text clears it', async () => {
		const image = await seedImage();
		await patch(image.id, { altEn: 'A table', altFr: 'Une table' });
		await patch(image.id, { altEn: 'A laid table', altFr: '   ' });
		expect(await altOf(image.id)).toEqual({ altEn: 'A laid table', altFr: null });
	});

	it('refuses a text too long', async () => {
		const image = await seedImage();
		await expect(patch(image.id, { altEn: 'a'.repeat(501) })).rejects.toMatchObject({ status: 400 });
		expect(await altOf(image.id)).toEqual({ altEn: null, altFr: null });
	});

	it('is for Admins only', async () => {
		const image = await seedImage();
		await expect(patch(image.id, { altEn: 'x' }, GUEST_LOCALS)).rejects.toMatchObject({ status: 403 });
		await expect(patch(image.id, { altEn: 'x' }, { user: null })).rejects.toMatchObject({ status: 401 });
	});

	it('answers 404 for an unknown image', async () => {
		await expect(patch(crypto.randomUUID(), { altEn: 'x' })).rejects.toMatchObject({ status: 404 });
	});
});
