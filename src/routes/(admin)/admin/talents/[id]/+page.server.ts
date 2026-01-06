import { fail, type Actions } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_TALENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find talent in mock data
		const talent = MOCK_TALENTS.find((t) => t.id === id);

		if (!talent) {
			throw fail(404, { error: 'Talent not found' });
		}

		// Parse social links
		const socialLinks = talent.socialLinks
			? JSON.parse(talent.socialLinks)
			: {};

		return {
			talent: {
				...talent,
				socialLinks
			}
		};
	}

	// Database mode - fetch from database
	const { getTalentById } = await import('$lib/server/services/talents');

	try {
		const talent = await getTalentById(id);
		const socialLinks = talent.socialLinks
			? JSON.parse(talent.socialLinks)
			: {};

		return {
			talent: {
				...talent,
				socialLinks
			}
		};
	} catch (error) {
		throw fail(404, { error: 'Talent not found' });
	}
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'Talent ID is required' });
		}

		const formData = await request.formData();
		const firstName = formData.get('firstName');
		const lastName = formData.get('lastName');
		const role = formData.get('role');
		const bio = formData.get('bio');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const published = formData.get('published') === 'true';

		// Validation
		if (!firstName || typeof firstName !== 'string') {
			return fail(400, { error: 'First name is required' });
		}

		if (!lastName || typeof lastName !== 'string') {
			return fail(400, { error: 'Last name is required' });
		}

		if (!role || typeof role !== 'string') {
			return fail(400, { error: 'Role is required' });
		}

		if (!bio || typeof bio !== 'string') {
			return fail(400, { error: 'Bio is required' });
		}

		// Build social links object
		const socialLinks: Record<string, string> = {};
		if (instagram && typeof instagram === 'string' && instagram.trim()) {
			socialLinks.instagram = instagram.trim();
		}
		if (linkedin && typeof linkedin === 'string' && linkedin.trim()) {
			socialLinks.linkedin = linkedin.trim();
		}
		if (twitter && typeof twitter === 'string' && twitter.trim()) {
			socialLinks.twitter = twitter.trim();
		}
		if (website && typeof website === 'string' && website.trim()) {
			socialLinks.website = website.trim();
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);

			if (talentIndex === -1) {
				return fail(404, { error: 'Talent not found' });
			}

			MOCK_TALENTS[talentIndex] = {
				...MOCK_TALENTS[talentIndex],
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				published,
				updatedAt: new Date()
			};

			return { success: `Talent "${firstName} ${lastName}" updated successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { updateTalent } = await import('$lib/server/services/talents');

		try {
			await updateTalent(id, {
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				published
			});

			return { success: `Talent "${firstName} ${lastName}" updated successfully` };
		} catch (error) {
			console.error('Error updating talent:', error);
			return fail(500, { error: 'Failed to update talent' });
		}
	}
};
