import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';
import { db } from '../db';
import { logger } from '$lib/server/logger';
import { eventSessions, reservations, payments } from '../db/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateAccessToken } from '$lib/utils/tokens';
import { createCheckoutSession } from './stripe';
import { events } from '../db/schema';
import { env } from '../env';
import type { CreateReservationInput, CreateCompReservationInput, Reservation, ReservationWithDetails } from '$lib/types/reservations';
import { validatePromoCode, incrementRedemption } from './promo-codes';
import { FULL_PAYMENT_DEPOSIT, depositRuleOf, priceReservation, type PromoDiscount } from '$lib/utils/pricing';
import { seatingTitle } from '$lib/utils/seating-title';
import { getSeatingPrice } from './service-pricing';
import { loadSeatingAccess } from './event-access';
import { ANONYMOUS, seatingBooking, type BookingRefusal } from '$lib/utils/event-access';

const BOOKING_REFUSAL_MESSAGES: Record<BookingRefusal, string> = {
	'event-not-published': 'Session not found or not published',
	'seating-unpublished': 'Session not found or not published',
	'not-priced': 'Seating has no price yet',
	started: 'Cannot book tickets for a session that has already started',
	'not-open': 'Bookings for this session are not open yet',
	closed: 'Bookings for this session are closed',
	full: 'Not enough tickets available',
};

/** Thrown when Event access refuses to book a Seating; `reason` says why. */
export class SeatingNotBookableError extends Error {
	constructor(
		public readonly reason: BookingRefusal,
		/** When bookings open, for a `not-open` refusal (Booking Window, 035). */
		public readonly opensAt: Date | null = null
	) {
		super(BOOKING_REFUSAL_MESSAGES[reason]);
		this.name = 'SeatingNotBookableError';
	}
}

/** Thrown when a Seating's Service has no price yet: it cannot be booked. */
export class SeatingNotPricedError extends SeatingNotBookableError {
	constructor() {
		super('not-priced');
		this.name = 'SeatingNotPricedError';
	}
}

/**
 * Atomically decrement a locked Seating's available capacity. The UPDATE
 * re-checks the capacity, so it can never go negative.
 */
async function decrementSessionCapacity(tx: typeof db, sessionId: string, quantity: number) {
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
}

/**
 * Lock a Seating a Guest is booking and decrement its capacity, once Event
 * access (issue 030) agrees it can be booked — re-checked here, inside the
 * locking transaction, walking Seating → Service → Day → Event, so a Seating
 * of an unpublished Event, an unpublished or unpriced Seating, a started or
 * a full one, or one outside its Booking Window (035) is refused even with
 * valid ids. Returns the Seating and the
 * price it is booked at.
 *
 * Must be called from within a `db.transaction`.
 */
async function lockAndDecrementBookableSeating(tx: typeof db, sessionId: string, quantity: number) {
	const found = await loadSeatingAccess(tx, sessionId, { lock: true });
	if (!found) {
		throw new SeatingNotBookableError('seating-unpublished');
	}

	// Booking is never wider for an Admin than for anyone (the Admin
	// preview of a Draft has booking disabled), so it is decided for the
	// anonymous viewer.
	const decision = seatingBooking({
		event: found.event,
		seating: found.access,
		viewer: ANONYMOUS,
		now: new Date(),
		seats: quantity,
	});
	if (!decision.bookable) {
		throw decision.reason === 'not-priced'
			? new SeatingNotPricedError()
			: new SeatingNotBookableError(decision.reason, decision.reason === 'not-open' ? decision.opensAt : null);
	}

	await decrementSessionCapacity(tx, sessionId, quantity);
	return { session: found.seating, price: found.price! };
}

/**
 * Lock a Session row and atomically decrement its available capacity, for
 * an Admin's comp Reservation.
 *
 * Shares the capacity accounting with the Guest checkout
 * ({@link lockAndDecrementBookableSeating}): both lock the Seating row and
 * decrement through {@link decrementSessionCapacity}, so capacity can never
 * be oversold by paid and comp bookings racing against the same Session.
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
	await decrementSessionCapacity(tx, sessionId, quantity);

	return session;
}

/**
 * What booking returns. `checkoutUrl` is where the Guest pays the Deposit;
 * it is `null` when there is no Deposit — the Reservation is then already
 * confirmed (no Checkout Session, no expiry) and the Guest goes straight to
 * their Ticket.
 */
