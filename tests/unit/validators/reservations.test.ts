import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createReservationSchema } from '../../../src/lib/server/validators/reservations';

describe('createReservationSchema', () => {
	it('should validate correct reservation data', () => {
		const validData = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 2,
			phone: '+1234567890',
			honeypot: '',
		};

		const result = createReservationSchema.safeParse(validData);
		expect(result.success).toBe(true);
	});

	it('should reject invalid email', () => {
		const invalidData = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'invalid-email',
			name: 'John Doe',
			quantity: 1,
		};

		const result = createReservationSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it('should reject quantity less than 1', () => {
		const invalidData = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 0,
		};

		const result = createReservationSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it('should reject quantity greater than 10', () => {
		const invalidData = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 11,
		};

		const result = createReservationSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it('should reject honeypot field with content', () => {
		const invalidData = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 1,
			honeypot: 'spam',
		};

		const result = createReservationSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it('should require sessionId as UUID', () => {
		const invalidData = {
			sessionId: 'not-a-uuid',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 1,
		};

		const result = createReservationSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});
	describe('Dietary Requirements (issue 041)', () => {
		const base = {
			sessionId: '123e4567-e89b-12d3-a456-426614174000',
			email: 'test@example.com',
			name: 'John Doe',
			quantity: 2,
		};

		it('books without answering', () => {
			expect(createReservationSchema.safeParse(base).success).toBe(true);
			expect(createReservationSchema.safeParse({ ...base, dietaryRequirements: '  ' }).success).toBe(true);
		});

		it('accepts a filled answer with consent', () => {
			expect(
				createReservationSchema.safeParse({ ...base, dietaryRequirements: 'Sans gluten', dietaryConsent: true }).success
			).toBe(true);
		});

		it('refuses a filled answer without consent', () => {
			const result = createReservationSchema.safeParse({ ...base, dietaryRequirements: 'Sans gluten' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.dietaryConsent).toBeDefined();
			}
			expect(
				createReservationSchema.safeParse({ ...base, dietaryRequirements: 'Sans gluten', dietaryConsent: false }).success
			).toBe(false);
		});

		it('refuses an overly long answer', () => {
			expect(
				createReservationSchema.safeParse({ ...base, dietaryRequirements: 'x'.repeat(501), dietaryConsent: true }).success
			).toBe(false);
		});
	});
});
