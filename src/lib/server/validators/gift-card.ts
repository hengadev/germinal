import { z } from 'zod';
import { NAME_PART_MAX_LENGTH } from '$lib/utils/person-name';

/**
 * The public gift card form (issue 064). Amounts are minor units (cents);
 * the free amount is typed as a string so French decimals ("75,50") parse.
 */

export const GIFT_CARD_PRESET_AMOUNTS = [5000, 10000, 15000, 20000] as const;
export const GIFT_CARD_MIN_AMOUNT = 2000;
export const GIFT_CARD_MAX_AMOUNT = 100000;

/** Stripe metadata values are strings of at most 500 characters. */
export const GIFT_CARD_MESSAGE_MAX = 500;

/** "75,50" → 7550, "75.5" → 7550; anything else is invalid. */
export function parseFreeAmount(input: string): number | null {
	const trimmed = input.trim().replace(/\s/g, '');
	if (!/^\d{1,6}([.,]\d{1,2})?$/.test(trimmed)) return null;
	const euros = Number(trimmed.replace(',', '.'));
	return Math.round(euros * 100);
}

/** A required first or last name: trimmed, letters of any alphabet,
 * spaces, apostrophes, hyphens and dots, at most 100 characters. */
const namePart = (required: string) =>
	z.string()
		.trim()
		.min(1, required)
		.max(NAME_PART_MAX_LENGTH)
		.regex(/^[\p{L}\p{M}\s'’.-]+$/u, 'Nom invalide');

export const giftCardPurchaseSchema = z.object({
	/** Preset amount in cents, or 'custom' to read customAmount. */
	amount: z.enum(['5000', '10000', '15000', '20000', 'custom']),
	customAmount: z.string().optional().default(''),

	// First and last names apart (see utils/person-name). The buyer gives
	// both; a recipient's first name is enough (« pour Claire »).
	buyerFirstName: namePart('Le prénom est requis'),
	buyerLastName: namePart('Le nom est requis'),
	buyerEmail: z.string()
		.min(1, "L'adresse e-mail est requise")
		.email('Adresse e-mail invalide')
		.max(255)
		.toLowerCase(),

	recipientFirstName: namePart('Le prénom du destinataire est requis'),
	recipientLastName: z.preprocess(
		(v) => (typeof v === 'string' ? v.trim() : ''),
		z.string().max(NAME_PART_MAX_LENGTH).regex(/^[\p{L}\p{M}\s'’.-]*$/u, 'Nom invalide')
	),

	/** Required only when the card is sent straight to the recipient. */
	recipientEmail: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
		z.string()
			.email('Adresse e-mail invalide')
			.max(255)
			.toLowerCase()
			.nullable()
	),

	message: z.string()
		.max(GIFT_CARD_MESSAGE_MAX, `Le message doit faire moins de ${GIFT_CARD_MESSAGE_MAX} caractères`)
		.optional()
		.transform((v) => (v?.trim() ?? null) || null),

	/** 'buyer' — to me; 'recipient' — straight to the recipient. */
	delivery: z.enum(['buyer', 'recipient']),

	locale: z.enum(['fr', 'en']).default('fr'),

	honeypot: z.string()
		.max(100)
		.nullish()
		.transform((v) => v ?? null),
})
	.refine((data) => !data.honeypot || data.honeypot.trim() === '', {
		message: 'Invalid submission',
		path: ['honeypot'],
	})
	.superRefine((data, ctx) => {
		if (data.delivery === 'recipient' && !data.recipientEmail) {
			ctx.addIssue({
				code: 'custom',
				path: ['recipientEmail'],
				message: "L'adresse e-mail du destinataire est requise",
			});
		}
	})
	.transform((data) => {
		const amount =
			data.amount === 'custom'
				? parseFreeAmount(data.customAmount)
				: Number(data.amount);
		return { ...data, amountCents: amount };
	})
	.superRefine((data, ctx) => {
		if (data.amountCents === null) {
			ctx.addIssue({
				code: 'custom',
				path: ['customAmount'],
				message: 'Montant invalide (ex. 75,50)',
			});
			return;
		}
		if (
			data.amountCents < GIFT_CARD_MIN_AMOUNT ||
			data.amountCents > GIFT_CARD_MAX_AMOUNT
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['customAmount'],
				message: 'Le montant doit être entre 20 et 1 000 €',
			});
		}
	});

export type GiftCardPurchaseInput = z.infer<typeof giftCardPurchaseSchema>;
