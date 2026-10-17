import { fail, redirect, type Actions } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_TALENTS } from '$lib/mock-data';
import {
	dayEndUtc,
	dayStartUtc,
	formatSeatingOverlapWarning,
	loadSeatingsEditor,
	parsePickedDays,
	parseSeatingsPayload,
	parseVenueCapacity,
	pickedDaysErrorMessage,
	saveEventSchedule,
	saveServiceSeatings,
	ScheduleSaveRefusedError,
	seatingsPayloadErrorMessage,
	VENUE_CAPACITY_ERROR_MESSAGE,
	type ParsedServiceSeatings,
} from '$lib/server/services/event-schedule';
import {
	parsePricingPayload,
	pricingPayloadErrorMessage,
	savePricing,
} from '$lib/server/services/service-pricing';
import {
	parseServiceRefs,
	refersOnlyTo,
	resolveServiceRefs,
	serviceKey,
} from '$lib/server/services/new-event-schedule';
import type { PricingPayload } from '$lib/types/pricing-editor';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		const talents = MOCK_TALENTS.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));
		return { talents };
	}
	const { getAllTalents } = await import('$lib/server/services/talents');
	const talentsData = await getAllTalents({ publishedOnly: false, limit: 1000 });
	const talents = talentsData.data.map((t: typeof talentsData.data[number]) => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));
	return { talents };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const titleEn = formData.get('titleEn');
		const titleFr = formData.get('titleFr');
		const descriptionEn = formData.get('descriptionEn');
		const descriptionFr = formData.get('descriptionFr');
		const subtitleEn = formData.get('subtitleEn');
		const subtitleFr = formData.get('subtitleFr');
		// Days picked on the calendar (issue 019): the Event's start/end dates
		// are derived from its first and last Day.
		const pickedDays = parsePickedDays(
			typeof formData.get('days') === 'string' ? formData.get('days') as string : null
		);
		if (!pickedDays.ok) {
			return fail(400, { error: pickedDaysErrorMessage(pickedDays.reason) });
		}
		// Venue Capacity (issue 021): set once here, inherited by every
		// Seating added later unless it overrides it.
		const rawVenueCapacity = formData.get('venueCapacity');
		const venue = parseVenueCapacity(typeof rawVenueCapacity === 'string' ? rawVenueCapacity : null);
		if (!venue.ok || venue.venueCapacity === undefined) {
			return fail(400, { error: venue.ok ? 'La capacité du lieu est requise.' : VENUE_CAPACITY_ERROR_MESSAGE });
		}
		const venueCapacity = venue.venueCapacity;
		// Seatings and « Menus & tarifs » (same editors as the event page),
		// for the Services just picked: their payloads name each Service by
		// a placeholder, mapped to its Day and meal by `serviceRefs`. All of
		// it is checked here, before anything is created.
		const rawRefs = formData.get('serviceRefs');
		const refs = parseServiceRefs(typeof rawRefs === 'string' ? rawRefs : null, pickedDays.days);
		if (!refs) {
			return fail(400, { error: 'Les repas des séances et des tarifs ne correspondent pas aux jours sélectionnés.' });
		}
		const rawSeatings = formData.get('services');
		let seatingServices: ParsedServiceSeatings[] = [];
		if (typeof rawSeatings === 'string' && rawSeatings.trim() !== '') {
			const parsedSeatings = parseSeatingsPayload(rawSeatings);
			if (!parsedSeatings.ok) {
				return fail(400, { error: seatingsPayloadErrorMessage(parsedSeatings.reason) });
			}
			seatingServices = parsedSeatings.services;
		}
		const rawPricing = formData.get('pricing');
		let pricing: PricingPayload | null = null;
		if (typeof rawPricing === 'string' && rawPricing.trim() !== '') {
			const parsedPricing = parsePricingPayload(rawPricing);
			if (!parsedPricing.ok) {
				return fail(400, { error: pricingPayloadErrorMessage(parsedPricing.reason) });
			}
			pricing = parsedPricing.payload;
		}
		if (!refersOnlyTo(seatingServices, refs) || (pricing && !refersOnlyTo(pricing.services, refs))) {
			return fail(400, { error: 'Les repas des séances et des tarifs ne correspondent pas aux jours sélectionnés.' });
		}
		const start = dayStartUtc(pickedDays.days[0].date);
		const end = dayEndUtc(pickedDays.days[pickedDays.days.length - 1].date);
		const locationEn = formData.get('locationEn');
		const locationFr = formData.get('locationFr');
		const venueNameEn = formData.get('venueNameEn');
		const venueNameFr = formData.get('venueNameFr');
		const streetAddressEn = formData.get('streetAddressEn');
		const streetAddressFr = formData.get('streetAddressFr');
		const districtEn = formData.get('districtEn');
		const districtFr = formData.get('districtFr');
		const cityEn = formData.get('cityEn');
		const cityFr = formData.get('cityFr');
		const postalCode = formData.get('postalCode');
		const countryEn = formData.get('countryEn');
		const countryFr = formData.get('countryFr');
		const collaborators = formData.get('collaborators');
		const timings = formData.get('timings');
		const curatorEn = formData.get('curatorEn');
		const curatorFr = formData.get('curatorFr');
		const admissionInfoEn = formData.get('admissionInfoEn');
		const admissionInfoFr = formData.get('admissionInfoFr');
		const coverMediaId = formData.get('coverMediaId') as string | null;
		const galleryMediaIds = formData.get('galleryMediaIds') as string | null;
		// Events are always created as Drafts (issue 032) — the Admin sets
		// the Visibility on the Event afterwards. A Draft can never be the
		// Spotlight, so a new Event never is.
		const visibility = 'draft' as const;
		const isSpotlight = false;

		// Parse gallery media IDs
		let galleryIds: string[] = [];
		if (galleryMediaIds) {
			try {
				galleryIds = JSON.parse(galleryMediaIds);
			} catch {
				galleryIds = [];
			}
		}

		// Combine cover and gallery media - cover is first if exists
		const allMediaIds = coverMediaId
			? [coverMediaId, ...galleryIds.filter(id => id !== coverMediaId)]
			: galleryIds;

		// Validation
		if (!titleEn || typeof titleEn !== 'string') {
			return fail(400, { error: 'Title (English) is required' });
		}

		if (!titleFr || typeof titleFr !== 'string') {
			return fail(400, { error: 'Title (French) is required' });
		}

		if (!descriptionEn || typeof descriptionEn !== 'string') {
			return fail(400, { error: 'Description (English) is required' });
		}

		if (!descriptionFr || typeof descriptionFr !== 'string') {
			return fail(400, { error: 'Description (French) is required' });
		}

		if (!locationEn || typeof locationEn !== 'string') {
			return fail(400, { error: 'Location (English) is required' });
		}

		if (!locationFr || typeof locationFr !== 'string') {
			return fail(400, { error: 'Location (French) is required' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - add to mock data array (not persisted)
			const createMockMedia = (url: string, type: 'image' | 'video' = 'image') => ({
				id: `mock-media-${Math.random().toString(36).substr(2, 9)}`,
				type,
				url,
				s3Key: `mock/${url.split('/').pop()}`,
				mimeType: type === 'image' ? 'image/jpeg' : 'video/mp4',
				size: 1234567,
				eventId: null as string | null,
				talentId: null as string | null,
				isCover: false,
				createdAt: new Date()
			});

			// If isSpotlight is true, unset others in mock array
			if (isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}

			const newEvent = {
				id: String(MOCK_EVENTS.length + 1),
				titleEn,
				titleFr,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				locationEn,
				locationFr,
				venueNameEn: venueNameEn?.toString() || null,
				venueNameFr: venueNameFr?.toString() || null,
				streetAddressEn: streetAddressEn?.toString() || null,
				streetAddressFr: streetAddressFr?.toString() || null,
				districtEn: districtEn?.toString() || null,
				districtFr: districtFr?.toString() || null,
				cityEn: cityEn?.toString() || null,
				cityFr: cityFr?.toString() || null,
				postalCode: postalCode?.toString() || null,
				countryEn: countryEn?.toString() || null,
				countryFr: countryFr?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				visibility,
				isSpotlight,
				createdAt: new Date(),
				updatedAt: new Date(),
				coverMediaId: coverMediaId || null,
				coverMedia: coverMediaId ? { id: coverMediaId, url: '' } : createMockMedia('https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2670&auto=format&fit=crop'),
				media: allMediaIds.map(id => createMockMedia(`https://picsum.photos/seed/${id}/800/600`))
			} as typeof MOCK_EVENTS[number];

			MOCK_EVENTS.push(newEvent);

			return { success: `Event "${titleEn}" created successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { createEvent, deleteEvent } = await import('$lib/server/services/events');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');

		let event: Awaited<ReturnType<typeof createEvent>>;
		try {
			event = await createEvent({
				titleEn,
				titleFr,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				locationEn,
				locationFr,
				venueNameEn: venueNameEn?.toString() || null,
				venueNameFr: venueNameFr?.toString() || null,
				streetAddressEn: streetAddressEn?.toString() || null,
				streetAddressFr: streetAddressFr?.toString() || null,
				districtEn: districtEn?.toString() || null,
				districtFr: districtFr?.toString() || null,
				cityEn: cityEn?.toString() || null,
				cityFr: cityFr?.toString() || null,
				postalCode: postalCode?.toString() || null,
				countryEn: countryEn?.toString() || null,
				countryFr: countryFr?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				venueCapacity,
				coverMediaId: coverMediaId || null,
				visibility,
				isSpotlight
			});
		} catch (error) {
			console.error('Error creating event:', error);
			return fail(500, { error: 'Failed to create event.' });
		}

		let overlapWarning = '';
		try {
			// Save the picked Days/Services; this also recomputes the Event's
			// start/end dates from its first and last Day (identical here).
			await saveEventSchedule(event.id, pickedDays.days);

			// Then the Seatings and pricing, on the Services just created.
			const realIds = new Map(
				(await loadSeatingsEditor(event.id)).map((service) => [serviceKey(service.date, service.kind), service.serviceId])
			);
			if (seatingServices.length > 0) {
				const saved = await saveServiceSeatings(
					event.id,
					resolveServiceRefs(seatingServices, refs, realIds),
					venueCapacity
				);
				if (saved.overlaps.length > 0) {
					overlapWarning = ` ${formatSeatingOverlapWarning(saved.overlaps)}`;
				}
			}
			if (pricing) {
				await savePricing(event.id, { ...pricing, services: resolveServiceRefs(pricing.services, refs, realIds) });
			}
		} catch (error) {
			// Nothing half-created: the Event goes, with its Days, Services,
			// Seatings and Menus (cascade).
			await deleteEvent(event.id);
			if (error instanceof ScheduleSaveRefusedError) {
				return fail(400, { error: error.message });
			}
			console.error('Error saving new event schedule:', error);
			return fail(500, { error: 'Échec de l’enregistrement des séances et des tarifs : l’événement n’a pas été créé.' });
		}

		// Link media to event
		for (let i = 0; i < allMediaIds.length; i++) {
			const mediaId = allMediaIds[i];
			const isCover = i === 0; // First image is cover
			await db.update(media)
				.set({ eventId: event.id, isCover })
				.where(eq(media.id, mediaId));
		}

		return { success: `Événement « ${titleFr} » créé.${overlapWarning}` };
	}
};
