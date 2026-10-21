// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The contact action uses the real rate-limit policy module, backed here by
// an in-memory fake of its Redis client — so these tests observe the actual
// Inquiry budget (5 per hour) and reset behaviour, not a stubbed decision.
vi.mock('ioredis', async () => ({
	default: (await import('../helpers/fake-redis')).FakeRedis,
}));

vi.mock('$lib/server/csrf', () => ({
	validateCsrfTokenFromForm: vi.fn(() => true),
}));

const createContactSubmission = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('$lib/server/services/contact', () => ({
	createContactSubmission,
}));

import { FakeRedis } from '../helpers/fake-redis';
import { actions } from '../../../src/routes/(public)/contact/+page.server';

const IP = '198.51.100.23';

function makeEvent() {
	const formData = new FormData();
	formData.set('name', 'Ada Lovelace');
	formData.set('email', 'ada@example.com');
	formData.set('company', '');
	formData.set('inquiryType', 'other');
	formData.set('message', 'Hello, I would like to inquire about a private event.');
	// Honeypot: present but empty, as the real form always submits it.
	formData.set('website', '');

	return {
		request: new Request('http://localhost/contact', { method: 'POST', body: formData }),
		getClientAddress: () => IP,
		locals: { csrfToken: 'token' },
	} as any;
}

function redis(): FakeRedis {
	if (!FakeRedis.instance) throw new Error('rate-limit module not imported yet');
	return FakeRedis.instance;
}

describe('contact action — Inquiry rate-limit policy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		redis().store.clear();
		redis().ttls.clear();
		redis().unavailable = false;
	});

	it('allows 5 inquiries per hour; a successful Inquiry resets no counter', async () => {
		const results = [];
		for (let i = 0; i < 5; i++) {
			results.push(await actions.default(makeEvent()));
		}

		// All five submissions succeed…
		for (const result of results) {
			expect(result).toMatchObject({ success: true });
		}
		expect(createContactSubmission).toHaveBeenCalledTimes(5);

		// …and none of them reset the Inquiry counter: the 6th attempt is
		// denied even though every previous submission was successful, and
		// the 429 says when the client may retry.
		const sixth = await actions.default(makeEvent());
		expect((sixth as any).status).toBe(429);
		expect((sixth as any).data.rateLimited).toBe(true);
		expect((sixth as any).data.error).toMatch(/try again in \d+ minutes/);
	});

	it('answers 503 when the rate limiter is unavailable (fail-closed)', async () => {
		redis().unavailable = true;

		const result = await actions.default(makeEvent());

		expect((result as any).status).toBe(503);
	});
});
