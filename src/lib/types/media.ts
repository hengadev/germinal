import type { media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Media = InferSelectModel<typeof media>;
export type CreateMediaInput = Omit<Media, 'id' | 'createdAt'>;
