import { z } from 'zod';
import { config } from '../env';

const dateSchema = z.string().datetime().transform(s => new Date(s));

// Base schema without refinements (allows .partial() to work)
const baseEventSessionSchema = z.object({
	eventId: z.string().uuid('Invalid event ID'),
	titleEn: z.string()
		.min(1, 'Session title (EN) is required')
		.max(255, 'Session title (EN) is too long'),
	titleFr: z.string()
		.min(1, 'Session title (FR) is required')
		.max(255, 'Session title (FR) is too long'),
	descriptionEn: z.string()
		.optional()
		.transform(v => v ?? null),
	descriptionFr: z.string()
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
});

// Create schema with refinement for time validation
export const createEventSessionSchema = baseEventSessionSchema.refine(data => data.endTime > data.startTime, {
	message: 'End time must be after start time',
	path: ['endTime'],
});

// Update schema - partial without eventId (no refinement needed for partial updates)
export const updateEventSessionSchema = baseEventSessionSchema.partial().omit({ eventId: true });
