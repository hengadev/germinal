import { db } from '../db';
import { logger } from '$lib/server/logger';
import { eventSessions, reservations, payments } from '../db/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateAccessToken } from '$lib/utils/tokens';
import { createCheckoutSession } from './stripe';
import { events } from '../db/schema';
import { env } from '../env';
import type { CreateReservationInput, CreateCompReservationInput, ReservationWithDetails } from '$lib/types/reservations';
import { validatePromoCode, calculateDiscountAmount, incrementRedemption } from './promo-codes';

/**
 * Lock a Session row and atomically decrement its available capacity.
 *
 * This is the single source of truth for capacity accounting: both paid
 * (Guest checkout) and comp (Admin-initiated) Reservations MUST go through
 * this helper so capacity can never be oversold by paid and comp bookings
 * racing independently against the same Session.
 *
 * Must be called from within a `db.transaction`.
 */
async function lockAndDecrementSessionCapacity(
	tx: typeof db,
	sessionId: string,
	quantity: number
) {
	// Step 1: Lock session row and check availability
	const [session] = await tx
		.select()
		.from(eventSessions)
		.where(and(
			eq(eventSessions.id, sessionId),
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
	if (session.availableCapacity < quantity) {
		throw new Error('Not enough tickets available');
	}

	// Step 3: Decrement capacity atomically
	const [updatedSession] = await tx
		.update(eventSessions)
		.set({
			availableCapacity: sql`${eventSessions.availableCapacity} - ${quantity}`,
			updatedAt: new Date(),
		})
		.where(and(
			eq(eventSessions.id, sessionId),
			sql`${eventSessions.availableCapacity} >= ${quantity}` // Double-check in UPDATE
		))
		.returning();

	if (!updatedSession) {
		throw new Error('Failed to reserve tickets (race condition)');
	}

	return session;
}

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
		const session = await lockAndDecrementSessionCapacity(tx, input.sessionId, input.quantity);

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
 * Create a comp (complimentary) Reservation directly from the admin UI.
 *
 * Reuses the exact same capacity-locking transaction as a paying Guest's
 * checkout (`lockAndDecrementSessionCapacity`) so a comp booking and a
 * paid booking can never race each other into overselling a Session.
 *
 * Unlike a paid booking, no Stripe Checkout Session and no Payment record
 * are created — the Reservation is created directly with status
 * `confirmed` and `isComp: true`, which keeps it consistent with paid
 * Reservations for Ticket generation and capacity accounting, while
 * remaining distinguishable in admin views, CSV exports, and analytics.
 */
export async function createCompReservation(input: CreateCompReservationInput) {
	const created = await db.transaction(async (tx: typeof db) => {
		// Same capacity lock + decrement as a paid Guest booking.
		const session = await lockAndDecrementSessionCapacity(tx, input.sessionId, input.quantity);

		const accessToken = generateAccessToken();
		const now = new Date();

		// Comp reservations skip the pending -> Stripe Checkout -> webhook
		// confirmation flow entirely: created already `confirmed`, with no
		// Payment record (no money is ever collected) and no expiry countdown
		// (expiresAt only gates cleanup of `pending` reservations).
		const [reservation] = await tx.insert(reservations).values({
			eventSessionId: input.sessionId,
			guestEmail: input.email,
			guestName: input.name,
			guestPhone: input.phone ?? null,
			notificationPreference: input.notificationPreference ?? 'both',
			quantity: input.quantity,
			totalAmount: 0,
			currency: session.currency,
			status: 'confirmed',
			accessToken,
			expiresAt: now,
			confirmedAt: now,
			isComp: true,
		}).returning();

		const [event] = await tx
			.select({ titleEn: events.titleEn, slug: events.slug, locationEn: events.locationEn })
			.from(events)
			.where(eq(events.id, session.eventId));

		return { reservation, session, event };
	});

	// Issue the Ticket the same way a paying Guest's checkout success webhook
	// does — reusing the same email/QR-code path (handleCheckoutSuccess /
	// handlePaymentSuccess in ./payments.ts call this exact function).
	try {
		const { sendTicketConfirmationEmail } = await import('./email');
		await sendTicketConfirmationEmail({
			guestEmail: created.reservation.guestEmail,
			guestName: created.reservation.guestName,
			accessToken: created.reservation.accessToken,
			reservation: created.reservation,
			session: created.session,
			event: {
				title: created.event?.titleEn ?? '',
				slug: created.event?.slug ?? '',
				locationEn: created.event?.locationEn ?? '',
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send comp ticket confirmation email');
		// Don't throw - the reservation was created successfully; the ticket
		// is still reachable via its access token even if the email failed.
	}

	return { reservation: created.reservation };
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
						with: {
							coverMedia: true,
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
 * Look up a Guest's confirmed Reservations by email and re-send the Ticket
 * confirmation email for each one found.
 *
 * Deliberately returns void — callers must NOT branch on whether any
 * Reservations were found, since this powers the public "find my ticket"
 * lookup and revealing that would turn it into an email-enumeration oracle.
 * Any Reservation lookup/send failures are logged and swallowed for the
 * same reason.
 */
export async function resendTicketsForEmail(email: string): Promise<void> {
	let matches: ReservationWithDetails[] = [];

	try {
		matches = await db.query.reservations.findMany({
			where: and(
				eq(reservations.guestEmail, email),
				eq(reservations.status, 'confirmed')
			),
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
	} catch (error) {
		logger.error({ err: error }, '[FindTicket] Failed to look up reservations by email');
		return;
	}

	const { sendTicketConfirmationEmail } = await import('./email');

	for (const reservation of matches) {
		try {
			await sendTicketConfirmationEmail({
				reservation: reservation as any,
				session: reservation.eventSession as any,
				event: {
					title: reservation.eventSession.event.title,
					slug: reservation.eventSession.event.slug,
					locationEn: reservation.eventSession.event.locationEn,
				},
				guestName: reservation.guestName,
				guestEmail: reservation.guestEmail,
				accessToken: reservation.accessToken,
			});
		} catch (error) {
			logger.error(
				{ err: error, reservationId: reservation.id },
				'[FindTicket] Failed to resend ticket confirmation email'
			);
			// Continue with any other matching reservations rather than aborting the batch
		}
	}
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
 * Process refund for a reservation - admin action.
 *
 * By default refunds the full remaining refundable balance. Pass `amount`
 * (in cents) to issue a partial refund instead; it must be greater than
 * zero and no more than the remaining refundable balance.
 */
export async function processRefund(reservationId: string, amount?: number) {
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

		if (reservation.payment.status !== 'succeeded' && reservation.payment.status !== 'partially_refunded') {
			throw new Error('Can only refund successful payments');
		}

		// Check if already fully refunded
		const alreadyRefunded = reservation.payment.refundedAmount || 0;
		const remainingBalance = reservation.payment.amount - alreadyRefunded;
		if (remainingBalance <= 0) {
			throw new Error('Payment has already been fully refunded');
		}

		if (amount !== undefined) {
			if (!Number.isFinite(amount) || amount <= 0) {
				throw new Error('Refund amount must be greater than zero');
			}
			if (amount > remainingBalance) {
				throw new Error('Refund amount exceeds the remaining refundable balance');
			}
		}

		// Default to refunding the full remaining balance; otherwise refund
		// exactly the requested (already-validated) partial amount.
		const refundAmount = amount ?? remainingBalance;

		// Process refund via Stripe
		const refund = await createRefund(reservation.payment.stripePaymentIntentId, refundAmount);

		const newRefundedTotal = alreadyRefunded + refund.amount;

		// Update payment status
		await tx.update(payments)
			.set({
				status: newRefundedTotal >= reservation.payment.amount ? 'refunded' : 'partially_refunded',
				refundedAmount: newRefundedTotal,
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
