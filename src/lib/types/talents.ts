import type { talents, media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Talent = InferSelectModel<typeof talents>;
export type CreateTalentInput = Omit<Talent, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTalentInput = Partial<CreateTalentInput>;

export type TalentWithMedia = Talent & {
  media?: Media[];
  profileMedia?: Media | null;
};

export type Media = InferSelectModel<typeof media>;

export interface SocialLinks {
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}
