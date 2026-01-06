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
 * Mock password verification for development mode
 * Uses environment variables for configurable credentials
 */
export async function verifyPasswordMock(email: string, password: string): Promise<boolean> {
	// Use environment variables for mock admin credentials
	if (email === env.MOCK_ADMIN_EMAIL && password === env.MOCK_ADMIN_PASSWORD) {
		return true;
	}
	return false;
}

/**
 * Get the mock admin email from environment
 */
export function getMockAdminEmail(): string {
	return env.MOCK_ADMIN_EMAIL;
}
