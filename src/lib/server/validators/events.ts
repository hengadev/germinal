import { z } from 'zod';

const dateSchema = z.string().datetime().transform(s => new Date(s));

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: z.string().min(1),
  subtitle: z.string().optional().transform(v => v ?? null),
  startDate: dateSchema,
  endDate: dateSchema,
  location: z.string().min(1).max(500),
  venueName: z.string().max(200).optional().transform(v => v ?? null),
  streetAddress: z.string().max(255).optional().transform(v => v ?? null),
  district: z.string().max(100).optional().transform(v => v ?? null),
  city: z.string().max(100).optional().transform(v => v ?? null),
  postalCode: z.string().max(20).optional().transform(v => v ?? null),
  country: z.string().max(100).optional().transform(v => v ?? null),
  collaborators: z.string().optional().transform(v => {
    if (!v) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  }),
  timings: z.string().optional().transform(v => {
    if (!v) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  }),
  curator: z.string().max(150).optional().transform(v => v ?? null),
  materials: z.string().optional().transform(v => v ?? null),
  admissionInfo: z.string().max(150).optional().transform(v => v ?? null),
  coverMediaId: z.string().uuid().optional().transform(v => v ?? null),
  published: z.boolean().default(false),
}).refine(data => data.endDate >= data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const updateEventSchema = createEventSchema.partial();
