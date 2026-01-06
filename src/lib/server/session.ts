import { db } from './db';
import { sessions, users } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { env } from './env';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Mock session storage for development
const mockSessions = new Map<string, { user: any; expiresAt: number }>();

/**
 * Generate a cryptographically secure random session ID
 */
function generateSessionId(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Create a new session for a user
 * @param userId - The user's UUID (or email in mock mode)
 * @returns Session object with id and expiresAt
 */
export async function createSession(userId: string) {
	if (env.USE_MOCK_DATA) {
		// Mock mode: create in-memory session
		const sessionId = generateSessionId();
		const expiresAt = Date.now() + SESSION_DURATION;

		const mockUser = {
			id: 'mock-user-id',
			email: userId,
			role: 'admin',
			createdAt: new Date()
		};

		mockSessions.set(sessionId, { user: mockUser, expiresAt });

		return { id: sessionId, expiresAt: new Date(expiresAt) };
	}

	// Database mode: create session in database
	const sessionId = generateSessionId();
	const expiresAt = new Date(Date.now() + SESSION_DURATION);

	const [session] = await db
		.insert(sessions)
		.values({
			id: sessionId,
			userId,
			expiresAt
		})
		.returning();

	return session;
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
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
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
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Delete all expired sessions (cleanup job)
 */
export async function deleteExpiredSessions(): Promise<void> {
	if (env.USE_MOCK_DATA) {
		// Mock mode: clean up expired sessions
		const now = Date.now();
		for (const [sessionId, sessionData] of mockSessions.entries()) {
			if (now > sessionData.expiresAt) {
				mockSessions.delete(sessionId);
			}
		}
		return;
	}

	// Database mode: delete expired sessions
	await db.delete(sessions).where(gt(new Date(), sessions.expiresAt));
}
