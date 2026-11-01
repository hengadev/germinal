import { describe, it, expect } from 'vitest';
import {
	normaliseEmail,
	guestKeyFromEmail,
	emailFromGuestKey
} from '../../../src/lib/utils/guest-email';

describe('normaliseEmail', () => {
	it('trims and lower-cases', () => {
		expect(normaliseEmail('  Alice@Example.COM ')).toBe('alice@example.com');
	});

	it('returns null for missing or blank emails', () => {
		expect(normaliseEmail(null)).toBeNull();
		expect(normaliseEmail(undefined)).toBeNull();
		expect(normaliseEmail('   ')).toBeNull();
		expect(normaliseEmail('')).toBeNull();
	});
});

describe('guestKeyFromEmail', () => {
	it('is URL-safe and never contains the raw email', () => {
		const key = guestKeyFromEmail('Alice@Example.com');
		expect(key).not.toBeNull();
		expect(key!).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(key!).not.toContain('alice');
		expect(key!).not.toContain('@');
	});

	it('is stable regardless of case and surrounding spaces', () => {
		expect(guestKeyFromEmail('  a@b.fr ')).toBe(guestKeyFromEmail('A@B.FR'));
	});

	it('returns null for missing emails', () => {
		expect(guestKeyFromEmail(null)).toBeNull();
		expect(guestKeyFromEmail(' ')).toBeNull();
	});
});

describe('emailFromGuestKey', () => {
	it('round-trips a normalised email', () => {
		expect(emailFromGuestKey(guestKeyFromEmail('Guest@Example.com')!)).toBe('guest@example.com');
	});

	it('returns null for invalid keys', () => {
		expect(emailFromGuestKey('not base64!!')).toBeNull();
		expect(emailFromGuestKey('!!!')).toBeNull();
	});
});
