import { fail, redirect, type Actions } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, hashPassword, verifyPasswordMock } from '$lib/server/auth';
import { env } from '$lib/server/env';
import { revokeUserSessions } from '$lib/server/session';
import { getSessionCookieName } from '$lib/server/hostname';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Déjà protégé par le layout staff
	if (!locals.user) throw redirect(302, '/login');
	return { user: locals.user };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		if (!locals.user) {
			return fail(401, { error: 'Non authentifié' });
		}

		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword');
		const newPassword = formData.get('newPassword');
		const confirmPassword = formData.get('confirmPassword');

		if (!currentPassword || typeof currentPassword !== 'string') {
			return fail(400, { error: 'Le mot de passe actuel est requis.' });
		}

		if (!newPassword || typeof newPassword !== 'string') {
			return fail(400, { error: 'Le nouveau mot de passe est requis.' });
		}

		if (!confirmPassword || typeof confirmPassword !== 'string') {
			return fail(400, { error: 'Veuillez confirmer le nouveau mot de passe.' });
		}

		if (newPassword !== confirmPassword) {
			return fail(400, { error: 'Les nouveaux mots de passe ne correspondent pas.' });
		}

		if (newPassword.length < 8) {
			return fail(400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
		}

		if (env.USE_MOCK_DATA) {
			const validPassword = await verifyPasswordMock(locals.user.email, currentPassword);
			if (!validPassword) {
				return fail(400, { error: 'Le mot de passe actuel est incorrect.' });
			}
			return { success: true, message: 'Mot de passe mis à jour (mode démo – non persisté).' };
		}

		const [user] = await db.select().from(users).where(eq(users.id, locals.user.id)).limit(1);

		if (!user) {
			return fail(404, { error: 'Utilisateur introuvable.' });
		}

		const validPassword = await verifyPassword(user.passwordHash, currentPassword);

		if (!validPassword) {
			return fail(400, { error: 'Le mot de passe actuel est incorrect.' });
		}

		const newPasswordHash = await hashPassword(newPassword);

		await db
			.update(users)
			.set({
				passwordHash: newPasswordHash,
				updatedAt: new Date()
			})
			.where(eq(users.id, locals.user.id));

		// Termine les autres sessions de connexion ; celle-ci reste ouverte.
		await revokeUserSessions(locals.user.id, {
			except: cookies.get(getSessionCookieName(url.hostname))
		});

		return { success: true, message: 'Mot de passe mis à jour.' };
	}
};
