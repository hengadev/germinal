import { z } from 'zod';

const dateSchema = z.string().datetime().transform(s => new Date(s));

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: z.string().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  location: z.string().min(1).max(500),
  coverMediaId: z.string().uuid().optional().transform(v => v ?? null),
  published: z.boolean().default(false),
}).refine(data => data.endDate >= data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const updateEventSchema = createEventSchema.partial();
