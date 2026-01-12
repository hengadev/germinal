import { z } from 'zod';
import { config } from '../config';

export const createReservationSchema = z.object({
	sessionId: z.string().uuid('Invalid session ID'),
	email: z.string()
		.email('Invalid email address')
		.max(255, 'Email is too long')
		.toLowerCase(),
	name: z.string()
		.min(1, 'Name is required')
		.max(255, 'Name is too long')
		.regex(/^[a-zA-ZÀ-ÿ\s'\-]+$/, 'Name contains invalid characters'),
	phone: z.string()
		.regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone number format')
		.max(50, 'Phone number is too long')
		.optional()
		.transform(v => v ?? null),
	quantity: z.number()
		.int('Quantity must be a whole number')
		.min(1, 'Quantity must be at least 1')
		.max(config.reservations.maxTicketsPerReservation,
			`Maximum ${config.reservations.maxTicketsPerReservation} tickets per reservation`),
	// Honeypot for spam protection
	honeypot: z.string().optional(),
}).refine(data => !data.honeypot || data.honeypot.trim() === '', {
	message: 'Invalid submission detected',
	path: ['honeypot'],
});
