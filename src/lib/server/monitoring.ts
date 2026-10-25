import * as Sentry from '@sentry/node';
import { env } from './env';
import { logger } from './logger';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

/**
 * Initialize Sentry error tracking
 * Call this during application startup
 */
export function initMonitoring() {
	if (!env.SENTRY_DSN) {
		logger.info('⚠️  Sentry DSN not configured - monitoring disabled');
		return;
	}

	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: process.env.NODE_ENV || 'development',
		tracesSampleRate: 0.1, // Sample 10% of transactions for performance monitoring
		// No IPs, cookies or request bodies, whatever an integration would add
		sendDefaultPii: false,
		beforeBreadcrumb: scrubBreadcrumb,
		beforeSendTransaction: scrubEvent,
		beforeSend(event) {
			// Filter out expected errors
			if (event.exception?.values) {
				for (const exception of event.exception.values) {
					// Don't send validation errors to Sentry
					if (exception.type === 'ZodError') {
						return null;
					}
				}
			}

			return scrubEvent(event);
		},
		integrations: [
			Sentry.httpIntegration(),
			Sentry.onUncaughtExceptionIntegration(),
			Sentry.onUnhandledRejectionIntegration(),
		],
	});

	logger.info('✅ Sentry monitoring initialized');
}

/**
 * Capture an exception with additional context
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
	if (!env.SENTRY_DSN) {
		// Fallback to regular logging if Sentry is not configured
		logger.error({ err: error, ...context }, '[Error] Exception captured');
		return;
	}

	Sentry.captureException(error, {
		level: 'error',
		extra: context,
	});
}

/**
 * Capture a message with a given level
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>) {
	if (!env.SENTRY_DSN) {
		// Fallback to regular logging
		logger.info({ level, ...context }, message);
		return;
	}

	Sentry.captureMessage(message, {
		level,
		extra: context,
	});
}

/**
 * Set user context for logged errors
 */
export function setUserContext(user: { id: string; email?: string; role?: string }) {
	if (!env.SENTRY_DSN) return;

	Sentry.setUser({
		// The id is enough to find the user; no email leaves the server
		id: user.id,
		role: user.role,
	});
}

/**
 * Clear user context
 */
export function clearUserContext() {
	if (!env.SENTRY_DSN) return;

	Sentry.setUser(null);
}

/**
 * Add a breadcrumb to track what happened before an error
 */
export function addBreadcrumb(category: string, message: string, level?: 'info' | 'warning' | 'error', data?: Record<string, unknown>) {
	if (!env.SENTRY_DSN) return;

	Sentry.addBreadcrumb({
		category,
		message,
		level,
		data,
	});
}
