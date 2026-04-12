import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/admin/team/staff/deactivate - Deactivate a staff member
export const POST: RequestHandler = async ({ locals, request }) => {
    requireStaff(locals);

    try {
        const formData = await request.formData();
        const staffId = formData.get('staffId');

        if (!staffId || typeof staffId !== 'string') {
            return json({ error: 'Staff ID is required' }, { status: 400 });
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

        // Change role to 'user' to deactivate staff access
        await db
            .update(users)
            .set({
                role: 'user',
                updatedAt: new Date(),
            })
            .where(eq(users.id, staffId));

        return json({ success: `Staff member ${user.email} has been deactivated` });
    } catch (error) {
        console.error('Failed to deactivate staff:', error);
        return json({ error: error instanceof Error ? error.message : 'Failed to deactivate staff' }, { status: 500 });
    }
};
