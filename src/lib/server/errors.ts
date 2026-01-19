/**
 * Custom Error Classes for Germinal Application
 * Provides type-safe error handling with consistent error codes and HTTP status codes
 */

export class AppError extends Error {
	constructor(
		message: string,
		public code: string,
		public statusCode: number = 500,
		public details?: Record<string, unknown>
	) {
		super(message);
		this.name = this.constructor.name;
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			details: this.details,
		};
	}
}

export class NotFoundError extends AppError {
	constructor(message = 'Resource not found', details?: Record<string, unknown>) {
		super(message, 'NOT_FOUND', 404, details);
	}
}

export class ValidationError extends AppError {
	constructor(message = 'Validation failed', details?: Record<string, unknown>) {
		super(message, 'VALIDATION_ERROR', 400, details);
	}
}

export class ConflictError extends AppError {
	constructor(message = 'Resource conflict', details?: Record<string, unknown>) {
		super(message, 'CONFLICT', 409, details);
	}
}

export class AuthenticationError extends AppError {
	constructor(message = 'Authentication failed', details?: Record<string, unknown>) {
		super(message, 'AUTH_ERROR', 401, details);
	}
}

export class AuthorizationError extends AppError {
	constructor(message = 'Authorization failed', details?: Record<string, unknown>) {
		super(message, 'AUTHORIZATION_ERROR', 403, details);
	}
}

export class RateLimitError extends AppError {
	constructor(message = 'Rate limit exceeded', details?: Record<string, unknown>) {
		super(message, 'RATE_LIMIT', 429, details);
	}
}

export class PaymentError extends AppError {
	constructor(message = 'Payment failed', details?: Record<string, unknown>) {
		super(message, 'PAYMENT_ERROR', 400, details);
	}
}

export class CsrfError extends AppError {
	constructor(message = 'Invalid CSRF token', details?: Record<string, unknown>) {
		super(message, 'CSRF_ERROR', 403, details);
	}
}

export class DatabaseError extends AppError {
	constructor(message = 'Database operation failed', details?: Record<string, unknown>) {
		super(message, 'DATABASE_ERROR', 500, details);
	}
}

export class ExternalServiceError extends AppError {
	constructor(message = 'External service error', details?: Record<string, unknown>) {
		super(message, 'EXTERNAL_SERVICE_ERROR', 502, details);
	}
}

/**
 * Helper to determine if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

/**
 * Helper to get error code from any error
 */
export function getErrorCode(error: unknown): string {
	if (isAppError(error)) {
		return error.code;
	}
	return 'INTERNAL_ERROR';
}

/**
 * Helper to get HTTP status code from any error
 */
export function getErrorStatusCode(error: unknown): number {
	if (isAppError(error)) {
		return error.statusCode;
	}
	return 500;
}
