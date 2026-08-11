import { z } from 'zod';

/**
 * Public "find my ticket" lookup — a Guest re-enters the email they booked
 * with to have their Ticket link(s) re-sent. Mirrors the honeypot pattern
 * used by the contact form and reservation-creation validators.
 */
export const findTicketSchema = z
	.object({
		email: z
			.string()
			.min(1, 'Email is required')
			.email('Invalid email address')
			.max(255, 'Email must be less than 255 characters')
			.toLowerCase(),

		honeypot: z
			.string()
			.max(100)
			.optional()
			.transform((v) => v ?? null),
	})
	.refine((data) => !data.honeypot || data.honeypot.trim() === '', {
		message: 'Invalid submission',
		path: ['honeypot'],
	});

export type FindTicketInput = z.infer<typeof findTicketSchema>;
