import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { hashPassword } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isAppError } from '$lib/server/errors';

// GET /api/admin/team/staff - Get all staff users
export const GET: RequestHandler = async ({ locals }) => {
    requireStaff(locals);

    try {
        const staff = await db
            .select({
                id: users.id,
                email: users.email,
                role: users.role,
                createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.role, 'staff'));

        return json(staff);
    } catch (error) {
        console.error('Failed to load staff:', error);
        return json({ error: isAppError(error) ? error.message : 'Failed to load staff' }, { status: 500 });
    }
};

// POST /api/admin/team/staff - Create a new staff user
export const POST: RequestHandler = async ({ locals, request }) => {
    requireStaff(locals);

    try {
        const formData = await request.formData();
        const email = formData.get('email');
        const password = formData.get('password');

        if (!email || typeof email !== 'string') {
            return json({ error: 'Email is required' }, { status: 400 });
        }

        if (!password || typeof password !== 'string') {
            return json({ error: 'Password is required' }, { status: 400 });
        }

        if (password.length < 8) {
            return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        if (email.includes('germinal.com')) {
            return json({ error: 'Email cannot contain "germinal.com"' }, { status: 400 });
        }

        // Check if user already exists
        const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (existing) {
            return json({ error: 'User with this email already exists' }, { status: 400 });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create staff user
        const [newUser] = await db
            .insert(users)
            .values({
                email,
                passwordHash,
                role: 'staff',
            })
            .returning();

        return json({
            success: `Staff account created for ${email}`,
            user: {
                id: newUser.id,
                email: newUser.email,
                role: newUser.role,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to create staff:', error);
        return json({ error: isAppError(error) ? error.message : 'Failed to create staff' }, { status: 500 });
    }
};
