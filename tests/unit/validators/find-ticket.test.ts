import { describe, it, expect } from 'vitest';
import { findTicketSchema } from '../../../src/lib/server/validators/find-ticket';

describe('findTicketSchema', () => {
	it('accepts a valid email with no honeypot content', () => {
		const result = findTicketSchema.safeParse({ email: 'guest@example.com' });
		expect(result.success).toBe(true);
	});

	it('lowercases the email', () => {
		const result = findTicketSchema.safeParse({ email: 'Guest@Example.com' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBe('guest@example.com');
		}
	});

	it('rejects an invalid email', () => {
		const result = findTicketSchema.safeParse({ email: 'not-an-email' });
		expect(result.success).toBe(false);
	});

	it('rejects a missing email', () => {
		const result = findTicketSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('accepts an empty honeypot field', () => {
		const result = findTicketSchema.safeParse({ email: 'guest@example.com', honeypot: '' });
		expect(result.success).toBe(true);
	});

	it('rejects a filled-in honeypot field (bot submission)', () => {
		const result = findTicketSchema.safeParse({
			email: 'guest@example.com',
			honeypot: 'http://spam.example.com',
		});
		expect(result.success).toBe(false);
	});
});
