import { fail, redirect, type Actions } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, hashPassword, verifyPasswordMock } from '$lib/server/auth';
import { env } from '$lib/server/env';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// This is already protected by the admin layout
	return {
		user: locals.user
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword');
		const newPassword = formData.get('newPassword');
		const confirmPassword = formData.get('confirmPassword');

		// Validate input
		if (!currentPassword || typeof currentPassword !== 'string') {
			return fail(400, { error: 'Current password is required' });
		}

		if (!newPassword || typeof newPassword !== 'string') {
			return fail(400, { error: 'New password is required' });
		}

		if (!confirmPassword || typeof confirmPassword !== 'string') {
			return fail(400, { error: 'Please confirm your new password' });
		}

		// Check passwords match
		if (newPassword !== confirmPassword) {
			return fail(400, { error: 'New passwords do not match' });
		}

		// Validate password strength (min 8 characters)
		if (newPassword.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters long' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode: verify current password and update mock user
			const validPassword = await verifyPasswordMock(locals.user.email, currentPassword);

			if (!validPassword) {
				return fail(400, { error: 'Current password is incorrect' });
			}

			// In mock mode, we can't actually change the password
			// Just return success for demonstration
			return { success: true, message: 'Password updated successfully (mock mode - not persisted)' };
		}

		// Database mode: verify current password and update
		const [user] = await db.select().from(users).where(eq(users.id, locals.user.id)).limit(1);

		if (!user) {
			return fail(404, { error: 'User not found' });
		}

		// Verify current password
		const validPassword = await verifyPassword(user.passwordHash, currentPassword);

		if (!validPassword) {
			return fail(400, { error: 'Current password is incorrect' });
		}

		// Hash new password
		const newPasswordHash = await hashPassword(newPassword);

		// Update password in database
		await db
			.update(users)
			.set({
				passwordHash: newPasswordHash,
				updatedAt: new Date()
			})
			.where(eq(users.id, locals.user.id));

		return { success: true, message: 'Password updated successfully' };
	}
};
