import { z } from 'zod';
import { config } from '../env';
import { MAX_EXTRA_QUANTITY } from '../services/event-extras';
import { DIETARY_REQUIREMENTS_MAX_LENGTH, needsDietaryConsent } from '$lib/utils/dietary-requirements';
import { NAME_PART_MAX_LENGTH } from '$lib/utils/person-name';

/** Letters of any alphabet (with their accents), spaces, apostrophes (' and
 * the typographic ’ phones type), hyphens and dots (« J.-P. »). */
export const NAME_PATTERN = /^[\p{L}\p{M}\s'’.\-]+$/u;

/** A first or last name: trimmed, 1 to 100 characters. */
const namePart = (what: string) =>
	z.string()
		.trim()
		.min(1, `${what} is required`)
		.max(NAME_PART_MAX_LENGTH, `${what} is too long`)
		.regex(NAME_PATTERN, `${what} contains invalid characters`);

export const createReservationSchema = z.object({
	sessionId: z.string().uuid('Invalid session ID'),
	email: z.string()
		.email('Invalid email address')
		.max(255, 'Email is too long')
		.toLowerCase(),
	// The Guest's first and last name, both required. A client from before
	// the split may still send one `name`: it is split at its first space.
	firstName: namePart('First name').optional(),
	lastName: namePart('Last name').optional(),
	name: z.string()
		.trim()
		.max(255, 'Name is too long')
		.regex(NAME_PATTERN, 'Name contains invalid characters')
		.optional(),
	phone: z.string()
		.regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone number format')
		.max(50, 'Phone number is too long')
		.optional()
		.transform(v => v?.trim() ? v : null),
	quantity: z.number()
		.int('Quantity must be a whole number')
		.min(1, 'Quantity must be at least 1')
		.max(config.reservations.maxTicketsPerReservation,
			`Maximum ${config.reservations.maxTicketsPerReservation} tickets per reservation`),
	notificationPreference: z.enum(['email', 'sms', 'both']).default('both'),
	// Optional promotion code
	promoCode: z.string().max(50).optional().transform(v => v?.trim().toUpperCase() || undefined),
	// Optional gift card, paying toward the Deposit (issue 065)
	giftCardCode: z.string().max(50).optional().transform(v => v?.trim().toUpperCase() || undefined),
	// Extras chosen at booking (issue 068). A per-person Extra's quantity
	// is the party size server-side, whatever the client sends.
	extras: z.array(z.object({
		extraId: z.string().uuid('Invalid extra'),
		quantity: z.number().int('Quantity must be a whole number').min(1).max(MAX_EXTRA_QUANTITY),
	})).max(20).optional(),
	// Dietary Requirements (issue 041): optional, and only with the Guest's
	// explicit consent (health data). Ignored on an Event that does not ask.
	dietaryRequirements: z.string()
		.max(DIETARY_REQUIREMENTS_MAX_LENGTH, 'Dietary requirements are too long')
		.optional(),
	dietaryConsent: z.boolean().optional(),
	// Newsletter (issue 052): « Hear about Germinal's next events ». Always
	// optional, and unchecked by default in the UI.
	marketingConsent: z.boolean().optional(),
	// Honeypot for spam protection
	honeypot: z.string().optional(),
	// Issue 025: the language the site was shown in ('fr' | 'en'). Kept
	// only when exactly one of those two; anything else stores null.
	locale: z.string().optional(),
}).refine(data => (data.firstName && data.lastName) || (data.name && data.name.length > 0), {
	message: 'First and last name are required',
	path: ['lastName'],
}).refine(data => !data.honeypot || data.honeypot.trim() === '', {
	message: 'Invalid submission detected',
	path: ['honeypot'],
}).refine(data => !needsDietaryConsent(data.dietaryRequirements, data.dietaryConsent), {
	message: 'Consent is required to share dietary requirements',
	path: ['dietaryConsent'],
});
