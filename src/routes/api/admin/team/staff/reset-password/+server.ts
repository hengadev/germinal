import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { hashPassword } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/admin/team/staff/reset-password - Reset staff password
export const POST: RequestHandler = async ({ locals, request }) => {
    requireStaff(locals);

    try {
        const formData = await request.formData();
        const staffId = formData.get('staffId');
        const newPassword = formData.get('newPassword');

        if (!staffId || typeof staffId !== 'string') {
            return json({ error: 'Staff ID is required' }, { status: 400 });
        }

        if (!newPassword || typeof newPassword !== 'string') {
            return json({ error: 'New password is required' }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        // Check if user exists and is staff
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, staffId))
            .limit(1);

        if (!user) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        if (user.role !== 'staff') {
            return json({ error: 'User is not a staff member' }, { status: 400 });
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        // Update password
        await db
            .update(users)
            .set({
                passwordHash,
                updatedAt: new Date(),
            })
            .where(eq(users.id, staffId));

        return json({ success: `Password reset for ${user.email}` });
    } catch (error) {
        console.error('Failed to reset password:', error);
        return json({ error: 'Failed to reset password' }, { status: 500 });
    }
};
