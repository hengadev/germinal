import { z } from 'zod';

const socialLinksSchema = z.object({
  instagram: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  twitter: z.string().url().optional(),
  website: z.string().url().optional(),
}).optional();

export const createTalentSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.string().min(1).max(150),
  bio: z.string().min(1),
  profileMediaId: z.string().uuid().optional().transform(v => v ?? null),
  city: z.string().max(100).optional().transform(v => v ?? null),
  country: z.string().max(100).optional().transform(v => v ?? null),
  quote: z.string().optional().transform(v => v ?? null),
  specializations: z.string().optional().transform(v => {
    if (!v) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  }),
  socialLinks: z.string().optional().transform(v => v ?? null),
  published: z.boolean().default(false),
});

export const updateTalentSchema = createTalentSchema.partial();
