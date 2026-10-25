import { describe, it, expect } from 'vitest';
import type { Breadcrumb, ErrorEvent, Event } from '@sentry/node';
import { redactUrl } from '../../../src/lib/utils/redaction';
import { scrubBreadcrumb, scrubEvent } from '../../../src/lib/server/sentry-scrub';

describe('redactUrl', () => {
	it.each([
		['https://germinalstudio.co/tickets/abc123def', 'https://germinalstudio.co/tickets/[token]'],
		['https://germinalstudio.co/tickets/abc123def/qr', 'https://germinalstudio.co/tickets/[token]/qr'],
		['https://admin.germinalstudio.co/admin/reset-password/xyz', 'https://admin.germinalstudio.co/admin/reset-password/[token]'],
		['https://staff.germinalstudio.co/staff/reset-password/xyz', 'https://staff.germinalstudio.co/staff/reset-password/[token]'],
		['https://germinalstudio.co/api/reservations/xyz/cancel', 'https://germinalstudio.co/api/reservations/[token]/cancel'],
	])('replaces the bearer token in %s', (input, expected) => {
		expect(redactUrl(input)).toBe(expected);
	});

	it('drops the query string and fragment', () => {
		expect(redactUrl('https://germinalstudio.co/api/promo-codes/validate?code=SECRET#x')).toBe(
			'https://germinalstudio.co/api/promo-codes/validate'
		);
	});

	it('handles a bare path', () => {
		expect(redactUrl('/tickets/abc?x=1')).toBe('/tickets/[token]');
	});

	it('leaves other paths alone', () => {
		expect(redactUrl('https://germinalstudio.co/events/42')).toBe('https://germinalstudio.co/events/42');
	});
});

describe('scrubEvent', () => {
	it('redacts every URL and drops personal data', () => {
		const event = {
			type: undefined,
			transaction: 'GET /tickets/abc123',
			request: {
				url: 'https://germinalstudio.co/tickets/abc123?lang=en',
				query_string: 'lang=en',
				cookies: { session: 's' },
				headers: { cookie: 'session=s' },
				data: { email: 'a@b.c' },
			},
			user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
			extra: { url: 'https://germinalstudio.co/tickets/abc123', method: 'GET' },
			breadcrumbs: [{ category: 'http', data: { url: 'https://germinalstudio.co/tickets/abc123' } }],
		} as unknown as ErrorEvent;

		const scrubbed = scrubEvent(event);

		expect(scrubbed.transaction).toBe('GET /tickets/[token]');
		expect(scrubbed.request).toEqual({ url: 'https://germinalstudio.co/tickets/[token]' });
		expect(scrubbed.user).toEqual({ id: 'u1' });
		expect(scrubbed.extra).toEqual({ url: 'https://germinalstudio.co/tickets/[token]', method: 'GET' });
		expect(scrubbed.breadcrumbs?.[0].data?.url).toBe('https://germinalstudio.co/tickets/[token]');
		expect(JSON.stringify(scrubbed)).not.toContain('abc123');
	});
});

describe('scrubEvent on a performance trace', () => {
	it('redacts span descriptions and data, and the trace context', () => {
		const event = {
			type: 'transaction',
			transaction: 'GET /api/reservations/res_secret',
			contexts: { trace: { trace_id: 't', span_id: 's', data: { 'http.url': 'https://germinalstudio.co/api/reservations/res_secret?x=1' } } },
			spans: [
				{
					span_id: 'a',
					trace_id: 't',
					start_timestamp: 0,
					description: 'GET https://germinalstudio.co/tickets/tk_secret',
					data: { 'url.full': 'https://germinalstudio.co/tickets/tk_secret', 'http.query': '?code=PROMO' },
				},
			],
		} as unknown as Event;

		const scrubbed = scrubEvent(event);

		expect(JSON.stringify(scrubbed)).not.toMatch(/res_secret|tk_secret|PROMO/);
		expect(scrubbed.spans?.[0].description).toBe('GET https://germinalstudio.co/tickets/[token]');
	});
});

describe('scrubBreadcrumb', () => {
	it('redacts URLs in breadcrumb data and message', () => {
		const crumb: Breadcrumb = {
			category: 'navigation',
			message: 'GET https://germinalstudio.co/staff/reset-password/xyz',
			data: { url: 'https://germinalstudio.co/staff/reset-password/xyz', from: '/tickets/abc', to: '/tickets/def' },
		};

		const scrubbed = scrubBreadcrumb(crumb);

		expect(JSON.stringify(scrubbed)).not.toMatch(/xyz|abc|def/);
	});
});
