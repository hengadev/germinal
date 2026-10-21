// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The database finds no user for the unknown email, and the one known user
// for the other; argon2 is spied on to see the verification happen.
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
vi.mock('$lib/server/session', () => ({ createSession: vi.fn() }));

// argon2 itself is faked: every verification is observable and fails.
const argonVerify = vi.hoisted(() => vi.fn(async () => false));
vi.mock('argon2', () => ({
	hash: vi.fn(async () => '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy'),
	verify: argonVerify,
}));

import { actions } from '../../../src/routes/(auth)/login/+page.server';

function login(email: string, password: string) {
	const form = new FormData();
	form.set('email', email);
	form.set('password', password);
	return actions.default({
		request: new Request('http://admin.localhost/login', { method: 'POST', body: form }),
		cookies: { set: vi.fn() },
		locals: { isAdminDomain: true, isStaffDomain: false },
		url: new URL('http://admin.localhost/login'),
		getClientAddress: () => '198.51.100.9',
	} as any);
}

describe('login with an unknown email', () => {
	beforeEach(() => argonVerify.mockClear());

	it('performs a password verification and answers exactly like a wrong password', async () => {
		knownUser.value = null;
		const unknown = await login('nobody@example.com', 'whatever-123');
		expect(argonVerify).toHaveBeenCalledOnce();

		argonVerify.mockClear();
		knownUser.value = {
			id: 'u1',
			email: 'admin@example.com',
			role: 'admin',
			passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$real$real',
		};
		const wrong = await login('admin@example.com', 'whatever-123');
		expect(argonVerify).toHaveBeenCalledOnce();

		expect(unknown).toEqual(wrong);
	});
});
