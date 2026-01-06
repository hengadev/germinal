import type { PageServerLoad } from './$types';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_TALENTS } from '$lib/mock-data';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return all talents (published and unpublished)
		return {
			talents: MOCK_TALENTS
		};
	}

	// Database mode - import and use actual database functions
	const { getAllTalents } = await import('$lib/server/services/talents');
	const talents = await getAllTalents(false); // false = get all, not just published

	return {
		talents
	};
};

export const actions: Actions = {
	/**
	 * Create a new talent
	 */
	createTalent: async ({ request }) => {
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
			// Mock mode - add to mock data array (not persisted)
			const newTalent = {
				id: String(MOCK_TALENTS.length + 1),
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				profileMediaId: null,
				profileMedia: null,
				media: []
			} as typeof MOCK_TALENTS[number];

			MOCK_TALENTS.push(newTalent);

			return { success: `Talent "${firstName} ${lastName}" added successfully` };
		}

		// Database mode - use actual database functions
		const { createTalent } = await import('$lib/server/services/talents');

		try {
			await createTalent({
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				profileMediaId: null,
				published
			});

			return { success: `Talent "${firstName} ${lastName}" added successfully` };
		} catch (error) {
			console.error('Error creating talent:', error);
			return fail(500, { error: 'Failed to create talent' });
		}
	},

	/**
	 * Update an existing talent
	 */
	updateTalent: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const firstName = formData.get('firstName');
		const lastName = formData.get('lastName');
		const role = formData.get('role');
		const bio = formData.get('bio');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const published = formData.get('published') === 'true';

		// Validate id
		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Talent ID is required' });
		}

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

			return { success: `Talent "${firstName} ${lastName}" updated successfully` };
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
	},

	/**
	 * Delete a talent
	 */
	deleteTalent: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Talent ID is required' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - remove from mock data array (not persisted)
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);

			if (talentIndex === -1) {
				return fail(404, { error: 'Talent not found' });
			}

			const talent = MOCK_TALENTS[talentIndex];
			MOCK_TALENTS.splice(talentIndex, 1);

			return { success: `Talent "${talent.firstName} ${talent.lastName}" deleted successfully` };
		}

		// Database mode - use actual database functions
		const { deleteTalent } = await import('$lib/server/services/talents');

		try {
			await deleteTalent(id);
			return { success: 'Talent deleted successfully' };
		} catch (error) {
			console.error('Error deleting talent:', error);
			return fail(500, { error: 'Failed to delete talent' });
		}
	}
};
