import { getEventBySlug } from '$lib/server/services/events';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const event = await getEventBySlug(params.slug);

    return {
      event,
    };
  } catch {
    throw error(404, 'Event not found');
  }
};
