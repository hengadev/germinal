import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { validationResponse, errorResponse } from './response';
import { validateCsrfToken } from './csrf';
import { strictRateLimiter } from './rate-limit';
import { requireAdmin } from './guards';

/**
 * Decorator that validates request body against a Zod schema
 */
export function withValidation<T>(schema: z.ZodSchema<T>) {
	return (handler: RequestHandler): RequestHandler => {
		return async (event) => {
			const data = await event.request.json();
			const parsed = schema.safeParse(data);

			if (!parsed.success) {
				return validationResponse(parsed.error.flatten().fieldErrors);
			}

			// Store validated data in locals for access in handler
			(event.locals as any).validatedData = parsed.data;
			return handler(event);
		};
	};
}

/**
 * Decorator that applies rate limiting to a route
 */
export function withRateLimit(config: { windowMs: number; maxAttempts: number }) {
	return (handler: RequestHandler): RequestHandler => {
		return async (event) => {
			const ip = event.getClientAddress();

			if (!strictRateLimiter.check(ip)) {
				const resetTime = strictRateLimiter.getReset(ip);
				const err = new Error(`Too many requests. Please try again in ${Math.ceil(resetTime / 60000)} minutes.`);
				(err as any).code = 'RATE_LIMIT';
				(err as any).details = { resetTime };
				throw err;
			}

			return handler(event);
		};
	};
}

/**
 * Decorator that requires admin authentication
 */
export function withAuth(handler: RequestHandler): RequestHandler {
	return async (event) => {
		requireAdmin(event);
		return handler(event);
	};
}

/**
 * Decorator that validates CSRF token
 */
export function withCsrf(handler: RequestHandler): RequestHandler {
	return async (event) => {
		// Skip CSRF for webhook endpoints
		if (event.request.url.includes('/api/webhooks/')) {
			return handler(event);
		}

		if (!validateCsrfToken(event.request, event.locals.csrfToken)) {
			const err = new Error('Invalid CSRF token');
			(err as any).code = 'CSRF_ERROR';
			(err as any).statusCode = 403;
			throw err;
		}

		return handler(event);
	};
}

/**
 * Decorator that handles all errors consistently
 */
export function withErrorHandling(handler: RequestHandler): RequestHandler {
	return async (event) => {
		try {
			return await handler(event);
		} catch (error) {
			throw error;
		}
	};
}

/**
 * Combined decorator with validation, rate limiting, CSRF, and error handling
 */
export function withApiMiddleware<T>(
	schema: z.ZodSchema<T>,
	options?: { rateLimit?: boolean; csrf?: boolean; auth?: boolean; }
) {
	return (handler: RequestHandler): RequestHandler => {
		let wrappedHandler = handler;

		if (options?.auth) {
			wrappedHandler = withAuth(wrappedHandler);
		}

		if (options?.csrf) {
			wrappedHandler = withCsrf(wrappedHandler);
		}

		if (options?.rateLimit) {
			wrappedHandler = withRateLimit({ windowMs: 60000, maxAttempts: 10 })(wrappedHandler);
		}

		if (schema) {
			wrappedHandler = withValidation(schema)(wrappedHandler);
		}

		return withErrorHandling(wrappedHandler);
	};
}
