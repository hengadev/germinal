import { z } from 'zod';
import { config } from '../config';

const dateSchema = z.string().datetime().transform(s => new Date(s));

export const createEventSessionSchema = z.object({
	eventId: z.string().uuid('Invalid event ID'),
	title: z.string()
		.min(1, 'Session title is required')
		.max(255, 'Session title is too long'),
	description: z.string()
		.optional()
		.transform(v => v ?? null),
	startTime: dateSchema,
	endTime: dateSchema,
	totalCapacity: z.number()
		.int('Capacity must be a whole number')
		.min(config.eventSessions.minCapacity, `Capacity must be at least ${config.eventSessions.minCapacity}`)
		.max(config.eventSessions.maxCapacity,
			`Capacity cannot exceed ${config.eventSessions.maxCapacity}`),
	priceAmount: z.number()
		.int('Price must be in cents (whole number)')
		.min(0, 'Price cannot be negative'),
	currency: z.string()
		.length(3, 'Currency must be 3-letter ISO code')
		.toUpperCase()
		.default('EUR'),
	published: z.boolean().default(false),
	allowWaitlist: z.boolean().default(false),
}).refine(data => data.endTime > data.startTime, {
	message: 'End time must be after start time',
	path: ['endTime'],
});

export const updateEventSessionSchema = createEventSessionSchema.partial().omit({ eventId: true });
