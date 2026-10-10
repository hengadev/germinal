import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isAppError } from '$lib/server/errors';

// POST /api/admin/team/admin/deactivate - Deactivate an admin account
export const POST: RequestHandler = async ({ locals, request }) => {
    requireAdmin(locals);

    try {
        const formData = await request.formData();
        const adminId = formData.get('adminId');

        if (!adminId || typeof adminId !== 'string') {
            return json({ error: 'Admin ID is required' }, { status: 400 });
        }

        // SAFETY: an admin cannot deactivate their own account (defense in depth —
        // the UI also disables this action, but this is the destructive path so we
        // guard it here too, in case the request bypasses the UI entirely).
        if (locals.user && adminId === locals.user.id) {
            return json({ error: 'You cannot deactivate your own account' }, { status: 400 });
        }

        // Check if user exists and is admin
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, adminId))
            .limit(1);

        if (!user) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        if (user.role !== 'admin') {
            return json({ error: 'User is not an admin' }, { status: 400 });
        }

        // Change role to 'user' to deactivate admin access
        await db
            .update(users)
            .set({
                role: 'user',
                deactivatedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, adminId));

        return json({ success: `Admin ${user.email} has been deactivated` });
    } catch (error) {
        console.error('Failed to deactivate admin:', error);
        return json({ error: isAppError(error) ? error.message : 'Failed to deactivate admin' }, { status: 500 });
    }
};
