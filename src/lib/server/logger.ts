import pino from 'pino';
import { env } from './env';
import { redactSensitiveData, redactError } from '$lib/utils/redaction';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Base logger configuration
 * In development: pretty-printed, colored logs
 * In production: JSON logs for log aggregation
 */
export const logger = pino({
	level: isDevelopment ? 'debug' : 'info',
	transport: isDevelopment
		? {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'HH:MM:ss',
					ignore: 'pid,hostname',
					singleLine: false,
				},
			}
		: undefined,
	formatters: {
		level: (label) => {
			return { level: label };
		},
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	serializers: {
		error: (err) => {
			const redacted = redactError(err);
			return {
				type: redacted.name,
				message: redacted.message,
				stack: redacted.stack,
			};
		},
		req: (req) => redactSensitiveData(req),
		res: (res) => redactSensitiveData(res),
	},
});

/**
 * Specialized loggers for different domains
 * Each has its own context for better filtering
 */
export const reservationLogger = logger.child({ domain: 'reservation' });
export const paymentLogger = logger.child({ domain: 'payment' });
export const emailLogger = logger.child({ domain: 'email' });
export const jobLogger = logger.child({ domain: 'jobs' });
export const webhookLogger = logger.child({ domain: 'webhook' });
export const waitlistLogger = logger.child({ domain: 'waitlist' });
export const adminLogger = logger.child({ domain: 'admin' });

/**
 * Helper function to log errors with context
 */
export function logError(
	loggerInstance: pino.Logger,
	error: Error,
	context?: Record<string, unknown>,
	message = 'An error occurred'
) {
	const redactedContext = context ? (redactSensitiveData(context) as Record<string, unknown>) : undefined;

	loggerInstance.error({
		err: {
			type: error.name,
			message: redactSensitiveData(error.message),
			stack: error.stack,
			...redactedContext,
		},
	},
	redactSensitiveData(message) as string
	);
}

/**
 * Helper function to log reservation lifecycle events
 */
export function logReservationEvent(
	event: 'created' | 'confirmed' | 'cancelled' | 'expired',
	data: {
		reservationId: string;
		sessionId: string;
		email: string;
		quantity: number;
		amount?: number;
	}
) {
	const level = event === 'created' ? 'info' : event === 'confirmed' ? 'info' : 'warn';

	reservationLogger[level]({
		event,
		reservationId: data.reservationId,
		sessionId: data.sessionId,
		email: redactSensitiveData(data.email),
		quantity: data.quantity,
		amount: data.amount,
	}, `Reservation ${event}: ${data.reservationId}`);
}

/**
 * Helper function to log payment events
 */
export function logPaymentEvent(
	event: 'created' | 'succeeded' | 'failed' | 'refunded',
	data: {
		reservationId: string;
		paymentIntentId: string;
		amount: number;
		currency: string;
		error?: string;
	}
) {
	const level = event === 'succeeded' ? 'info' : event === 'failed' ? 'error' : 'info';

	paymentLogger[level]({
		event,
		reservationId: redactSensitiveData(data.reservationId),
		paymentIntentId: redactSensitiveData(data.paymentIntentId),
		amount: data.amount,
		currency: data.currency,
		error: data.error,
	}, `Payment ${event}: ${data.paymentIntentId}`);
}
