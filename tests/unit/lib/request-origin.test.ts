// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isCrossOriginUnsafeRequest } from '../../../src/lib/server/request-origin';

const ADMIN = 'https://admin.germinalstudio.co';
const SIBLING = 'https://evil.germinalstudio.co';

function check(method: string, path: string, headers: Record<string, string> = {}) {
	const url = new URL(path, ADMIN);
	return isCrossOriginUnsafeRequest(new Request(url, { method, headers }), url);
}

describe('isCrossOriginUnsafeRequest', () => {
	it('rejects a cross-origin bodyless POST, sibling subdomains included', () => {
		expect(check('POST', '/api/admin/reservations/r1/cancel', { origin: SIBLING })).toBe(true);
		expect(check('POST', '/logout', { origin: 'https://attacker.example' })).toBe(true);
	});

	it('rejects a cross-origin DELETE, PUT and PATCH', () => {
		for (const method of ['DELETE', 'PUT', 'PATCH']) {
			expect(check(method, '/api/admin/talents/t1', { origin: SIBLING }), method).toBe(true);
		}
	});

	it('rejects on Sec-Fetch-Site alone when the browser sends no Origin', () => {
		expect(check('POST', '/logout', { 'sec-fetch-site': 'same-site' })).toBe(true);
		expect(check('POST', '/logout', { 'sec-fetch-site': 'cross-site' })).toBe(true);
	});

	it('rejects an opaque "null" Origin', () => {
		expect(check('POST', '/logout', { origin: 'null' })).toBe(true);
	});

	it('accepts a same-origin POST', () => {
		expect(check('POST', '/api/admin/reservations/r1/cancel', { origin: ADMIN })).toBe(false);
		expect(
			check('POST', '/logout', { origin: ADMIN, 'sec-fetch-site': 'same-origin' })
		).toBe(false);
		expect(check('POST', '/logout', { 'sec-fetch-site': 'none' })).toBe(false);
	});

	it('accepts a request with neither Origin nor Sec-Fetch-Site (non-browser caller)', () => {
		expect(check('POST', '/api/admin/reservations/r1/cancel')).toBe(false);
	});

	it('accepts the Stripe webhook from anywhere', () => {
		expect(
			check('POST', '/api/webhooks/stripe', { origin: 'https://stripe.com', 'sec-fetch-site': 'cross-site' })
		).toBe(false);
	});

	it('never checks GET or HEAD', () => {
		expect(check('GET', '/admin', { origin: SIBLING, 'sec-fetch-site': 'cross-site' })).toBe(false);
		expect(check('HEAD', '/admin', { origin: SIBLING, 'sec-fetch-site': 'cross-site' })).toBe(false);
	});
});

describe('server hook', () => {
	it('answers 403 to a cross-origin POST to the Admin Reservation cancel endpoint before the handler runs', async () => {
		vi.doMock('$lib/server/db', () => ({ runMigrations: () => new Promise(() => {}) }));
		vi.doMock('$lib/server/jobs/scheduler', () => ({ initJobScheduler: vi.fn(), stopJobScheduler: vi.fn() }));
		vi.doMock('$lib/server/monitoring', () => ({ initMonitoring: vi.fn(), captureException: vi.fn() }));
		const validateSession = vi.fn();
		vi.doMock('$lib/server/session', () => ({ validateSession, deleteExpiredSessions: vi.fn() }));
		const { handle } = await import('../../../src/hooks.server');

		const url = new URL('/api/admin/reservations/r1/cancel', ADMIN);
		const resolve = vi.fn();
		const response = await handle({
			event: {
				url,
				request: new Request(url, { method: 'POST', headers: { origin: SIBLING } }),
				locals: {},
				cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
			} as any,
			resolve,
		});

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
		expect(validateSession).not.toHaveBeenCalled();
	});
});
