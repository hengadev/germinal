// @vitest-environment node
//
// Issue 025 — unpublished Talents and their media are hidden from anyone
// but the Admin (404, not 403), mirroring how Event access gates Events.
// Real test database; the route handlers are called directly.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { events, media, talents } from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false },
	isDevelopment: () => true,
}));
vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));
vi.mock('../../src/lib/mock-data', async (importOriginal) => ({
	...((await importOriginal()) as object),
	USE_MOCK_DATA: false,
}));

const ANONYMOUS = { user: null };
const ADMIN = { user: { id: 'admin-id', email: 'admin@example.com', role: 'admin' } };
const STAFF = { user: { id: 'staff-id', email: 'staff@example.com', role: 'staff' } };

type Routes = {
	list: typeof import('../../src/routes/api/talents/+server');
	detail: typeof import('../../src/routes/api/talents/[id]/+server');
	media: typeof import('../../src/routes/api/media/[id]/+server');
	page: typeof import('../../src/routes/(public)/talents/[id]/+page.server');
	cache: typeof import('../../src/lib/server/cache');
};
let routes: Routes;

beforeAll(async () => {
	routes = {
		list: await import('../../src/routes/api/talents/+server'),
		detail: await import('../../src/routes/api/talents/[id]/+server'),
		media: await import('../../src/routes/api/media/[id]/+server'),
		page: await import('../../src/routes/(public)/talents/[id]/+page.server'),
		cache: await import('../../src/lib/server/cache'),
	};
});

afterAll(async () => {
	await closeTestDatabase();
});

let published: string;
let unpublished: string;
const mediaIds: Record<string, string> = {};

beforeEach(async () => {
	await setupTestDatabase();
	routes.cache.cache.clear();

	const talent = (name: string, isPublished: boolean) => ({
		firstName: name,
		lastName: 'Test',
		roleEn: 'Chef',
		roleFr: 'Cheffe',
		bioEn: 'Bio',
		bioFr: 'Bio',
		published: isPublished,
	});
	[{ id: published }, { id: unpublished }] = await testDb
		.insert(talents)
		.values([talent('Shown', true), talent('Hidden', false)])
		.returning({ id: talents.id });

	const event = (title: string, visibility: 'draft' | 'public') => ({
		titleEn: title,
		titleFr: title,
		descriptionEn: 'x',
		descriptionFr: 'x',
		startDate: new Date('2099-01-01'),
		endDate: new Date('2099-01-02'),
		locationEn: 'Paris',
		locationFr: 'Paris',
		visibility,
	});
	const [{ id: publicEvent }, { id: draftEvent }] = await testDb
		.insert(events)
		.values([event('Public', 'public'), event('Draft', 'draft')])
		.returning({ id: events.id });

	const item = (owner: { talentId?: string; eventId?: string }) => ({
		type: 'image' as const,
		url: 'https://media.test/x.webp',
		s3Key: 'test/x.webp',
		mimeType: 'image/webp',
		size: 1,
		...owner,
	});
	const rows = await testDb
		.insert(media)
		.values([
			item({ talentId: published }),
			item({ talentId: unpublished }),
			item({ eventId: publicEvent }),
			item({ eventId: draftEvent }),
			item({}),
		])
		.returning({ id: media.id });
	['publishedTalent', 'unpublishedTalent', 'publicEvent', 'draftEvent', 'unattached'].forEach(
		(key, i) => (mediaIds[key] = rows[i].id)
	);
});

async function status(promise: unknown): Promise<number> {
	try {
		const result = await promise;
		return result instanceof Response ? result.status : 200;
	} catch (e) {
		return (e as { status?: number }).status ?? 500;
	}
}

function listTalents(locals: object, query = '') {
	const headers: Record<string, string> = {};
	return Promise.resolve(
		routes.list.GET({
			url: new URL(`http://localhost/api/talents${query}`),
			locals,
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
		} as any)
	).then(async (response: Response) => ({
			names: ((await response.json()).data as { firstName: string }[]).map((t) => t.firstName).sort(),
			cacheControl: headers['Cache-Control'],
		}));
}

describe('Talent list API', () => {
	it.each([
		['anonymous', ANONYMOUS],
		['Staff', STAFF],
	])('%s `?published=false` gets only published Talents', async (_label, locals) => {
		expect((await listTalents(locals, '?published=false')).names).toEqual(['Shown']);
	});

	it('the Admin can list unpublished Talents', async () => {
		expect((await listTalents(ADMIN, '?published=false')).names).toEqual(['Hidden', 'Shown']);
	});

	it('cached listings don’t leak unpublished Talents across viewers', async () => {
		const admin = await listTalents(ADMIN, '?published=false');
		const anonymous = await listTalents(ANONYMOUS, '?published=false');

		expect(admin.names).toContain('Hidden');
		expect(admin.cacheControl).toBe('private, no-store');
		expect(anonymous.names).toEqual(['Shown']);
		expect(anonymous.cacheControl).toMatch(/^public/);
	});
});

describe('Talent detail API and public page', () => {
	it('an unpublished Talent is 404 for anonymous callers and visible to the Admin', async () => {
		const detail = (id: string, locals: object) => routes.detail.GET({ params: { id }, locals } as any);
		const page = (id: string, locals: object) => routes.page.load({ params: { id }, locals } as any);

		expect(await status(detail(unpublished, ANONYMOUS))).toBe(404);
		expect(await status(page(unpublished, ANONYMOUS))).toBe(404);
		expect(await status(detail(unpublished, STAFF))).toBe(404);
		expect(await status(detail(unpublished, ADMIN))).toBe(200);
		expect(await status(page(unpublished, ADMIN))).toBe(200);

		expect(await status(detail(published, ANONYMOUS))).toBe(200);
		expect(await status(page(published, ANONYMOUS))).toBe(200);
	});
});

describe('media detail API', () => {
	const get = (key: string, locals: object) =>
		status(routes.media.GET({ params: { id: mediaIds[key] }, locals } as any));

	it.each(['unpublishedTalent', 'draftEvent', 'unattached'])(
		'%s media is 404 for anonymous callers and visible to the Admin',
		async (key) => {
			expect(await get(key, ANONYMOUS)).toBe(404);
			expect(await get(key, ADMIN)).toBe(200);
		}
	);

	it.each(['publishedTalent', 'publicEvent'])('%s media is readable by anyone', async (key) => {
		expect(await get(key, ANONYMOUS)).toBe(200);
	});
});
