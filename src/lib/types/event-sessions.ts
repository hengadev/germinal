import type { eventSessions } from '$lib/server/db/schema';

export type EventSession = typeof eventSessions.$inferSelect;

export type CreateEventSessionInput = {
	eventId: string;
	title: string;
	description?: string | null;
	startTime: Date;
	endTime: Date;
	totalCapacity: number;
	priceAmount: number;
	currency?: string;
	published?: boolean;
	allowWaitlist?: boolean;
};

export type UpdateEventSessionInput = Partial<Omit<CreateEventSessionInput, 'eventId'>>;

export type EventSessionWithEvent = EventSession & {
	event: {
		id: string;
		title: string;
		slug: string;
		location: string;
	};
};
