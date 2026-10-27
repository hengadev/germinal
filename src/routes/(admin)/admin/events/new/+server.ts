import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The old « Nouvel événement » page (ADR 0010): a Draft is now created by
 * posting to the Events list's `createEvent` action, never on a GET, so an
 * old link or bookmark just lands on the list.
 */
export const GET: RequestHandler = () => {
	redirect(307, '/admin/events');
};
