import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-guards';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES } from '$lib/mock-data';
import type { TalentWithMedia } from '$lib/types/talents';
import { followFrench } from '$lib/server/services/event-translation';
import { getTranslator, isTranslationEnabled } from '$lib/server/services/translator';

type CategoryNames = { displayNameEn: string; displayNameFr: string };

/** The saved names of a talent category, to compare the French with. */
async function storedCategory(id: string): Promise<CategoryNames | null> {
	if (env.USE_MOCK_DATA) return MOCK_TALENT_CATEGORIES.find((c) => c.id === id) ?? null;
	const { getTalentCategoryById } = await import('$lib/server/services/talent-categories');
	return getTalentCategoryById(id).catch(() => null);
}

/** A category's English display name, generated from the French (DeepL);
 * the French itself when nothing translates it. */
async function englishCategoryName(fr: string, posted: FormDataEntryValue | null, stored: CategoryNames | null): Promise<string> {
	const english = await followFrench(
		[{
			fr: fr.trim() || null,
			en: typeof posted === 'string' && posted.trim() ? posted.trim() : null,
			storedFr: stored?.displayNameFr ?? null,
			storedEn: stored?.displayNameEn ?? null,
			required: true,
			maxLength: 100,
		}],
		getTranslator()
	);
	if (english.translationFailed) {
		logger.error({ err: english.error }, 'Talent category English translation failed');
	}
	return english.value[0] ?? fr;
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	// Non-null: requireAdmin throws above if locals.user is missing.
	const currentUserId = locals.user!.id;

	if (env.USE_MOCK_DATA) {
		return {
			talents: MOCK_TALENTS as unknown as TalentWithMedia[],
			categories: MOCK_TALENT_CATEGORIES,
			currentUserId,
			englishAuto: isTranslationEnabled(),
			staffRoles: [],
		};
	}

	const { getAllTalents } = await import('$lib/server/services/talents');
	const { getAllTalentCategories } = await import('$lib/server/services/talent-categories');
	const [result, categories] = await Promise.all([
		getAllTalents({ publishedOnly: false }),
		getAllTalentCategories({ publishedOnly: false }),
	]);

	const { listStaffRoles } = await import('$lib/server/services/staff-roles');
	const staffRoles = await listStaffRoles();

	return {
		talents: result.data as TalentWithMedia[],
		categories,
		currentUserId,
		englishAuto: isTranslationEnabled(),
		staffRoles,
	};
};

function rolePermissionsOf(formData: FormData): string[] {
	return formData.getAll('permissions').filter((v): v is string => typeof v === 'string');
}

