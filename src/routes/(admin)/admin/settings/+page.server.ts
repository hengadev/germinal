import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { requireAdmin } from '$lib/server/auth-guards';
import { senderEmailSchema } from '$lib/server/validators/site-settings';

export const load: PageServerLoad = async () => {
    // The env override applies in mock mode too, so it is always surfaced.
    const maintenanceForcedByEnv = env.MAINTENANCE_MODE;

    if (env.USE_MOCK_DATA) {
        return { settings: null, maintenanceForcedByEnv };
    }

    const { getSiteSettings } = await import('$lib/server/services/site-settings');
    const settings = await getSiteSettings();
    return { settings, maintenanceForcedByEnv };
};

export const actions: Actions = {
    uploadHeroImage: async ({ request, locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file || file.size === 0) {
            return fail(400, { error: 'No file provided' });
        }

        if (file.size > env.MAX_FILE_SIZE) {
            return fail(400, { error: `File exceeds maximum size of ${Math.round(env.MAX_FILE_SIZE / 1024 / 1024)}MB` });
        }

        if (!env.ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return fail(400, { error: `File type ${file.type} not allowed` });
        }

        try {
            const { updateHeroImage } = await import('$lib/server/services/site-settings');
            await updateHeroImage(file);

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'heroImage' },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to upload hero image');
            return fail(500, { error: 'Upload failed' });
        }
    },

    uploadHeroVideo: async ({ request, locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file || file.size === 0) {
            return fail(400, { error: 'No file provided' });
        }

        if (file.size > env.MAX_FILE_SIZE) {
            return fail(400, { error: `File exceeds maximum size of ${Math.round(env.MAX_FILE_SIZE / 1024 / 1024)}MB` });
        }

        if (!env.ALLOWED_VIDEO_TYPES.includes(file.type)) {
            return fail(400, { error: `File type ${file.type} not allowed` });
        }

        try {
            const { updateHeroVideo } = await import('$lib/server/services/site-settings');
            await updateHeroVideo(file);

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'heroVideo' },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to upload hero video');
            return fail(500, { error: 'Upload failed' });
        }
    },

    clearHeroImage: async ({ locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        try {
            const { clearHeroImage } = await import('$lib/server/services/site-settings');
            await clearHeroImage();

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'heroImage', cleared: true },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to clear hero image');
            return fail(500, { error: 'Clear failed' });
        }
    },

    clearHeroVideo: async ({ locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        try {
            const { clearHeroVideo } = await import('$lib/server/services/site-settings');
            await clearHeroVideo();

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'heroVideo', cleared: true },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to clear hero video');
            return fail(500, { error: 'Clear failed' });
        }
    },

    updateSenderEmail: async ({ request, locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        const formData = await request.formData();
        const validated = senderEmailSchema.safeParse({
            senderEmail: formData.get('senderEmail'),
        });

        if (!validated.success) {
            return fail(400, { error: validated.error.issues[0]?.message ?? 'Adresse email invalide' });
        }

        try {
            const { updateSenderEmail } = await import('$lib/server/services/site-settings');
            await updateSenderEmail(validated.data.senderEmail);

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'senderEmail' },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to update sender email');
            return fail(500, { error: 'Update failed' });
        }
    },

    toggleMaintenanceMode: async ({ request, locals }) => {
        requireAdmin(locals);
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        // When the environment forces maintenance, the database toggle has no effect —
        // refuse rather than let the admin think flipping it did something.
        if (env.MAINTENANCE_MODE) {
            return fail(400, { error: 'Le mode maintenance est forcé par la variable d’environnement MAINTENANCE_MODE. Retirez-la ou passez-la à false (Infisical /app) pour reprendre le contrôle depuis cette page.' });
        }

        const formData = await request.formData();
        const enabled = formData.get('maintenanceMode') === 'true';

        try {
            const { setMaintenanceMode } = await import('$lib/server/services/site-settings');
            await setMaintenanceMode(enabled);

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'settings.update',
                entityType: 'settings',
                entityId: 'site_settings',
                metadata: { field: 'maintenanceMode', enabled },
            });

            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to toggle maintenance mode');
            return fail(500, { error: 'Update failed' });
        }
    },
};
