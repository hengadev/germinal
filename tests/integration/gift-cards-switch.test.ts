// @vitest-environment node
//
// The « Cartes cadeaux » switch in the Admin's settings: off by default,
// the gift card page answers 404, refuses a purchase and is not linked;
// on, it opens. Real test database; the route handlers are called directly.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { getTestDatabase, setupTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

const createGiftCardCheckoutSession = vi.fn();

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
vi.mock('../../src/lib/server/services/stripe', () => ({ createGiftCardCheckoutSession }));
vi.mock('../../src/lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed' }),
}));

const locals = { user: null, isAdminDomain: false, isStaffDomain: false, csrfToken: 'token' };

type Modules = {
	layout: typeof import('../../src/routes/(public)/+layout.server');
	page: typeof import('../../src/routes/(public)/carte-cadeau/+page.server');
	settings: typeof import('../../src/lib/server/services/site-settings');
	cache: typeof import('../../src/lib/server/cache');
};
let m: Modules;

beforeAll(async () => {
	m = {
		layout: await import('../../src/routes/(public)/+layout.server'),
		page: await import('../../src/routes/(public)/carte-cadeau/+page.server'),
		settings: await import('../../src/lib/server/services/site-settings'),
		cache: await import('../../src/lib/server/cache'),
	};
});

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	await setupTestDatabase();
	m.cache.cache.clear();
	createGiftCardCheckoutSession.mockReset();
});

const status = async (run: () => unknown) => {
	try {
		await run();
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
};

const purchase = () =>
	(m.page.actions.default as any)({
		request: new Request('http://localhost/carte-cadeau', { method: 'POST', body: new FormData() }),
		getClientAddress: () => '127.0.0.1',
		locals,
	});

describe('the « Cartes cadeaux » switch', () => {
	it('is off by default: no link, the page is 404 and nothing is sold', async () => {
		expect((await m.layout.load({ locals } as any)).giftCardsOnSale).toBe(false);
		expect(await status(() => (m.page.load as any)({ locals }))).toBe(404);
		expect(await status(purchase)).toBe(404);
		expect(createGiftCardCheckoutSession).not.toHaveBeenCalled();
	});

	it('on, links and opens the page', async () => {
		await m.settings.setGiftCardsEnabled(true);
		expect((await m.layout.load({ locals } as any)).giftCardsOnSale).toBe(true);
		expect(await status(() => (m.page.load as any)({ locals }))).toBe(200);
	});
});
