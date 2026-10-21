import { db } from './db';
import { sessions, users } from './db/schema';
import { eq, and, gt, lt, ne } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { env } from './env';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Mock session storage for development
const mockSessions = new Map<string, { user: any; expiresAt: number }>();

/**
 * Generate a cryptographically secure random session token
 */
function generateSessionId(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * The login session store keeps only the SHA-256 hash of each token: the
 * browser's cookie carries the token, the `sessions.id` column its hash, so
 * a leaked backup or database dump yields no working login. Every lookup
 * and deletion hashes the token first.
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session for a user
 * @param userId - The user's UUID (or email in mock mode)
 * @param role - Role to assign in mock mode ('admin' | 'staff'), defaults to 'admin'
 * @returns Session object with id and expiresAt
 */
export async function createSession(userId: string, role: 'admin' | 'staff' = 'admin') {
	if (env.USE_MOCK_DATA) {
		// Mock mode: create in-memory session
		const sessionId = generateSessionId();
		const expiresAt = Date.now() + SESSION_DURATION;

		const mockUser = {
			id: 'mock-user-id',
			email: userId,
			role,
			createdAt: new Date()
		};

		mockSessions.set(sessionId, { user: mockUser, expiresAt });

		return { id: sessionId, expiresAt: new Date(expiresAt) };
	}

	// Database mode: create session in database
	const sessionId = generateSessionId();
	const expiresAt = new Date(Date.now() + SESSION_DURATION);

	await db.insert(sessions).values({
		id: hashSessionToken(sessionId),
		userId,
		expiresAt
	});

	// The raw token goes to the browser's cookie and is never stored.
	return { id: sessionId, expiresAt };
}

/**
 * Validate a session and return the associated user
 * @param sessionId - The session ID from cookie
 * @returns User object if session is valid, null otherwise
 */
export async function validateSession(sessionId: string) {
	if (env.USE_MOCK_DATA) {
		// Mock mode: validate in-memory session
		const sessionData = mockSessions.get(sessionId);

		if (!sessionData) {
			return null;
		}

		// Check if session is expired
		if (Date.now() > sessionData.expiresAt) {
			mockSessions.delete(sessionId);
			return null;
		}

		return sessionData.user;
	}

	// Database mode: validate session in database
	const [result] = await db
		.select({
			user: users,
			session: sessions
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(and(eq(sessions.id, hashSessionToken(sessionId)), gt(sessions.expiresAt, new Date())))
		.limit(1);

	if (!result) {
		return null;
	}

	return {
		id: result.user.id,
		email: result.user.email,
		role: result.user.role,
		createdAt: result.user.createdAt
	};
}

/**
 * Delete a session (logout)
 * @param sessionId - The session ID to delete
 */
export async function deleteSession(sessionId: string): Promise<void> {
	if (env.USE_MOCK_DATA) {
		// Mock mode: delete from memory
		mockSessions.delete(sessionId);
		return;
	}

	// Database mode: delete from database
	await db.delete(sessions).where(eq(sessions.id, hashSessionToken(sessionId)));
}

/**
 * Revoke every login session of a user, optionally keeping one (the
 * session making the request, given by its raw token). Used when a
 * password changes (keep the current session), a reset completes or an
 * account is deactivated (revoke all).
 */
export async function revokeUserSessions(userId: string, options: { except?: string } = {}): Promise<void> {
	if (env.USE_MOCK_DATA) {
		// Mock mode keeps its in-memory sessions as they are.
		return;
	}

	const keep = options.except ? hashSessionToken(options.except) : null;
	await db
		.delete(sessions)
		.where(keep ? and(eq(sessions.userId, userId), ne(sessions.id, keep)) : eq(sessions.userId, userId));
}

/**
 * Delete all expired sessions (cleanup job)
 * @returns Number of sessions deleted
 */
export async function deleteExpiredSessions(): Promise<number> {
	if (env.USE_MOCK_DATA) {
		// Mock mode: clean up expired sessions
		const now = Date.now();
		let deletedCount = 0;

		for (const [sessionId, sessionData] of mockSessions.entries()) {
			if (now > sessionData.expiresAt) {
				mockSessions.delete(sessionId);
				deletedCount++;
			}
		}
		return deletedCount;
	}

	// Database mode: delete expired sessions and return count
	// First, get the count of expired sessions (expiresAt < now)
	const expiredSessions = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(lt(sessions.expiresAt, new Date()));

	// Delete them
	if (expiredSessions.length > 0) {
		await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
	}

	return expiredSessions.length;
}
