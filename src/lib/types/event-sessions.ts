import type { eventSessions } from '$lib/server/db/schema';

export type EventSession = typeof eventSessions.$inferSelect;

export type CreateEventSessionInput = {
	eventId: string;
	// Titles are optional since issue 020 — public pages derive a label from
	// the Seating's Day, Service and start time when these are empty.
	titleEn?: string | null;
	titleFr?: string | null;
	descriptionEn?: string | null;
	descriptionFr?: string | null;
	startTime: Date;
	endTime: Date;
	totalCapacity: number;
	priceAmount: number;
	currency?: string;
	published?: boolean;
	allowWaitlist?: boolean;
	badgeType?: 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited';
};

export type UpdateEventSessionInput = Partial<Omit<CreateEventSessionInput, 'eventId'>>;

export type EventSessionWithEvent = EventSession & {
	event: {
		id: string;
		titleEn: string;
		titleFr: string;
		slug: string;
		locationEn: string;
		locationFr: string;
	};
};
