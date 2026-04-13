import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';
import { isAppError } from '$lib/server/errors';

export const load: PageServerLoad = async ({ params }) => {
    const { token } = params;

    // Verify token exists and is not expired
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(users)
        .where(
            and(
                eq(users.passwordResetToken, token),
                gt(users.passwordResetExpires!, new Date())
            )
        )
        .limit(1);

    if (!user) {
        return {
            valid: false,
        };
    }

    return {
        valid: true,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
    };
};

export const actions: Actions = {
    default: async ({ request, params }) => {
        const { token } = params;
        const formData = await request.formData();
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmPassword');

        // Validate passwords
        if (!newPassword || typeof newPassword !== 'string') {
            return { error: 'Le mot de passe est requis' };
        }

        if (newPassword.length < 8) {
            return { error: 'Le mot de passe doit contenir au moins 8 caractères' };
        }

        if (newPassword !== confirmPassword) {
            return { error: 'Les mots de passe ne correspondent pas' };
        }

        // Verify token is still valid
        const [user] = await db
            .select()
            .from(users)
            .where(
                and(
                    eq(users.passwordResetToken, token),
                    gt(users.passwordResetExpires!, new Date())
                )
            )
            .limit(1);

        if (!user) {
            return { error: 'Ce lien a expiré ou est invalide. Veuillez contacter votre administrateur.' };
        }

        // Hash new password and update user
        const passwordHash = await hashPassword(newPassword);

        await db
            .update(users)
            .set({
                passwordHash,
                passwordResetToken: null,
                passwordResetExpires: null,
                updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

        // Redirect to success state (same page but with success flag)
        return { success: 'Mot de passe défini avec succès' };
    },
};
