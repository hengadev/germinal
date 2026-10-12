import type { events, media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Event = InferSelectModel<typeof events>;
// Venue Capacity is optional on creation (issue 021): an Event may get one
// later, before its first Seating inherits it.
export type CreateEventInput = Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'venueCapacity'> & {
  venueCapacity?: number | null;
};
export type UpdateEventInput = Partial<CreateEventInput>;

export type EventWithMedia = Event & {
  media?: Media[];
  coverMedia?: Media | null;
  coverVideo?: Media | null;
};

export type Media = InferSelectModel<typeof media>;
