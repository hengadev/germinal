import crypto from 'crypto';

/**
 * Generates a cryptographically secure access token
 * 32 bytes = 64 hex characters = 256 bits of entropy
 * Unguessable via brute force
 */
export function generateAccessToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a short alphanumeric code for phone support
 * Format: GERM-ABCD-1234
 */
export function generateShortCode(): string {
	const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
	const part2 = Math.floor(1000 + Math.random() * 9000);
	return `GERM-${part1}-${part2}`;
}
