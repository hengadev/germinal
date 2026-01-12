import { db } from '../db';
import { eventSessions, reservations, payments } from '../db/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateAccessToken } from '$lib/utils/tokens';
import { createPaymentIntent } from './stripe';
import { env } from '../env';
import type { CreateReservationInput, ReservationWithDetails } from '$lib/types/reservations';

/**
 * Create a reservation with atomic capacity locking
 * This prevents race conditions when multiple users book simultaneously
 */
export async function createReservation(input: CreateReservationInput) {
	// Validate honeypot
	if (input.honeypot && input.honeypot.trim() !== '') {
		throw new Error('Invalid submission');
	}

	// Track PaymentIntent ID for cleanup in case of transaction failure
	let paymentIntentId: string | null = null;

	try {
		return await db.transaction(async (tx) => {
		// Step 1: Lock session row and check availability
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(and(
				eq(eventSessions.id, input.sessionId),
				eq(eventSessions.published, true)
			))
			.for('update'); // CRITICAL: Row-level lock prevents concurrent modifications

		if (!session) {
			throw new Error('Session not found or not published');
		}

		// Check if session has already started
		if (session.startTime <= new Date()) {
			throw new Error('Cannot book tickets for a session that has already started');
		}

		// Step 2: Check availability
		if (session.availableCapacity < input.quantity) {
			throw new Error('Not enough tickets available');
		}

		// Step 3: Decrement capacity atomically
		const [updatedSession] = await tx
			.update(eventSessions)
			.set({
				availableCapacity: sql`${eventSessions.availableCapacity} - ${input.quantity}`,
				updatedAt: new Date(),
			})
			.where(and(
				eq(eventSessions.id, input.sessionId),
				sql`${eventSessions.availableCapacity} >= ${input.quantity}` // Double-check in UPDATE
			))
			.returning();

		if (!updatedSession) {
			throw new Error('Failed to reserve tickets (race condition)');
		}

		// Step 4: Calculate total amount (snapshot price at booking time)
		const totalAmount = session.priceAmount * input.quantity;

		// Step 5: Generate secure access token
		const accessToken = generateAccessToken();

		// Step 6: Calculate expiration time (15 minutes default)
		const expiryMinutes = env.RESERVATION_EXPIRY_MINUTES || 15;
		const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

		// Step 7: Create reservation record
		const [reservation] = await tx.insert(reservations).values({
			eventSessionId: input.sessionId,
			guestEmail: input.email,
			guestName: input.name,
			guestPhone: input.phone ?? null,
			quantity: input.quantity,
			totalAmount,
			currency: session.currency,
			status: 'pending',
			accessToken,
			expiresAt,
			ipAddress: input.ipAddress ?? null,
			userAgent: input.userAgent ?? null,
		}).returning();

		// Step 8: Create Stripe PaymentIntent
		const paymentIntent = await createPaymentIntent({
			reservationId: reservation.id,
			amount: totalAmount,
			currency: session.currency,
			metadata: {
				reservationId: reservation.id,
				sessionId: session.id,
				guestEmail: input.email,
			},
		});

		// Store PaymentIntent ID for potential cleanup
		paymentIntentId = paymentIntent.id;

		// Step 9: Store payment record
		await tx.insert(payments).values({
			reservationId: reservation.id,
			stripePaymentIntentId: paymentIntent.id,
			stripeClientSecret: paymentIntent.client_secret ?? null,
			amount: totalAmount,
			currency: session.currency,
			status: 'pending',
			idempotencyKey: `reservation-${reservation.id}`,
		});

		// Transaction commits here - capacity is locked, reservation created
		return {
			reservation,
			clientSecret: paymentIntent.client_secret,
			expiresAt,
		};
		});
	} catch (error) {
		// Transaction failed - clean up orphaned PaymentIntent
		if (paymentIntentId) {
			try {
				const { cancelPaymentIntent } = await import('./stripe');
				await cancelPaymentIntent(paymentIntentId);
				console.log(`[Reservation Cleanup] Cleaned up orphaned PaymentIntent ${paymentIntentId} after transaction failure`);
			} catch (cancelError) {
				console.error(`[Reservation Cleanup] Failed to cancel orphaned PaymentIntent ${paymentIntentId}:`, cancelError);
				// Log to monitoring system for manual cleanup - this PaymentIntent will need manual attention
				// Consider setting up an alert in your monitoring system
			}
		}
		throw error;
	}
}

/**
 * Get reservation by access token (for ticket display)
 */
