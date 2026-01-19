import { describe, it, expect } from 'vitest';
import {
	AppError,
	NotFoundError,
	ValidationError,
	ConflictError,
	AuthenticationError,
	AuthorizationError,
	RateLimitError,
	PaymentError,
	CsrfError,
	DatabaseError,
	ExternalServiceError,
	isAppError,
	getErrorCode,
	getErrorStatusCode,
} from '../../../src/lib/server/errors';

describe('Custom Error Classes', () => {
	describe('AppError', () => {
		it('should create error with all properties', () => {
			const error = new AppError('Test error', 'TEST_ERROR', 500, { key: 'value' });

			expect(error.message).toBe('Test error');
			expect(error.code).toBe('TEST_ERROR');
			expect(error.statusCode).toBe(500);
			expect(error.details).toEqual({ key: 'value' });
		});

		it('should serialize to JSON correctly', () => {
			const error = new AppError('Test error', 'TEST_ERROR', 500);

			const json = error.toJSON();
			expect(json).toEqual({
				code: 'TEST_ERROR',
				message: 'Test error',
			});
		});
	});

	describe('NotFoundError', () => {
		it('should have correct status code', () => {
			const error = new NotFoundError();

			expect(error.statusCode).toBe(404);
			expect(error.code).toBe('NOT_FOUND');
		});

		it('should use custom message', () => {
			const error = new NotFoundError('Custom not found');

			expect(error.message).toBe('Custom not found');
		});
	});

	describe('ValidationError', () => {
		it('should have correct status code', () => {
			const error = new ValidationError();

			expect(error.statusCode).toBe(400);
			expect(error.code).toBe('VALIDATION_ERROR');
		});
	});

	describe('ConflictError', () => {
		it('should have correct status code', () => {
			const error = new ConflictError();

			expect(error.statusCode).toBe(409);
			expect(error.code).toBe('CONFLICT');
		});
	});

	describe('AuthenticationError', () => {
		it('should have correct status code', () => {
			const error = new AuthenticationError();

			expect(error.statusCode).toBe(401);
			expect(error.code).toBe('AUTH_ERROR');
		});
	});

	describe('AuthorizationError', () => {
		it('should have correct status code', () => {
			const error = new AuthorizationError();

			expect(error.statusCode).toBe(403);
			expect(error.code).toBe('AUTHORIZATION_ERROR');
		});
	});

	describe('RateLimitError', () => {
		it('should have correct status code', () => {
			const error = new RateLimitError();

			expect(error.statusCode).toBe(429);
			expect(error.code).toBe('RATE_LIMIT');
		});
	});

	describe('PaymentError', () => {
		it('should have correct status code', () => {
			const error = new PaymentError();

			expect(error.statusCode).toBe(400);
			expect(error.code).toBe('PAYMENT_ERROR');
		});
	});

	describe('CsrfError', () => {
		it('should have correct status code', () => {
			const error = new CsrfError();

			expect(error.statusCode).toBe(403);
			expect(error.code).toBe('CSRF_ERROR');
		});
	});

	describe('DatabaseError', () => {
		it('should have correct status code', () => {
			const error = new DatabaseError();

			expect(error.statusCode).toBe(500);
			expect(error.code).toBe('DATABASE_ERROR');
		});
	});

	describe('ExternalServiceError', () => {
		it('should have correct status code', () => {
			const error = new ExternalServiceError();

			expect(error.statusCode).toBe(502);
			expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
		});
	});

	describe('Helper Functions', () => {
		it('should identify AppError instances', () => {
			const appError = new NotFoundError();
			expect(isAppError(appError)).toBe(true);
		});

		it('should reject non-AppError instances', () => {
			const regularError = new Error('Regular error');
			expect(isAppError(regularError)).toBe(false);
			expect(isAppError(null)).toBe(false);
			expect(isAppError(undefined)).toBe(false);
		});

		it('should get error code from AppError', () => {
			const error = new ConflictError('Test', { detail: 'value' });
			expect(getErrorCode(error)).toBe('CONFLICT');
		});

		it('should return INTERNAL_ERROR for non-AppError', () => {
			const error = new Error('Regular error');
			expect(getErrorCode(error)).toBe('INTERNAL_ERROR');
		});

		it('should get status code from AppError', () => {
			const error = new ValidationError('Test', { detail: 'value' });
			expect(getErrorStatusCode(error)).toBe(400);
		});

		it('should return 500 for non-AppError', () => {
			const error = new Error('Regular error');
			expect(getErrorStatusCode(error)).toBe(500);
		});
	});
});
