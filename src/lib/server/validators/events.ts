import { z } from 'zod';

const dateSchema = z.string().datetime().transform(s => new Date(s));

/**
 * Reserved paths that cannot be used as event slugs
 * These paths are used for routing and system pages
 */
const RESERVED_PATHS = [
  'admin', 'api', 'auth', 'login', 'logout', 'register', 'reset-password',
  'static', 'favicon', 'robots', 'sitemap', 'health', 'docs', 'dashboard',
  'account', 'profile', 'settings', 'checkout', 'tickets', 'events', 'talents',
  'contact', 'about', 'privacy', 'terms', 'legal', 'webhooks', 'callback',
  'error', '404', '500', 'maintenance', 'coming-soon'
];

// Base schema without refinements (allows .partial() to work)
const baseEventSchema = z.object({
  titleEn: z.string().min(1).max(255),
  titleFr: z.string().min(1).max(255),
  slug: z.string()
    .min(1, 'Slug is required')
    .max(255, 'Slug is too long')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .refine(
      slug => !RESERVED_PATHS.includes(slug),
      'This slug is reserved and cannot be used'
    )
    .refine(
      slug => !slug.startsWith('-') && !slug.endsWith('-'),
      'Slug cannot start or end with a hyphen'
    )
    .refine(
      slug => !slug.includes('--'),
      'Slug cannot contain consecutive hyphens'
    ),
  descriptionEn: z.string().min(1),
  descriptionFr: z.string().min(1),
  subtitleEn: z.string().optional().transform(v => v ?? null),
  subtitleFr: z.string().optional().transform(v => v ?? null),
  startDate: dateSchema,
  endDate: dateSchema,
  locationEn: z.string().min(1).max(500),
  locationFr: z.string().min(1).max(500),
  venueNameEn: z.string().max(200).optional().transform(v => v ?? null),
  venueNameFr: z.string().max(200).optional().transform(v => v ?? null),
  streetAddressEn: z.string().max(255).optional().transform(v => v ?? null),
  streetAddressFr: z.string().max(255).optional().transform(v => v ?? null),
  districtEn: z.string().max(100).optional().transform(v => v ?? null),
  districtFr: z.string().max(100).optional().transform(v => v ?? null),
  cityEn: z.string().max(100).optional().transform(v => v ?? null),
  cityFr: z.string().max(100).optional().transform(v => v ?? null),
  postalCode: z.string().max(20).optional().transform(v => v ?? null),
  countryEn: z.string().max(100).optional().transform(v => v ?? null),
  countryFr: z.string().max(100).optional().transform(v => v ?? null),
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
  curatorEn: z.string().max(150).optional().transform(v => v ?? null),
  curatorFr: z.string().max(150).optional().transform(v => v ?? null),
  materialsEn: z.string().optional().transform(v => v ?? null),
  materialsFr: z.string().optional().transform(v => v ?? null),
  admissionInfoEn: z.string().max(150).optional().transform(v => v ?? null),
  admissionInfoFr: z.string().max(150).optional().transform(v => v ?? null),
  coverMediaId: z.string().uuid().optional().transform(v => v ?? null),
  categoryId: z.string().uuid().optional().transform(v => v ?? null),
  published: z.boolean().default(false),
  isSpotlight: z.boolean().default(false),
});

// Create schema with refinement for date validation
export const createEventSchema = baseEventSchema.refine(data => data.endDate >= data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

// Update schema - partial (no refinement needed for partial updates)
export const updateEventSchema = baseEventSchema.partial();
