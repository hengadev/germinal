// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// One known user whose password always verifies; the role varies per test.
const knownUser = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => (knownUser.value ? [knownUser.value] : []) }) }),
		}),
	},
}));
vi.mock('$lib/server/env', () => ({ env: { USE_MOCK_DATA: false } }));
vi.mock('$lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed' }),
	resetLoginRateLimit: vi.fn(),
}));
vi.mock('$lib/server/session', () => ({ createSession: vi.fn(async () => ({ id: 's1' })) }));
vi.mock('argon2', () => ({ hash: vi.fn(async () => 'h'), verify: vi.fn(async () => true) }));

import { actions, load } from '../../../src/routes/(auth)/login/+page.server';

const STAFF_DOMAIN = { host: 'staff-staging.germinalstudio.co', locals: { isAdminDomain: false, isStaffDomain: true } };
const ADMIN_DOMAIN = { host: 'admin-staging.germinalstudio.co', locals: { isAdminDomain: true, isStaffDomain: false } };

async function loginAs(role: string, domain: typeof STAFF_DOMAIN) {
	knownUser.value = { id: 'u1', email: 'a@example.com', role, passwordHash: 'h' };
	const form = new FormData();
	form.set('email', 'a@example.com');
	form.set('password', 'secret');
	const url = new URL(`https://${domain.host}/login`);
	try {
		await actions.default({
			request: new Request(url, { method: 'POST', body: form }),
			cookies: { set: vi.fn() },
			locals: { ...domain.locals },
			url,
			getClientAddress: () => '198.51.100.9',
		} as any);
	} catch (thrown: any) {
		return thrown.location;
	}
	throw new Error('login did not redirect');
}

async function visitLoginSignedInAs(role: string, domain: typeof STAFF_DOMAIN) {
	try {
		await load({ locals: { ...domain.locals, user: { role } } } as any);
	} catch (thrown: any) {
		return thrown.location;
	}
	throw new Error('login page did not redirect');
}

describe('where a login lands', () => {
	it('sends everyone to the Staff portal on the staff subdomain, Admins included', async () => {
		expect(await loginAs('admin', STAFF_DOMAIN)).toBe('/staff');
		expect(await loginAs('staff', STAFF_DOMAIN)).toBe('/staff');
		expect(await visitLoginSignedInAs('admin', STAFF_DOMAIN)).toBe('/staff');
	});

	it('sends an Admin to the back office on the admin subdomain', async () => {
		expect(await loginAs('admin', ADMIN_DOMAIN)).toBe('/admin');
		expect(await visitLoginSignedInAs('admin', ADMIN_DOMAIN)).toBe('/admin');
	});
});
