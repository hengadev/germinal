import * as argon2 from 'argon2';
import { env } from './env';

/**
 * Hash a plain text password using Argon2
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
	return await argon2.hash(password);
}

/**
 * Verify a plain text password against a hash
 * @param hash - Stored password hash
 * @param password - Plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, password);
	} catch (error) {
		return false;
	}
}

/**
 * Mock password verification for development/demo mode.
 * Returns the matched role or null if credentials don't match.
 */
export async function verifyPasswordMock(email: string, password: string): Promise<'admin' | 'staff' | null> {
	if (env.MOCK_ADMIN_EMAIL && email === env.MOCK_ADMIN_EMAIL && password === env.MOCK_ADMIN_PASSWORD) {
		return 'admin';
	}
	if (env.MOCK_STAFF_EMAIL && email === env.MOCK_STAFF_EMAIL && password === env.MOCK_STAFF_PASSWORD) {
		return 'staff';
	}
	return null;
}

/**
 * Get mock credential pairs for display on the login page.
 */
export function getMockCredentials(): { role: string; email: string }[] {
	const pairs: { role: string; email: string }[] = [];
	if (env.MOCK_ADMIN_EMAIL) pairs.push({ role: 'admin', email: env.MOCK_ADMIN_EMAIL });
	if (env.MOCK_STAFF_EMAIL) pairs.push({ role: 'staff', email: env.MOCK_STAFF_EMAIL });
	return pairs;
}
