import { env } from '$lib/server/env';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return empty array
		return {
			emails: [],
			filters: {
				status: url.searchParams.get('status') || 'all',
				type: url.searchParams.get('type') || 'all'
			}
		};
	}

	// Database mode - use actual database
	const { db } = await import('$lib/server/db');
	const { emailQueue } = await import('$lib/server/db/schema');
	const { desc, eq, and, isNull } = await import('drizzle-orm');

	// Get filter parameters
	const statusFilter = url.searchParams.get('status') || 'all';
	const typeFilter = url.searchParams.get('type') || 'all';

	// Build query conditions
	const conditions = [];

	if (statusFilter !== 'all') {
		conditions.push(eq(emailQueue.status, statusFilter));
	}

	if (typeFilter !== 'all') {
		conditions.push(eq(emailQueue.type, typeFilter));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const allEmails = await db.query.emailQueue.findMany({
		where: whereClause,
		orderBy: [desc(emailQueue.createdAt)],
		limit: 100, // Limit to most recent 100 emails
	});

	return {
		emails: allEmails.map(e => ({
			id: e.id,
			type: e.type,
			recipient: e.recipient,
			subject: e.subject,
			textBody: e.textBody?.substring(0, 200) + '...',
			htmlBody: e.htmlBody?.substring(0, 200) + '...',
			status: e.status,
			attempts: e.attempts,
			maxAttempts: e.maxAttempts,
			lastError: e.lastError,
			createdAt: e.createdAt.toISOString(),
			lastAttemptAt: e.lastAttemptAt?.toISOString(),
			sentAt: e.sentAt?.toISOString(),
			metadata: e.metadata
		})),
		filters: {
			status: statusFilter,
			type: typeFilter
		}
	};
};

export const actions: Actions = {
	retry: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Email queued for retry (mock)' };
		}

		const formData = await request.formData();
		const emailId = formData.get('emailId') as string;

		if (!emailId) {
			return fail(400, { error: 'Email ID is required' });
		}

		try {
			const { db } = await import('$lib/server/db');
			const { emailQueue } = await import('$lib/server/db/schema');
			const { eq } = await import('drizzle-orm');

			// Reset email to pending status
			await db.update(emailQueue)
				.set({
					status: 'pending',
					attempts: 0,
					lastError: null,
					lastAttemptAt: null
				})
				.where(eq(emailQueue.id, emailId));

			return { success: true, message: 'Email queued for retry' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to retry email' });
		}
	},

	delete: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Email deleted (mock)' };
		}

		const formData = await request.formData();
		const emailId = formData.get('emailId') as string;

		if (!emailId) {
			return fail(400, { error: 'Email ID is required' });
		}

		try {
			const { db } = await import('$lib/server/db');
			const { emailQueue } = await import('$lib/server/db/schema');
			const { eq } = await import('drizzle-orm');

			await db.delete(emailQueue)
				.where(eq(emailQueue.id, emailId));

			return { success: true, message: 'Email deleted' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete email' });
		}
	},

	deleteOld: async () => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Old emails deleted (mock)' };
		}

		try {
			const { db } = await import('$lib/server/db');
			const { emailQueue } = await import('$lib/server/db/schema');
			const { and, eq, lt } = await import('drizzle-orm');

			// Delete emails older than 30 days that were successfully sent
			const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const result = await db.delete(emailQueue)
				.where(and(
					eq(emailQueue.status, 'sent'),
					lt(emailQueue.sentAt, thirtyDaysAgo)
				));

			return { success: true, message: 'Old sent emails deleted' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete old emails' });
		}
	},
};
