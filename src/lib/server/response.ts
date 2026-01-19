/**
 * Response Helpers
 * Provides standardized API response formatting with consistent error handling
 */

import { json } from '@sveltejs/kit';
import { type AppError, isAppError } from './errors';
import type { RequestHandler } from '@sveltejs/kit';

export interface SuccessResponse<T = unknown> {
	success: true;
	data: T;
	timestamp: string;
}

export interface ErrorResponse {
	success: false;
	error: {
		code: string;
		message: string;
		details?: Record<string, unknown>;
	};
	timestamp: string;
}

/**
 * Create a successful JSON response
 */
export function successResponse<T>(data: T, status = 200): Response {
	return json({
		success: true,
		data,
		timestamp: new Date().toISOString(),
	} as Response, { status });
}

/**
 * Create an error JSON response from AppError
 */
export function errorResponse(error: AppError | Error, status?: number): Response {
	const statusCode = status || (isAppError(error) ? error.statusCode : 500);

	return json({
		success: false,
		error: {
			code: isAppError(error) ? error.code : 'INTERNAL_ERROR',
			message: error instanceof Error ? error.message : String(error),
			details: isAppError(error) ? error.details : undefined,
		},
		timestamp: new Date().toISOString(),
	} as Response, { status });
}

/**
 * Create a validation error response with field errors
 */
export function validationResponse(fieldErrors: Record<string, unknown>): Response {
	return json({
		success: false,
		error: {
			code: 'VALIDATION_ERROR',
			message: 'Validation failed',
			details: fieldErrors,
		},
		timestamp: new Date().toISOString(),
	}, { status: 422 });
}

/**
 * Create a generic error response
 */
export function genericErrorResponse(message: string, code = 'INTERNAL_ERROR', status = 500): Response {
	return json({
		success: false,
		error: {
			code,
			message,
		},
		timestamp: new Date().toISOString(),
	} as Response, { status });
}

/**
 * Create a not found error response
 */
export function notFoundResponse(resource = 'Resource'): Response {
	return json({
		success: false,
		error: {
			code: 'NOT_FOUND',
			message: `${resource} not found`,
		},
		timestamp: new Date().toISOString(),
	}, { status: 404 });
}

/**
 * Create a conflict error response
 */
export function conflictResponse(message: string, details?: Record<string, unknown>): Response {
	return json({
		success: false,
		error: {
			code: 'CONFLICT',
			message,
			details,
		},
		timestamp: new Date().toISOString(),
	}, { status: 409 });
}

/**
 * Create an unauthorized error response
 */
export function unauthorizedResponse(message = 'Authentication required'): Response {
	return json({
		success: false,
		error: {
			code: 'AUTH_ERROR',
			message,
		},
		timestamp: new Date().toISOString(),
	}, { status: 401 });
}

/**
 * Create a forbidden error response
 */
export function forbiddenResponse(message = 'Access denied'): Response {
	return json({
		success: false,
		error: {
			code: 'AUTHORIZATION_ERROR',
			message,
		},
		timestamp: new Date().toISOString(),
	}, { status: 403 });
}

/**
 * Create a rate limit error response
 */
export function rateLimitResponse(resetTimeSeconds?: number): Response {
	const message = resetTimeSeconds
		? `Too many requests. Please try again in ${Math.ceil(resetTimeSeconds / 60)} minutes.`
		: 'Rate limit exceeded';

	return json({
		success: false,
		error: {
			code: 'RATE_LIMIT',
			message,
		},
		timestamp: new Date().toISOString(),
	}, { status: 429 });
}

/**
 * Type guard for API route handlers
 */
export type ApiHandler = RequestHandler;
