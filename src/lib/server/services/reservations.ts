import { db } from '../db';
import { logger } from '$lib/server/logger';
import { eventSessions, reservations, payments } from '../db/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateAccessToken } from '$lib/utils/tokens';
import { createCheckoutSession } from './stripe';
import { events } from '../db/schema';
import { env } from '../env';
import type { CreateReservationInput, ReservationWithDetails } from '$lib/types/reservations';
import { validatePromoCode, calculateDiscountAmount, incrementRedemption } from './promo-codes';

/**
 * Create a reservation with atomic capacity locking
 * This prevents race conditions when multiple users book simultaneously
 */
export async function createReservation(input: CreateReservationInput) {
	// Validate honeypot
	if (input.honeypot && input.honeypot.trim() !== '') {
		throw new Error('Invalid submission');
	}

	// Track Checkout Session ID for cleanup in case of transaction failure
	let checkoutSessionId: string | null = null;

	try {
		return await db.transaction(async (tx: typeof db) => {
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
		const baseAmount = session.priceAmount * input.quantity;

		// Step 4a: Validate and apply promo code if provided
		let discountAmount = 0;
		let promotionCodeId: string | null = null;

		if (input.promoCode) {
			const promoResult = await validatePromoCode(input.promoCode, input.sessionId);
			if (!promoResult.valid) {
				throw new Error(`Invalid promotion code: ${promoResult.error}`);
			}
			discountAmount = calculateDiscountAmount(
				promoResult.discountType,
				promoResult.discountValue,
				baseAmount
			);
			promotionCodeId = promoResult.promotionCodeId;

			// Atomically claim the promo code slot
			await incrementRedemption(promotionCodeId, tx);
		}

		const totalAmount = baseAmount - discountAmount;

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
			notificationPreference: input.notificationPreference ?? 'both',
			quantity: input.quantity,
			totalAmount,
			currency: session.currency,
			status: 'pending',
			accessToken,
			expiresAt,
			ipAddress: input.ipAddress ?? null,
			userAgent: input.userAgent ?? null,
			promotionCodeId,
			discountAmount,
		}).returning();

		// Step 8: Load event title for checkout session product name
		const [event] = await tx
			.select({ titleEn: events.titleEn, slug: events.slug })
			.from(events)
			.where(eq(events.id, session.eventId));

		// Step 9: Create Stripe Checkout Session (hosted payment page)
		const checkoutSession = await createCheckoutSession({
			reservationId: reservation.id,
			accessToken,
			amount: totalAmount,
			currency: session.currency,
			quantity: input.quantity,
			productName: `${session.titleEn}${event ? ` — ${event.titleEn}` : ''}`,
			customerEmail: input.email,
			metadata: {
				reservationId: reservation.id,
				sessionId: session.id,
				guestEmail: input.email,
			},
			successUrl: `${env.PUBLIC_URL}/tickets/${accessToken}?success=true`,
			cancelUrl: event
				? `${env.PUBLIC_URL}/events/${event.slug}`
				: `${env.PUBLIC_URL}/events`,
			expiresAt,
		});

		// Store Checkout Session ID for potential cleanup
		checkoutSessionId = checkoutSession.id;

		// Step 10: Store payment record using checkout session ID as the identifier.
		// payment_intent is null at session creation time on this Stripe API version —
		// it is populated when checkout.session.completed fires and we update it then.
		await tx.insert(payments).values({
			reservationId: reservation.id,
			stripePaymentIntentId: checkoutSession.id, // placeholder; updated by webhook
			stripeClientSecret: null,
			amount: totalAmount,
			currency: session.currency,
			status: 'pending',
			idempotencyKey: `reservation-${reservation.id}`,
		});

		// Transaction commits here - capacity is locked, reservation created
		return {
			reservation,
			checkoutUrl: checkoutSession.url!,
			expiresAt,
		};
		});
	} catch (error) {
		// Transaction failed - clean up orphaned Checkout Session
		if (checkoutSessionId) {
			try {
				const { cancelCheckoutSession } = await import('./stripe');
				await cancelCheckoutSession(checkoutSessionId);
				logger.info(`[Reservation Cleanup] Cleaned up orphaned Checkout Session ${checkoutSessionId} after transaction failure`);
			} catch (cancelError) {
				logger.error({ err: cancelError, checkoutSessionId }, '[Reservation Cleanup] Failed to cancel orphaned Checkout Session');
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
							locationEn: true,
							locationFr: true,
							venueNameEn: true,
							venueNameFr: true,
							streetAddressEn: true,
							streetAddressFr: true,
							cityEn: true,
							cityFr: true,
							countryEn: true,
							countryFr: true,
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
							locationEn: true,
							locationFr: true,
							venueNameEn: true,
							venueNameFr: true,
							streetAddressEn: true,
							streetAddressFr: true,
							cityEn: true,
							cityFr: true,
							countryEn: true,
							countryFr: true,
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

	const sessionData = await db.transaction(async (tx: typeof db) => {
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
				availableCapacity: Math.min(session!.availableCapacity + reservation.quantity, session!.totalCapacity),
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
			logger.info(`[Waitlist] Notified for session ${sessionData.sessionId} with ${sessionData.quantity} tickets available`);
		} catch (error) {
			logger.error({ err: error }, '[Waitlist] Failed to notify');
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
	const sessionData = await db.transaction(async (tx: typeof db) => {
		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
			with: {
				payment: true,
			},
		});

		if (!reservation) {
			return null;
		}

		// Only expire pending reservations; any other terminal/non-pending status is a no-op
		if (reservation.status !== 'pending') {
			return null;
		}

		// Lock session and restore capacity
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, reservation.eventSessionId))
			.for('update');

		// Update reservation status
		await tx.update(reservations)
			.set({
				status: 'expired',
				updatedAt: new Date(),
			})
			.where(eq(reservations.id, reservationId));

		// Update payment status to failed for expired reservations
		if (reservation.payment) {
			await tx.update(payments)
				.set({
					status: 'failed',
					lastError: 'Reservation expired',
					updatedAt: new Date(),
				})
				.where(eq(payments.id, reservation.payment.id));
		}

		if (session) {
			await tx.update(eventSessions)
				.set({
					availableCapacity: Math.min(session.availableCapacity + reservation.quantity, session.totalCapacity),
					updatedAt: new Date(),
				})
				.where(eq(eventSessions.id, reservation.eventSessionId));

			// Return session data for waitlist notification after transaction
			return { sessionId: session.id, availableCapacity: reservation.quantity, allowWaitlist: session.allowWaitlist };
		}

		return null;
	});

	// Notify waitlist after transaction commits (if capacity was restored)
	if (sessionData && sessionData.allowWaitlist && sessionData.availableCapacity > 0) {
		try {
			const { notifyWaitlist } = await import('./waitlist');
			await notifyWaitlist(sessionData.sessionId, sessionData.availableCapacity);
			logger.info(`[Waitlist] Notified for session ${sessionData.sessionId} with ${sessionData.availableCapacity} tickets available`);
		} catch (error) {
			logger.error({ err: error }, '[Waitlist] Failed to notify');
			// Don't throw - expiration was successful
		}
	}
}

