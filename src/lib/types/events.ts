import type { events, media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Event = InferSelectModel<typeof events>;
// Nothing is required on creation (ADR 0008, issue 036): a Draft is saved
// with whatever has been filled in, the rest left to its column default.
export type CreateEventInput = Partial<Omit<Event, 'id' | 'createdAt' | 'updatedAt'>>;
export type UpdateEventInput = Partial<CreateEventInput>;

export type EventWithMedia = Event & {
  media?: Media[];
  coverMedia?: Media | null;
  coverVideo?: Media | null;
};

export type Media = InferSelectModel<typeof media>;
