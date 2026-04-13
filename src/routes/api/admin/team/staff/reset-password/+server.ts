import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isAppError } from '$lib/server/errors';
import { generateResetToken, getResetExpiration } from '$lib/server/utils/password';

// POST /api/admin/team/staff/reset-password - Send password reset email to staff
export const POST: RequestHandler = async ({ locals, request }) => {
    requireStaff(locals);

    try {
        const body = await request.json();
        const staffId = body.staffId;

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

        // Generate reset token
        const resetToken = generateResetToken();
        const resetExpires = getResetExpiration(24); // 24 hours

        // Update user with reset token
        await db
            .update(users)
            .set({
                passwordResetToken: resetToken,
                passwordResetExpires: resetExpires,
                updatedAt: new Date(),
            })
            .where(eq(users.id, staffId));

        // Send password reset email (non-blocking)
        const { sendStaffPasswordResetEmail } = await import('$lib/server/services/email');
        sendStaffPasswordResetEmail({
            email: user.email,
            resetToken,
        }).catch(err => {
            console.error('Failed to send staff password reset email:', err);
            // Don't fail the request if email fails
        });

        return json({ success: `Email de réinitialisation envoyé à ${user.email}` });
    } catch (error) {
        console.error('Failed to send password reset:', error);
        return json({ error: isAppError(error) ? error.message : 'Failed to send password reset' }, { status: 500 });
    }
};
