import { describe, expect, it } from 'vitest';
import { parseTicketToken } from '$lib/staff/ticket-qr';

describe('parseTicketToken', () => {
	it('extracts the token from an absolute ticket URL', () => {
		expect(parseTicketToken('https://germinal.example/tickets/abc-123')).toBe('abc-123');
	});

	it('extracts the token from a bare path', () => {
		expect(parseTicketToken('/tickets/abc-123')).toBe('abc-123');
	});

	it('accepts a trailing slash', () => {
		expect(parseTicketToken('/tickets/abc-123/')).toBe('abc-123');
	});

	it('ignores a query string', () => {
		expect(parseTicketToken('https://germinal.example/tickets/abc-123?x=1')).toBe('abc-123');
	});

	it('decodes percent-encoded tokens', () => {
		expect(parseTicketToken('/tickets/a%2Fb')).toBe('a/b');
	});

	it('returns null for non-ticket paths', () => {
		expect(parseTicketToken('https://germinal.example/events/abc-123')).toBeNull();
		expect(parseTicketToken('/admin/login')).toBeNull();
		expect(parseTicketToken('/tickets/')).toBeNull();
	});

	it('returns null for non-URL content', () => {
		expect(parseTicketToken('hello world')).toBeNull();
		expect(parseTicketToken('')).toBeNull();
		expect(parseTicketToken('1234567890')).toBeNull();
	});
});
