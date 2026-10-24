import { z } from 'zod';
import { isHttpUrl, SOCIAL_LINK_KEYS } from '$lib/utils/social-links';

const httpUrl = z.string().refine(isHttpUrl, {
  message: 'Les liens doivent être des URL absolues en http(s)',
});

const socialLinksSchema = z.strictObject({
  instagram: httpUrl.optional(),
  linkedin: httpUrl.optional(),
  twitter: httpUrl.optional(),
  website: httpUrl.optional(),
});

export const createTalentSchema = z.object({
  firstName: z.string().min(1, 'Le prénom est requis').max(100),
  lastName: z.string().min(1, 'Le nom est requis').max(100),
  roleEn: z.string().min(1, 'Le rôle (anglais) est requis').max(150),
  roleFr: z.string().min(1, 'Le rôle (français) est requis').max(150),
  bioEn: z.string().min(1, 'La bio (anglais) est requise'),
  bioFr: z.string().min(1, 'La bio (français) est requise'),
  profileMediaId: z.string().uuid().optional().transform(v => v ?? null),
  categoryId: z.string().uuid().optional().transform(v => v ?? null),
  city: z.string().max(100).optional().transform(v => v ?? null),
  country: z.string().max(100).optional().transform(v => v ?? null),
  quoteEn: z.string().optional().transform(v => v ?? null),
  quoteFr: z.string().optional().transform(v => v ?? null),
  specializationsEn: z.string().optional().transform(v => {
    if (!v) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  }),
  specializationsFr: z.string().optional().transform(v => {
    if (!v) return null;
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null;
    }
  }),
  // A JSON object of social links; each must be an absolute http(s) URL.
  socialLinks: z.string().optional().transform((v, ctx) => {
    if (!v) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Liens sociaux invalides' });
      return z.NEVER;
    }
    const links = socialLinksSchema.safeParse(parsed);
    if (!links.success) {
      ctx.addIssue({ code: 'custom', message: links.error.issues[0].message });
      return z.NEVER;
    }
    return JSON.stringify(links.data);
  }),
  published: z.boolean().default(false),
});

export const updateTalentSchema = createTalentSchema.partial();

/** The Talent form's content fields; ids are validated by the caller (mock ids aren't UUIDs).
 * The English role and bio may be left blank: they are generated from the
 * French (talent-translation.ts). */
const talentFormSchema = createTalentSchema.omit({ profileMediaId: true, categoryId: true }).extend({
  roleEn: z.string().max(150).optional(),
  bioEn: z.string().optional(),
});

/**
 * Parse the admin Talent create/edit form through the same schema as the
 * Talent API, so both paths enforce the same rules. Empty fields count as
 * unset; the social-link inputs are gathered into the `socialLinks` JSON.
 */
export function parseTalentForm(formData: FormData) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };

  const socialLinks: Record<string, string> = {};
  for (const key of SOCIAL_LINK_KEYS) {
    const value = text(key);
    if (value) socialLinks[key] = value.trim();
  }

  const parsed = talentFormSchema.safeParse({
    firstName: text('firstName') ?? '',
    lastName: text('lastName') ?? '',
    roleEn: text('roleEn'),
    roleFr: text('roleFr') ?? '',
    bioEn: text('bioEn'),
    bioFr: text('bioFr') ?? '',
    city: text('city'),
    country: text('country'),
    quoteEn: text('quoteEn'),
    quoteFr: text('quoteFr'),
    specializationsEn: text('specializationsEn'),
    specializationsFr: text('specializationsFr'),
    socialLinks: JSON.stringify(socialLinks),
    published: formData.get('published') === 'true',
  });

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  return { success: true as const, data: parsed.data };
}

/** Validate the Talent form's category/profile media ids as the API does. */
export const talentFormIdsSchema = createTalentSchema.pick({ profileMediaId: true, categoryId: true });

export type TalentFormFields = Extract<ReturnType<typeof parseTalentForm>, { success: true }>['data'];
