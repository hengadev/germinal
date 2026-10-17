import type { media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Media = InferSelectModel<typeof media>;
export type CreateMediaInput = Omit<Media, 'id' | 'createdAt' | 'altEn' | 'altFr' | 'role'> &
	Partial<Pick<Media, 'altEn' | 'altFr' | 'role'>>;
/** What an Event's media is for (issue 045): Visual or Event Photo. */
export type MediaRole = NonNullable<Media['role']>;
