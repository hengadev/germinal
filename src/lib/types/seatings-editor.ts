import type { ServiceKind } from '$lib/utils/seating-times';

/**
 * Shapes of the admin Seatings editor (issue 020): the Event's Days →
 * Services → Seatings as loaded for the edit page, and the payload the
 * editor posts back (parsed by `parseSeatingsPayload`).
 */

export type SeatingBadge = 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited';

/** One Seating as shown in the editor. Times are `HH:MM` UTC on its Day. */
export interface EditorSeating {
	id: string;
	start: string;
	end: string;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	totalCapacity: number;
	availableCapacity: number;
	priceAmount: number;
	currency: string;
	published: boolean;
	allowWaitlist: boolean;
	badgeType: SeatingBadge;
	/** Reservations of any status pointing at the Seating (blocks removal). */
	reservationCount: number;
}

/** One Service (a Day's lunch or dinner) with its Seatings, by start. */
export interface EditorService {
	serviceId: string;
	date: string;
	kind: ServiceKind;
	defaultDurationMinutes: number;
	seatings: EditorSeating[];
}

/** A Seating as posted by the editor; `id` null creates one, `end` null
 * is filled from the Service's default duration. */
export interface SeatingPayload {
	id: string | null;
	start: string;
	end: string | null;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	totalCapacity: number;
	priceAmount: number;
	currency: string;
	published: boolean;
	allowWaitlist: boolean;
	badgeType: SeatingBadge;
}

export interface ServiceSeatingsPayload {
	serviceId: string;
	defaultDurationMinutes: number;
	seatings: SeatingPayload[];
}