export const actions: Actions = {
	createStaffRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const name = formData.get('name');

		if (!name || typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Le nom du rôle est requis' });
		}

		const { createStaffRole, StaffRoleError } = await import('$lib/server/services/staff-roles');
		try {
			const role = await createStaffRole(
				{ name, permissions: rolePermissionsOf(formData) },
				locals.user!.id
			);
			return { success: `Rôle « ${role.name} » créé` };
		} catch (error) {
			if (error instanceof StaffRoleError) {
				return fail(400, { error: error.message });
			}
			logger.error({ err: error }, 'Error creating staff role');
			return fail(500, { error: 'Impossible de créer le rôle' });
		}
	},

	updateStaffRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');
		const name = formData.get('name');

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant du rôle est requis" });
		if (!name || typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Le nom du rôle est requis' });
		}

		const { updateStaffRole, StaffRoleError } = await import('$lib/server/services/staff-roles');
		try {
			const role = await updateStaffRole(
				id,
				{ name, permissions: rolePermissionsOf(formData) },
				locals.user!.id
			);
			return { success: `Rôle « ${role.name} » mis à jour` };
		} catch (error) {
			if (error instanceof StaffRoleError) {
				return fail(400, { error: error.message });
			}
			logger.error({ err: error }, 'Error updating staff role');
			return fail(500, { error: 'Impossible de mettre à jour le rôle' });
		}
	},

	archiveStaffRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant du rôle est requis" });

		const { setStaffRoleArchived, StaffRoleError } = await import('$lib/server/services/staff-roles');
		try {
			const role = await setStaffRoleArchived(id, true, locals.user!.id);
			return { success: `Rôle « ${role.name} » archivé` };
		} catch (error) {
			if (error instanceof StaffRoleError) {
				return fail(400, { error: error.message });
			}
			logger.error({ err: error }, 'Error archiving staff role');
			return fail(500, { error: "Impossible d'archiver le rôle" });
		}
	},

	restoreStaffRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant du rôle est requis" });

		const { setStaffRoleArchived, StaffRoleError } = await import('$lib/server/services/staff-roles');
		try {
			const role = await setStaffRoleArchived(id, false, locals.user!.id);
			return { success: `Rôle « ${role.name} » restauré` };
		} catch (error) {
			if (error instanceof StaffRoleError) {
				return fail(400, { error: error.message });
			}
			logger.error({ err: error }, 'Error restoring staff role');
			return fail(500, { error: 'Impossible de restaurer le rôle' });
		}
	},

	deleteStaffRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant du rôle est requis" });

		const { deleteStaffRole, StaffRoleError } = await import('$lib/server/services/staff-roles');
		try {
			await deleteStaffRole(id, locals.user!.id);
			return { success: 'Rôle supprimé' };
		} catch (error) {
			if (error instanceof StaffRoleError) {
				return fail(400, { error: error.message });
			}
			logger.error({ err: error }, 'Error deleting staff role');
			return fail(500, { error: 'Impossible de supprimer le rôle' });
		}
	},

	deleteTalent: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { error: "L'identifiant du talent est requis" });
		}

		if (env.USE_MOCK_DATA) {
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);
			if (talentIndex === -1) return fail(404, { error: 'Talent introuvable' });
			const talent = MOCK_TALENTS[talentIndex];
			MOCK_TALENTS.splice(talentIndex, 1);
			return { success: `Talent "${talent.firstName} ${talent.lastName}" supprimé` };
		}

		const { deleteTalent } = await import('$lib/server/services/talents');
		try {
			await deleteTalent(id);

			const { recordAuditLog } = await import('$lib/server/services/audit-log');
			await recordAuditLog({
				adminId: locals.user!.id,
				action: 'talent.delete',
				entityType: 'talent',
				entityId: id,
			});

			return { success: 'Talent supprimé avec succès' };
		} catch (error) {
			logger.error({ err: error }, 'Error deleting talent');
			return fail(500, { error: 'Impossible de supprimer le talent' });
		}
	},

	createCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const name = formData.get('name');
		const postedNameEn = formData.get('displayNameEn');
		const displayNameFr = formData.get('displayNameFr');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		if (!name || typeof name !== 'string') return fail(400, { error: 'Le nom est requis' });
		if (!displayNameFr || typeof displayNameFr !== 'string') return fail(400, { error: "Le nom d'affichage (français) est requis" });
		// The English name is generated from the French unless typed here.
		const displayNameEn = await englishCategoryName(displayNameFr, postedNameEn, null);
		if (!slug || typeof slug !== 'string') return fail(400, { error: 'Le slug est requis' });
		if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets' });

		if (env.USE_MOCK_DATA) {
			const newCategory = {
				id: String(MOCK_TALENT_CATEGORIES.length + 1),
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				talentCount: 0,
			} as typeof MOCK_TALENT_CATEGORIES[number];
			MOCK_TALENT_CATEGORIES.push(newCategory);
			return { success: `Catégorie "${displayNameEn}" créée avec succès` };
		}

		const { createTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await createTalentCategory({
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
			});
			return { success: `Catégorie "${displayNameEn}" créée avec succès` };
		} catch (error) {
			logger.error({ err: error }, 'Error creating talent category');
			return fail(500, { error: 'Impossible de créer la catégorie. Le slug est peut-être déjà utilisé.' });
		}
	},

	updateCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');
		const name = formData.get('name');
		const postedNameEn = formData.get('displayNameEn');
		const displayNameFr = formData.get('displayNameFr');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant de la catégorie est requis" });
		if (!name || typeof name !== 'string') return fail(400, { error: 'Le nom est requis' });
		if (!displayNameFr || typeof displayNameFr !== 'string') return fail(400, { error: "Le nom d'affichage (français) est requis" });
		// The English name follows the French unless edited in this save.
		const displayNameEn = await englishCategoryName(displayNameFr, postedNameEn, await storedCategory(id));
		if (!slug || typeof slug !== 'string') return fail(400, { error: 'Le slug est requis' });
		if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets' });

		if (env.USE_MOCK_DATA) {
			const idx = MOCK_TALENT_CATEGORIES.findIndex((c) => c.id === id);
			if (idx === -1) return fail(404, { error: 'Catégorie introuvable' });
			MOCK_TALENT_CATEGORIES[idx] = {
				...MOCK_TALENT_CATEGORIES[idx],
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
				updatedAt: new Date(),
			} as typeof MOCK_TALENT_CATEGORIES[number];
			return { success: `Catégorie "${displayNameEn}" mise à jour` };
		}

		const { updateTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await updateTalentCategory(id, {
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
			});
			return { success: `Catégorie "${displayNameEn}" mise à jour` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating talent category');
			return fail(500, { error: 'Impossible de mettre à jour la catégorie' });
		}
	},

	deleteCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') return fail(400, { error: "L'identifiant de la catégorie est requis" });

		if (env.USE_MOCK_DATA) {
			const idx = MOCK_TALENT_CATEGORIES.findIndex((c) => c.id === id);
			if (idx === -1) return fail(404, { error: 'Catégorie introuvable' });
			const category = MOCK_TALENT_CATEGORIES[idx];
			if (category.talentCount > 0) return fail(400, { error: 'Impossible de supprimer une catégorie contenant des talents' });
			MOCK_TALENT_CATEGORIES.splice(idx, 1);
			return { success: `Catégorie "${category.displayNameEn}" supprimée` };
		}

		const { deleteTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await deleteTalentCategory(id);
			return { success: 'Catégorie supprimée avec succès' };
		} catch (error) {
			logger.error({ err: error }, 'Error deleting talent category');
			if (error instanceof Error && error.message.includes('Cannot delete category with associated talents')) {
				return fail(400, { error: 'Impossible de supprimer une catégorie contenant des talents' });
			}
			return fail(500, { error: 'Impossible de supprimer la catégorie' });
		}
	},
};