/**
 * Cancel reservation (without refund) - admin action
 */
export async function cancelReservation(reservationId: string) {
	return await db.transaction(async (tx: typeof db) => {
		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
		});

		if (!reservation) {
			throw new Error('Reservation not found');
		}

		if (reservation.status === 'cancelled') {
			throw new Error('Reservation is already cancelled');
		}

		// Lock session and restore capacity
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, reservation.eventSessionId))
			.for('update');

		if (!session) {
			throw new Error('Session not found');
		}

		await tx.update(eventSessions)
			.set({
				availableCapacity: session.availableCapacity + reservation.quantity,
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

		return { success: true, sessionId: session.id, quantity: reservation.quantity, allowWaitlist: session.allowWaitlist };
	});
}

/**
 * Process refund for a reservation - admin action
 */
export async function processRefund(reservationId: string) {
	const { createRefund } = await import('./stripe');

	const sessionData = await db.transaction(async (tx: typeof db) => {
		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
			with: { payment: true },
		});

		if (!reservation) {
			throw new Error('Reservation not found');
		}

		if (!reservation.payment) {
			throw new Error('Payment not found for this reservation');
		}

		if (reservation.payment.status !== 'succeeded') {
			throw new Error('Can only refund successful payments');
		}

		// Check if already fully refunded
		const alreadyRefunded = reservation.payment.refundedAmount || 0;
		if (alreadyRefunded >= reservation.payment.amount) {
			throw new Error('Payment has already been fully refunded');
		}

		// Calculate refund amount (partial refund if partially refunded)
		const refundAmount = reservation.payment.amount - alreadyRefunded;

		// Process refund via Stripe
		const refund = await createRefund(reservation.payment.stripePaymentIntentId, refundAmount);

		// Update payment status
		await tx.update(payments)
			.set({
				status: refundAmount >= reservation.payment.amount ? 'refunded' : 'partial_refund',
				refundedAmount: alreadyRefunded + refund.amount,
				updatedAt: new Date(),
			})
			.where(eq(payments.id, reservation.payment.id));

		// If not already cancelled, cancel the reservation
		if (reservation.status !== 'cancelled') {
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
			}

			// Update reservation status
			await tx.update(reservations)
				.set({
					status: 'cancelled',
					cancelledAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(reservations.id, reservationId));
		}

		return {
			success: true,
			refund,
			sessionId: reservation.eventSessionId,
			quantity: reservation.quantity,
			allowWaitlist: true // Will check below
		};
	});

	// Notify waitlist after transaction commits if capacity was restored
	// Note: We need to check if waitlist is enabled for the session
	const session = await db.query.eventSessions.findFirst({
		where: eq(eventSessions.id, sessionData.sessionId),
	});

	if (session?.allowWaitlist && sessionData.quantity > 0) {
		try {
			const { notifyWaitlist } = await import('./waitlist');
			await notifyWaitlist(sessionData.sessionId, sessionData.quantity);
			logger.info(`[Waitlist] Notified for session ${sessionData.sessionId} with ${sessionData.quantity} tickets available`);
		} catch (error) {
			logger.error({ err: error }, '[Waitlist] Failed to notify');
			// Don't throw - refund was successful
		}
	}

	return { success: true, refund: sessionData.refund };
}

/**
 * Send reminder email/SMS for a reservation - admin action
 */
export async function sendReservationReminder(reservationId: string) {
	const reservation = await getReservationById(reservationId);

	if (reservation.status !== 'confirmed') {
		throw new Error('Can only send reminders for confirmed reservations');
	}

	// Re-send ticket confirmation email
	const { sendTicketConfirmationEmail } = await import('./email');
	await sendTicketConfirmationEmail({
		reservation: reservation as any,
		session: reservation.eventSession as any,
		event: {
			title: reservation.eventSession.event.title,
			locationEn: reservation.eventSession.event.locationEn,
		},
		guestName: reservation.guestName,
		guestEmail: reservation.guestEmail,
		accessToken: reservation.accessToken,
	});

	// Send SMS if phone number exists and preference is not email-only
	if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
		try {
			const { sendTicketReminderSMS } = await import('./sms');
			await sendTicketReminderSMS({
				phone: reservation.guestPhone,
				name: reservation.guestName,
				eventTitle: reservation.eventSession.event.title,
				eventTime: reservation.eventSession.startTime,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send reminder SMS');
			// Don't throw - email might have been sent
		}
	}

	return { success: true };
}
