import type { events, media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Event = InferSelectModel<typeof events>;
export type CreateEventInput = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEventInput = Partial<CreateEventInput>;

export type EventWithMedia = Event & {
  media?: Media[];
  coverMedia?: Media | null;
};

export type Media = InferSelectModel<typeof media>;