export type CreateReservationResult = {
	reservation: Reservation;
	checkoutUrl: string | null;
	expiresAt: Date | null;
};

/**
 * Create a reservation with atomic capacity locking
 * This prevents race conditions when multiple users book simultaneously
 */
export async function createReservation(input: CreateReservationInput): Promise<CreateReservationResult> {
	// Validate honeypot
	if (input.honeypot && input.honeypot.trim() !== '') {
		throw new Error('Invalid submission');
	}

	// Track Checkout Session ID for cleanup in case of transaction failure
	let checkoutSessionId: string | null = null;

	let result: CreateReservationResult;
	try {
		result = await db.transaction(async (tx: typeof db) => {
		// Steps 1–3: Event access, then lock and decrement capacity. The
		// unit price (snapshot at booking time) is the Seating's Service
		// price (issue 022); a Service without a price yet is refused.
		const { session, price } = await lockAndDecrementBookableSeating(tx, input.sessionId, input.quantity);

		// Step 4a: Validate and claim the promo code if provided
		let discount: PromoDiscount | null = null;
		let promotionCodeId: string | null = null;

		if (input.promoCode) {
			const promoResult = await validatePromoCode(input.promoCode, input.sessionId);
			if (!promoResult.valid) {
				throw new Error(`Invalid promotion code: ${promoResult.error}`);
			}
			discount = { discountType: promoResult.discountType, discountValue: promoResult.discountValue };
			promotionCodeId = promoResult.promotionCodeId;

			// Atomically claim the promo code slot
			await incrementRedemption(promotionCodeId, tx);
		}

		// Step 4b: Price through Pricing (issue 023): the discount applies to
		// the meal, the Event's Deposit rule splits the discounted total into
		// the Deposit charged now and the Balance due at the venue.
		const [event] = await tx
			.select({
				titleEn: events.titleEn,
				titleFr: events.titleFr,
				id: events.id,
				timeZone: events.timeZone,
				depositType: events.depositType,
				depositValue: events.depositValue,
			})
			.from(events)
			.where(eq(events.id, session.eventId));

		const pricing = priceReservation({
			unitPrice: price.amount,
			seats: input.quantity,
			discount,
			deposit: event ? depositRuleOf(event) : FULL_PAYMENT_DEPOSIT,
		});

		// Step 5: Generate secure access token
		const accessToken = generateAccessToken();

		// No Deposit to collect (rule 'none', a zero price, or a 100 % Promo
		// Code): nothing goes through Stripe (issue 025). The Reservation is
		// confirmed right away — a regular paid-path booking, NOT comp — with
		// no Payment row; the Ticket is sent once the transaction commits.
		if (pricing.deposit === 0) {
			const now = new Date();
			const [reservation] = await tx.insert(reservations).values({
				eventSessionId: input.sessionId,
				guestEmail: input.email,
				guestName: input.name,
				guestPhone: input.phone ?? null,
				notificationPreference: input.notificationPreference ?? 'both',
				quantity: input.quantity,
				totalAmount: pricing.total,
				depositAmount: pricing.deposit,
				balanceAmount: pricing.balance,
				currency: price.currency,
				status: 'confirmed',
				accessToken,
				// expiresAt only gates cleanup of `pending` Reservations.
				expiresAt: now,
				confirmedAt: now,
				isComp: false,
				ipAddress: input.ipAddress ?? null,
				userAgent: input.userAgent ?? null,
				promotionCodeId,
				discountAmount: pricing.discount,
			}).returning();

			return { reservation, checkoutUrl: null, expiresAt: null };
		}

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
			totalAmount: pricing.total,
			depositAmount: pricing.deposit,
			balanceAmount: pricing.balance,
			currency: price.currency,
			status: 'pending',
			accessToken,
			expiresAt,
			ipAddress: input.ipAddress ?? null,
			userAgent: input.userAgent ?? null,
			promotionCodeId,
			discountAmount: pricing.discount,
		}).returning();

		// Step 8: Create Stripe Checkout Session (hosted payment page) for
		// the Deposit only — one line item whose amount is the Deposit, so
		// Stripe charges exactly that (the Promo Code is already in it). A
		// Deposit below the whole total is named as such.
		const seatingLabel = `${seatingTitle(session, 'en', { timeZone: event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE })}${event && (event.titleEn || event.titleFr) ? ` — ${event.titleEn || event.titleFr}` : ''}`;
		const checkoutSession = await createCheckoutSession({
			reservationId: reservation.id,
			accessToken,
			amount: pricing.deposit,
			currency: price.currency,
			quantity: input.quantity,
			productName: pricing.balance > 0
				? `Acompte / Deposit — ${seatingLabel} × ${input.quantity}`
				: seatingLabel,
			customerEmail: input.email,
			metadata: {
				reservationId: reservation.id,
				sessionId: session.id,
				guestEmail: input.email,
			},
			successUrl: `${env.PUBLIC_URL}/tickets/${accessToken}?success=true`,
			cancelUrl: event
				? `${env.PUBLIC_URL}/events/${event.id}`
				: `${env.PUBLIC_URL}/events`,
			expiresAt,
		});

		// Store Checkout Session ID for potential cleanup
		checkoutSessionId = checkoutSession.id;

		// Step 9: Store payment record (the Deposit charged) using checkout session ID as the identifier.
		// payment_intent is null at session creation time on this Stripe API version —
		// it is populated when checkout.session.completed fires and we update it then.
		await tx.insert(payments).values({
			reservationId: reservation.id,
			stripePaymentIntentId: checkoutSession.id, // placeholder; updated by webhook
			stripeClientSecret: null,
			amount: pricing.deposit,
			currency: price.currency,
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

	// Confirmed without Stripe (no Deposit): send the Ticket now that the
	// booking is committed, as the Stripe webhook does for a paid one. A
	// failure is logged and never undoes the booking.
	if (result.checkoutUrl === null) {
		await sendConfirmedTicket(result.reservation.id);
	}

	return result;
}

/** Load a committed, confirmed Reservation with its Seating and Event and
 * send its Ticket. Never throws. */
async function sendConfirmedTicket(reservationId: string) {
	try {
		const reservation = await db.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
			with: { eventSession: { with: { event: true } } },
		});
		if (!reservation) return;
		const { sendTicketNotifications } = await import('./ticket-notifications');
		await sendTicketNotifications(reservation);
	} catch (error) {
		logger.error({ err: error, reservationId }, 'Failed to send the Ticket for a booking with no Deposit');
	}
}

/**
 * Create a comp (complimentary) Reservation directly from the admin UI.
 *
 * Locks the Seating row and decrements its capacity the same way as a
 * paying Guest's checkout (`lockAndDecrementSessionCapacity`) so a comp
 * booking and a paid booking can never race each other into overselling a
 * Session.
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
		// Nothing is charged; the currency follows the Seating's price
		// (EUR while its Service has none yet).
		const price = await getSeatingPrice(tx, session.id);

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
			// Nothing to collect: no Deposit, no Balance.
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			currency: price?.currency ?? 'EUR',
			status: 'confirmed',
			accessToken,
			expiresAt: now,
			confirmedAt: now,
			isComp: true,
		}).returning();

		const [event] = await tx
			.select({ titleEn: events.titleEn, titleFr: events.titleFr, id: events.id, locationEn: events.locationEn, timeZone: events.timeZone })
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
				titleEn: created.event?.titleEn ?? '',
				titleFr: created.event?.titleFr ?? '',
				id: created.event?.id ?? '',
				locationEn: created.event?.locationEn ?? '',
				timeZone: created.event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE,
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
							titleEn: true,
							titleFr: true,
							locationEn: true,
							timeZone: true,
							locationFr: true,
							venueNameEn: true,
							venueNameFr: true,
							streetAddressEn: true,
							streetAddressFr: true,
							cityEn: true,
							cityFr: true,
							countryEn: true,
							countryFr: true,
							// The Refund Policy shown on the Ticket (issue 027).
							refundPolicyType: true,
							refundPolicyTextEn: true,
							refundPolicyTextFr: true,
							refundPolicyTiers: true,
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
								titleEn: true,
								titleFr: true,
								locationEn: true,
								timeZone: true,
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
					titleEn: reservation.eventSession.event.titleEn,
					titleFr: reservation.eventSession.event.titleFr,
					id: reservation.eventSession.event.id,
					locationEn: reservation.eventSession.event.locationEn,
					timeZone: reservation.eventSession.event.timeZone,
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
							titleEn: true,
							titleFr: true,
							locationEn: true,
							timeZone: true,
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
			with: {
				payment: true,
				eventSession: { with: { event: true } },
			},
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

		return {
			success: true,
			refund,
			sessionId: session!.id,
			quantity: reservation.quantity,
			allowWaitlist: session!.allowWaitlist,
			guestEmail: reservation.guestEmail,
			guestName: reservation.guestName,
			guestPhone: reservation.guestPhone,
			notificationPreference: reservation.notificationPreference,
			eventTitle: reservation.eventSession.event.titleEn,
			sessionTitle: seatingTitle(reservation.eventSession, 'en', { timeZone: reservation.eventSession.event.timeZone }),
			sessionStartTime: reservation.eventSession.startTime,
			timeZone: reservation.eventSession.event.timeZone,
			refundCurrency: reservation.payment.currency,
		};
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

	// Notify the guest after the transaction commits — never notify from
	// inside a transaction that might still roll back. This is always a
	// full refund (createRefund is called with no amount above), so the
	// guest gets the combined cancellation + refund notification.
	try {
		const { sendRefundEmail } = await import('./email');
		await sendRefundEmail({
			guestEmail: sessionData.guestEmail,
			guestName: sessionData.guestName,
			eventTitle: sessionData.eventTitle,
			sessionTitle: sessionData.sessionTitle,
			sessionStartTime: sessionData.sessionStartTime,
			timeZone: sessionData.timeZone,
			reservationId,
			amount: sessionData.refund.amount,
			currency: sessionData.refundCurrency,
			isPartialRefund: false,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send refund email');
		// Don't throw - refund was successful
	}

	if (sessionData.guestPhone && sessionData.notificationPreference !== 'email') {
		try {
			const { sendRefundSMS } = await import('./sms');
			await sendRefundSMS({
				phone: sessionData.guestPhone,
				name: sessionData.guestName,
				eventTitle: sessionData.eventTitle,
				amount: sessionData.refund.amount,
				currency: sessionData.refundCurrency,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send refund SMS');
			// Don't throw - email might have been sent
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
	const result = await db.transaction(async (tx: typeof db) => {
		// Serialise concurrent cancellations of this Reservation.
		await tx.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, reservationId)).for('update');

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

		// Look up the event title for the cancellation notification
		const [event] = await tx
			.select({ titleEn: events.titleEn, timeZone: events.timeZone })
			.from(events)
			.where(eq(events.id, session.eventId));

		return {
			success: true,
			sessionId: session.id,
			quantity: reservation.quantity,
			allowWaitlist: session.allowWaitlist,
			guestEmail: reservation.guestEmail,
			guestName: reservation.guestName,
			guestPhone: reservation.guestPhone,
			notificationPreference: reservation.notificationPreference,
			eventTitle: event?.titleEn ?? '',
			sessionTitle: seatingTitle(session, 'en', { timeZone: event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE }),
			sessionStartTime: session.startTime,
			timeZone: event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE,
		};
	});

	// Notify the guest after the transaction commits — never notify from
	// inside a transaction that might still roll back.
	try {
		const { sendCancellationEmail } = await import('./email');
		await sendCancellationEmail({
			guestEmail: result.guestEmail,
			guestName: result.guestName,
			eventTitle: result.eventTitle,
			sessionTitle: result.sessionTitle,
			sessionStartTime: result.sessionStartTime,
			timeZone: result.timeZone,
			reservationId,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send cancellation email');
		// Don't throw - cancellation was successful
	}

	if (result.guestPhone && result.notificationPreference !== 'email') {
		try {
			const { sendCancellationSMS } = await import('./sms');
			await sendCancellationSMS({
				phone: result.guestPhone,
				name: result.guestName,
				eventTitle: result.eventTitle,
				sessionStartTime: result.sessionStartTime,
				timeZone: result.timeZone,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send cancellation SMS');
			// Don't throw - email might have been sent
		}
	}

	return { success: true, sessionId: result.sessionId, quantity: result.quantity, allowWaitlist: result.allowWaitlist };
}

/**
 * Process refund for a reservation - admin action.
 *
 * By default refunds the full remaining refundable balance. Pass `amount`
 * (in cents) to issue a partial refund instead; it must be greater than
 * zero and no more than the remaining refundable balance.
 */
export async function processRefund(
	reservationId: string,
	amount?: number,
	options: {
		/** Refuse a Reservation that is already cancelled (a cancellation
		 * with refund, issue 028) instead of refunding it again. */
		cancelling?: boolean;
	} = {}
) {
	const { createRefund } = await import('./stripe');

	const sessionData = await db.transaction(async (tx: typeof db) => {
		// Serialise concurrent cancellations/refunds of this Reservation.
		await tx.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, reservationId)).for('update');

		const reservation = await tx.query.reservations.findFirst({
			where: eq(reservations.id, reservationId),
			with: {
				payment: true,
				eventSession: { with: { event: true } },
			},
		});

		if (!reservation) {
			throw new Error('Reservation not found');
		}

		if (options.cancelling && reservation.status === 'cancelled') {
			throw new Error('Reservation is already cancelled');
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
			allowWaitlist: true, // Will check below
			guestEmail: reservation.guestEmail,
			guestName: reservation.guestName,
			guestPhone: reservation.guestPhone,
			notificationPreference: reservation.notificationPreference,
			eventTitle: reservation.eventSession.event.titleEn,
			sessionTitle: seatingTitle(reservation.eventSession, 'en', { timeZone: reservation.eventSession.event.timeZone }),
			sessionStartTime: reservation.eventSession.startTime,
			timeZone: reservation.eventSession.event.timeZone,
			refundCurrency: reservation.payment.currency,
			newRefundedTotal,
			paymentAmount: reservation.payment.amount,
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

	// Notify the guest after the transaction commits — never notify from
	// inside a transaction that might still roll back.
	try {
		const { sendRefundEmail } = await import('./email');
		await sendRefundEmail({
			guestEmail: sessionData.guestEmail,
			guestName: sessionData.guestName,
			eventTitle: sessionData.eventTitle,
			sessionTitle: sessionData.sessionTitle,
			sessionStartTime: sessionData.sessionStartTime,
			timeZone: sessionData.timeZone,
			reservationId,
			amount: sessionData.refund.amount,
			currency: sessionData.refundCurrency,
			isPartialRefund: sessionData.newRefundedTotal < sessionData.paymentAmount,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send refund email');
		// Don't throw - refund was successful
	}

	if (sessionData.guestPhone && sessionData.notificationPreference !== 'email') {
		try {
			const { sendRefundSMS } = await import('./sms');
			await sendRefundSMS({
				phone: sessionData.guestPhone,
				name: sessionData.guestName,
				eventTitle: sessionData.eventTitle,
				amount: sessionData.refund.amount,
				currency: sessionData.refundCurrency,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send refund SMS');
			// Don't throw - email might have been sent
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
			titleEn: reservation.eventSession.event.titleEn,
			titleFr: reservation.eventSession.event.titleFr,
			id: reservation.eventSession.event.id,
			locationEn: reservation.eventSession.event.locationEn,
			timeZone: reservation.eventSession.event.timeZone,
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
				eventTitle: reservation.eventSession.event.titleEn,
				eventTime: reservation.eventSession.startTime,
				timeZone: reservation.eventSession.event.timeZone,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send reminder SMS');
			// Don't throw - email might have been sent
		}
	}

	return { success: true };
}
