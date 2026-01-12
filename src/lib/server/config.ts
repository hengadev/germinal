import { env } from './env';

/**
 * Application configuration
 * Centralizes all magic numbers and configurable values
 */
export const config = {
	// Job intervals (in milliseconds)
	jobs: {
		sessionCleanupIntervalMs: 60 * 60 * 1000, // 1 hour
		reservationCleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
		emailQueueIntervalMs: 2 * 60 * 1000, // 2 minutes
	},

	// Reservation settings
	reservations: {
		maxTicketsPerReservation: 10,
		expiryMinutes: env.RESERVATION_EXPIRY_MINUTES,
		holdTimeWarningMinutes: 5, // Show warning when 5 min left
	},

	// Rate limiting
	rateLimit: {
		reservationWindowMs: 10 * 60 * 1000, // 10 minutes
		reservationMaxAttempts: 10,
		contactFormWindowMs: 60 * 60 * 1000, // 1 hour
		contactFormMaxAttempts: 5,
	},

	// Email queue settings
	email: {
		maxRetryAttempts: 3,
		retryBaseDelayMinutes: 5,
		batchSize: 10, // Process up to 10 emails at a time
	},

	// Payment settings
	payment: {
		supportedCurrencies: ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const,
	},

	// Database settings
	database: {
		statementTimeoutSeconds: 10,
		maxConnections: 10,
		connectionTimeoutSeconds: 10,
		idleTimeoutSeconds: 20,
	},

	// Event sessions
	eventSessions: {
		minCapacity: 1,
		maxCapacity: 10000,
	},
} as const;

/**
 * Type-safe config access
 */
export type AppConfig = typeof config;
