import { env } from '$lib/server/env';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return empty array
		return {
			waitlistEntries: [],
			sessions: [],
			filters: {
				session: url.searchParams.get('session') || 'all',
				notified: url.searchParams.get('notified') || 'all'
			}
		};
	}

	// Database mode - use actual database
	const { db } = await import('$lib/server/db');
	const { waitlist, eventSessions } = await import('$lib/server/db/schema');
	const { desc, eq, and, isNull } = await import('drizzle-orm');

	// Get filter parameters
	const sessionFilter = url.searchParams.get('session') || 'all';
	const notifiedFilter = url.searchParams.get('notified') || 'all';

	// Build query conditions
	const conditions = [];

	if (sessionFilter !== 'all') {
		conditions.push(eq(waitlist.eventSessionId, sessionFilter));
	}

	if (notifiedFilter === 'notified') {
		conditions.push(eq(waitlist.notified, true));
	} else if (notifiedFilter === 'pending') {
		conditions.push(eq(waitlist.notified, false));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const allEntries = await db.query.waitlist.findMany({
		where: whereClause,
		orderBy: [desc(waitlist.createdAt)],
		with: {
			eventSession: {
				columns: {
					id: true,
					title: true,
					startTime: true,
					eventId: true
				},
				with: {
					event: {
						columns: {
							id: true,
							title: true,
							slug: true
						}
					}
				}
			}
		}
	});

	// Get all sessions for filter dropdown
	const allSessions = await db.query.eventSessions.findMany({
		orderBy: [desc(eventSessions.startTime)],
		columns: {
			id: true,
			title: true,
			startTime: true
		},
		with: {
			event: {
				columns: {
					title: true
				}
			}
		}
	});

	return {
		waitlistEntries: allEntries.map((entry: typeof allEntries[number]) => ({
			id: entry.id,
			name: entry.name,
			email: entry.email,
			phone: entry.phone,
			quantity: entry.quantity,
			notificationPreference: entry.notificationPreference,
			notified: entry.notified,
			notifiedAt: entry.notifiedAt?.toISOString(),
			expiresAt: entry.expiresAt.toISOString(),
			createdAt: entry.createdAt.toISOString(),
			session: {
				id: entry.eventSession.id,
				title: entry.eventSession.title,
				startTime: entry.eventSession.startTime.toISOString(),
				eventTitle: entry.eventSession.event?.titleEn || '',
				eventSlug: entry.eventSession.event?.slug || ''
			}
		})),
		sessions: allSessions.map((s: typeof allSessions[number]) => ({
			id: s.id,
			title: `${s.event?.titleEn || ''}: ${s.title}`,
			startTime: s.startTime.toISOString()
		})),
		filters: {
			session: sessionFilter,
			notified: notifiedFilter
		}
	};
};

export const actions: Actions = {
	notify: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Waitlist entries notified (mock)' };
		}

		const formData = await request.formData();
		const entryIds = formData.getAll('entryIds') as string[];

		if (!entryIds || entryIds.length === 0) {
			return fail(400, { error: 'No entries selected' });
		}

		try {
			const { db } = await import('$lib/server/db');
			const { waitlist } = await import('$lib/server/db/schema');
			const { inArray, eq, and } = await import('drizzle-orm');

			// Get entries with their sessions
			const entries = await db.query.waitlist.findMany({
				where: inArray(waitlist.id, entryIds),
				with: {
					eventSession: {
						with: {
							event: true
						}
					}
				}
			});

			// Group by session and notify
			const notifications: Record<string, number> = {};

			for (const entry of entries) {
				if (entry.notified) continue; // Skip already notified

				// Mark as notified (optimistic locking)
				const [updated] = await db.update(waitlist)
					.set({
						notified: true,
						notifiedAt: new Date()
					})
					.where(and(
						eq(waitlist.id, entry.id),
						eq(waitlist.notified, false)
					))
					.returning();

				if (updated) {
					const sessionId = entry.eventSessionId;
					notifications[sessionId] = (notifications[sessionId] || 0) + 1;

					// Send notification
					const { sendWaitlistNotification } = await import('$lib/server/services/waitlist');
					await sendWaitlistNotification(entry, entry.eventSession);
				}
			}

			const totalNotified = Object.values(notifications).reduce((a, b) => a + b, 0);
			return { success: true, message: `${totalNotified} waitlist entries notified successfully` };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to notify waitlist' });
		}
	},

	markNotified: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Entries marked as notified (mock)' };
		}

		const formData = await request.formData();
		const entryIds = formData.getAll('entryIds') as string[];

		if (!entryIds || entryIds.length === 0) {
			return fail(400, { error: 'No entries selected' });
		}

		try {
			const { db } = await import('$lib/server/db');
			const { waitlist } = await import('$lib/server/db/schema');
			const { inArray } = await import('drizzle-orm');

			await db.update(waitlist)
				.set({
					notified: true,
					notifiedAt: new Date()
				})
				.where(inArray(waitlist.id, entryIds));

			return { success: true, message: 'Entries marked as notified' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to mark entries' });
		}
	},

	delete: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Entries deleted (mock)' };
		}

		const formData = await request.formData();
		const entryIds = formData.getAll('entryIds') as string[];

		if (!entryIds || entryIds.length === 0) {
			return fail(400, { error: 'No entries selected' });
		}

		try {
			const { db } = await import('$lib/server/db');
			const { waitlist } = await import('$lib/server/db/schema');
			const { inArray } = await import('drizzle-orm');

			await db.delete(waitlist)
				.where(inArray(waitlist.id, entryIds));

			return { success: true, message: 'Entries deleted successfully' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete entries' });
		}
	},

	deleteExpired: async () => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Expired entries deleted (mock)' };
		}

		try {
			const { db } = await import('$lib/server/db');
			const { waitlist } = await import('$lib/server/db/schema');
			const { and, lt, eq } = await import('drizzle-orm');

			// Delete expired entries that are already notified
			const result = await db.delete(waitlist)
				.where(and(
					eq(waitlist.notified, true),
					lt(waitlist.expiresAt, new Date())
				));

			return { success: true, message: 'Expired entries deleted' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete expired entries' });
		}
	},
};