export async function getReservationByToken(token: string): Promise<ReservationWithDetails | null> {
	const reservation = await db.query.reservations.findFirst({
		where: eq(reservations.accessToken, token),
		with: {
			eventSession: {
				with: {
					event: {
						columns: {
							id: true,
							title: true,
							slug: true,
							location: true,
							venueName: true,
							streetAddress: true,
							city: true,
							country: true,
						},
					},
				},
			},
			payment: true,
		},
	});

	return reservation ?? null;
}

/**
 * Get reservation by ID (for admin or status checks)
 */
export async function getReservationById(id: string): Promise<ReservationWithDetails> {
	const reservation = await db.query.reservations.findFirst({
		where: eq(reservations.id, id),
		with: {
			eventSession: {
				with: {
					event: {
						columns: {
							id: true,
							title: true,
							slug: true,
							location: true,
							venueName: true,
							streetAddress: true,
							city: true,
							country: true,
						},
					},
				},
			},
			payment: true,
		},
	});

	if (!reservation) {
		throw new Error('Reservation not found');
	}

	return reservation;
}

/**
 * Cancel reservation and refund (admin or user-initiated)
 */
export async function cancelReservationWithRefund(reservationId: string) {
	const { createRefund } = await import('./stripe');

	const sessionData = await db.transaction(async (tx) => {
		// Load reservation with payment
		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
			with: { payment: true },
		});

		if (!reservation) {
			throw new Error('Reservation not found');
		}

		if (reservation.status !== 'confirmed') {
			throw new Error('Only confirmed reservations can be cancelled');
		}

		if (!reservation.payment) {
			throw new Error('Payment not found for this reservation');
		}

		// Refund via Stripe
		const refund = await createRefund(reservation.payment.stripePaymentIntentId);

		// Update payment status
		await tx.update(payments)
			.set({
				status: 'refunded',
				refundedAmount: refund.amount,
				updatedAt: new Date(),
			})
			.where(eq(payments.id, reservation.payment.id));

		// Lock session and restore capacity
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, reservation.eventSessionId))
			.for('update');

		await tx.update(eventSessions)
			.set({
				availableCapacity: session!.availableCapacity + reservation.quantity,
				updatedAt: new Date(),
			})
			.where(eq(eventSessions.id, reservation.eventSessionId));

		// Update reservation status
		await tx.update(reservations)
			.set({
				status: 'cancelled',
				cancelledAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(reservations.id, reservationId));

		return { success: true, refund, sessionId: session!.id, quantity: reservation.quantity, allowWaitlist: session!.allowWaitlist };
	});

	// Notify waitlist after transaction commits (if waitlist is enabled)
	if (sessionData.allowWaitlist && sessionData.quantity > 0) {
		try {
			const { notifyWaitlist } = await import('./waitlist');
			await notifyWaitlist(sessionData.sessionId, sessionData.quantity);
			console.log(`[Waitlist] Notified for session ${sessionData.sessionId} with ${sessionData.quantity} tickets available`);
		} catch (error) {
			console.error('[Waitlist] Failed to notify:', error);
			// Don't throw - cancellation was successful
		}
	}

	return { success: true, refund: sessionData.refund };
}

/**
 * Find expired reservations for cleanup job
 */
export async function findExpiredReservations() {
	return await db.query.reservations.findMany({
		where: and(
			eq(reservations.status, 'pending'),
			lt(reservations.expiresAt, new Date())
		),
		with: {
			payment: true,
		},
	});
}

/**
 * Mark reservation as expired and restore capacity
 */
export async function expireReservation(reservationId: string) {
	const sessionData = await db.transaction(async (tx) => {
		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
		});

		if (!reservation) {
			return null;
		}

		// Lock session and restore capacity
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, reservation.eventSessionId))
			.for('update');

		if (session) {
			await tx.update(eventSessions)
				.set({
					availableCapacity: session.availableCapacity + reservation.quantity,
					updatedAt: new Date(),
				})
				.where(eq(eventSessions.id, reservation.eventSessionId));

			// Return session data for waitlist notification after transaction
			return { sessionId: session.id, availableCapacity: reservation.quantity, allowWaitlist: session.allowWaitlist };
		}

		// Update reservation status
		await tx.update(reservations)
			.set({
				status: 'expired',
				updatedAt: new Date(),
			})
			.where(eq(reservations.id, reservationId));

		return null;
	});

	// Notify waitlist after transaction commits (if capacity was restored)
	if (sessionData && sessionData.allowWaitlist && sessionData.availableCapacity > 0) {
		try {
			const { notifyWaitlist } = await import('./waitlist');
			await notifyWaitlist(sessionData.sessionId, sessionData.availableCapacity);
			console.log(`[Waitlist] Notified for session ${sessionData.sessionId} with ${sessionData.availableCapacity} tickets available`);
		} catch (error) {
			console.error('[Waitlist] Failed to notify:', error);
			// Don't throw - expiration was successful
		}
	}
}
