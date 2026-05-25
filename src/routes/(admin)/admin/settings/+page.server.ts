import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';

export const load: PageServerLoad = async () => {
    if (env.USE_MOCK_DATA) {
        return { settings: null };
    }

    const { getSiteSettings } = await import('$lib/server/services/site-settings');
    const settings = await getSiteSettings();
    return { settings };
};

export const actions: Actions = {
    uploadHeroImage: async ({ request }) => {
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
            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to upload hero image');
            return fail(500, { error: 'Upload failed' });
        }
    },

    uploadHeroVideo: async ({ request }) => {
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
            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to upload hero video');
            return fail(500, { error: 'Upload failed' });
        }
    },

    clearHeroImage: async () => {
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        try {
            const { clearHeroImage } = await import('$lib/server/services/site-settings');
            await clearHeroImage();
            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to clear hero image');
            return fail(500, { error: 'Clear failed' });
        }
    },

    clearHeroVideo: async () => {
        if (env.USE_MOCK_DATA) return fail(400, { error: 'Not available in mock mode' });

        try {
            const { clearHeroVideo } = await import('$lib/server/services/site-settings');
            await clearHeroVideo();
            return { success: true };
        } catch (err) {
            logger.error({ err }, '[Settings] Failed to clear hero video');
            return fail(500, { error: 'Clear failed' });
        }
    },
};
