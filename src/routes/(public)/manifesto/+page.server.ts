import { getAllEvents } from '$lib/server/services/events';
import { eventPhotosOf } from '$lib/utils/event-photos';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

/** A photograph from a Portfolio project, with the project it shows. */
export interface ManifestoPhoto {
	id: string;
	type: string;
	url: string;
	altEn: string | null;
	altFr: string | null;
	eventId: string;
	titleEn: string | null;
	titleFr: string | null;
	year: string;
}

const PHOTOS_LIMIT = 24;

/**
 * The manifesto shows what Germinal has made: the Event Photos of the
 * Portfolio projects, dealt one project at a time so that two photographs
 * of the same evening never follow each other while others remain.
 */
export const load: PageServerLoad = async () => {
	let projects: EventWithMedia[] = [];
	try {
		const { data } = await getAllEvents({ listedOnly: true, portfolioOnly: true, page: 1, limit: 100 });
		projects = data as EventWithMedia[];
	} catch {
		// Without the database (mock data), the page reads without photographs.
	}

	const piles = projects.map((event) =>
		eventPhotosOf(event.media)
			.filter((medium) => medium.type === 'image')
			.map(
				(medium): ManifestoPhoto => ({
					id: medium.id,
					type: medium.type,
					url: medium.url,
					altEn: medium.altEn ?? null,
					altFr: medium.altFr ?? null,
					eventId: event.id,
					titleEn: event.titleEn,
					titleFr: event.titleFr,
					year: event.startDate ? String(new Date(event.startDate).getUTCFullYear()) : '',
				})
			)
	);
	const photos: ManifestoPhoto[] = [];
	for (let round = 0; photos.length < PHOTOS_LIMIT && piles.some((pile) => pile.length > round); round++) {
		for (const pile of piles) if (pile[round] && photos.length < PHOTOS_LIMIT) photos.push(pile[round]);
	}
	return { photos };
};
