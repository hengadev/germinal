import { env } from '$lib/server/env';
import { MOCK_TALENTS } from '$lib/mock-data';
import { listTimeZones } from '$lib/utils/event-time';
import { FULL_PAYMENT_DEPOSIT } from '$lib/utils/pricing';
import { DEFAULT_REFUND_POLICY } from '$lib/utils/refund-policy';
import type { PricingEditorData } from '$lib/types/pricing-editor';
import type { PageServerLoad } from './$types';
import { actions as eventActions } from '../[id]/+page.server';

/**
 * « Nouvel événement » (ADR 0008, issue 036): the Event editor with no Event
 * yet. Its tabs post to the same actions as an existing Event's; with no
 * id, the first save of any tab creates the Draft and redirects to its page.
 */
export const load: PageServerLoad = async () => {
	let talents: { id: string; firstName: string; lastName: string }[];
	if (env.USE_MOCK_DATA) {
		talents = MOCK_TALENTS.map((t) => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));
	} else {
		const { getAllTalents } = await import('$lib/server/services/talents');
		const talentsData = await getAllTalents({ publishedOnly: false, limit: 1000 });
		talents = talentsData.data.map((t: (typeof talentsData.data)[number]) => ({
			id: t.id,
			firstName: t.firstName,
			lastName: t.lastName,
		}));
	}

	// What a new Event starts with: no Days, Menus or prices, full payment
	// online and the default Refund Policy.
	const pricing: PricingEditorData = {
		menus: [],
		services: [],
		deposit: FULL_PAYMENT_DEPOSIT,
		refundPolicy: DEFAULT_REFUND_POLICY,
	};

	return {
		event: null,
		talents,
		days: [],
		schedule: [],
		pricing,
		venueCapacity: null,
		timeZones: listTimeZones(),
		timeZoneLocked: false,
	};
};

export const actions = {
	updateEvent: eventActions.updateEvent,
	updateMedia: eventActions.updateMedia,
	saveSeatings: eventActions.saveSeatings,
	savePricing: eventActions.savePricing,
};
