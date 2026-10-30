import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS } from '$lib/mock-data';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-guards';
import type { PageServerLoad, Actions } from './$types';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import { sql } from 'drizzle-orm';
import { cancellationPreFill, refundableAmount, type CancellationPreFill } from '$lib/utils/cancellation-refund';
import { EMPTY_MANUAL_REFUND_POLICY } from '$lib/utils/refund-policy';

/** Only an active Reservation gets the cancel screen's pre-fill. */
function isCancellable(status: string): boolean {
	return status !== 'cancelled' && status !== 'expired';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	// Carries Dietary Requirements (health data, issue 041): Admins only.
	requireAdmin(locals);
	if (env.USE_MOCK_DATA) {
		// Mock mode - find reservation by ID
		const reservation = MOCK_RESERVATIONS.find(r => r.id === params.id);

		if (!reservation) {
			throw error(404, 'Reservation not found');
		}

		// Find the session from MOCK_SESSIONS
		const session = MOCK_SESSIONS.find(s => s.id === reservation.eventSessionId);

		if (!session) {
			throw error(404, 'Session not found');
		}

		// Find the event from MOCK_EVENTS
		const event = MOCK_EVENTS.find(e => e.id === session.eventId);

		if (!event) {
			throw error(404, 'Event not found');
		}

		const mockPayment = {
			amount: reservation.totalAmount,
			refundedAmount: reservation.paymentStatus === 'refunded' ? reservation.totalAmount : null,
			status: reservation.paymentStatus,
		};
		// Mock Events carry no Refund Policy: an empty manual one.
		const cancellation: CancellationPreFill | null = isCancellable(reservation.status)
			? cancellationPreFill({
				policy: EMPTY_MANUAL_REFUND_POLICY,
				seatingStart: session.startTime,
				now: new Date(),
				refundable: refundableAmount(mockPayment),
			})
			: null;

		return {
			cancellation,
			reservation: {
				id: reservation.id,
				guestName: reservation.guestName,
				guestEmail: reservation.guestEmail,
				guestPhone: reservation.guestPhone,
				quantity: reservation.quantity,
				totalAmount: reservation.totalAmount,
				// Mock rows carry no Deposit/Balance split: balance-due.ts treats
				// them as paid in full online (Deposit = total, Balance = 0).
				depositAmount: (reservation as { depositAmount?: number }).depositAmount ?? null,
				balanceAmount: (reservation as { balanceAmount?: number }).balanceAmount ?? null,
				discountAmount: (reservation as { discountAmount?: number }).discountAmount ?? 0,
				currency: reservation.currency,
				status: reservation.status,
				isComp: (reservation as { isComp?: boolean }).isComp ?? false,
				dietaryRequirements: (reservation as { dietaryRequirements?: string | null }).dietaryRequirements ?? null,
				dietaryConsentAt: null as string | null,
				accessToken: reservation.accessToken,
				expiresAt: reservation.expiresAt,
				confirmedAt: reservation.confirmedAt,
				cancelledAt: reservation.cancelledAt,
				createdAt: reservation.createdAt,
				origin: ((reservation as { origin?: 'online' | 'staff' | 'walk_in' }).origin ?? 'online'),
				balanceSettledAt: null as string | null,
				balanceSettledByName: null as string | null,
				lastMovedAt: null as string | null,
				lastMovedByName: null as string | null,
				checkIns: [] as { id: string; guests: number; method: 'scan' | 'manual'; checkedInByName: string | null; checkedInAt: string; undoneAt: string | null; undoneByName: string | null }[],
				session: {
					titleEn: (session as any).titleEn || session.title,
					titleFr: (session as any).titleFr || session.title,
					startTime: session.startTime.toISOString(),
					endTime: session.endTime.toISOString(),
					event: {
						id: event.id,
						titleEn: event.titleEn,
						titleFr: (event as { titleFr?: string }).titleFr ?? event.titleEn,
						locationEn: event.locationEn,
						timeZone: event.timeZone,
						venueNameEn: event.venueNameEn,
						streetAddressEn: event.streetAddressEn,
						cityEn: event.cityEn,
						countryEn: event.countryEn
					}
				},
				payment: {
					status: reservation.paymentStatus,
					amount: reservation.totalAmount,
					currency: reservation.currency,
					stripePaymentIntentId: 'pi_mock_' + reservation.id,
					receiptUrl: null,
					refundedAmount: reservation.paymentStatus === 'refunded' ? reservation.totalAmount : null
				}
			}
		};
	}

	// Database mode - use actual database
	const { getReservationById } = await import('$lib/server/services/reservations');

	try {
		const reservation = await getReservationById(params.id);

		// Arrivals (issue 023): the Check-in history and who settled the Balance.
		const { checkInHistory } = await import('$lib/server/services/check-ins');
		const checkInsHistory = await checkInHistory(params.id);
		// Who settled the Balance and who last Moved it (issue 022), by name.
		const { users } = await import('$lib/server/db/schema');
		const { db } = await import('$lib/server/db');
		const { eq } = await import('drizzle-orm');
		const nameOf = async (userId: string | null): Promise<string | null> => {
			if (!userId) return null;
			const [user] = await db
				.select({ name: sql<string>`first_name || ' ' || last_name` })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			return user?.name ?? null;
		};
		const balanceSettledByName = await nameOf(reservation.balanceSettledBy);
		const lastMovedByName = await nameOf(reservation.lastMovedBy);

		// The cancel screen's pre-fill from the Event's Refund Policy (issue 028).
		let cancellation: CancellationPreFill | null = null;
		if (isCancellable(reservation.status)) {
			const { getCancellationQuote } = await import('$lib/server/services/cancellation');
			const quote = await getCancellationQuote(params.id);
			cancellation = {
				refundable: quote.refundable,
				policyType: quote.policyType,
				policyTextFr: quote.policyTextFr,
				suggestedAmount: quote.suggestedAmount,
				suggestedReasonFr: quote.suggestedReasonFr,
				germinalAmount: quote.germinalAmount,
				germinalReasonFr: quote.germinalReasonFr,
			};
		}

		return {
			cancellation,
			reservation: {
				id: reservation.id,
				guestName: reservation.guestName,
				guestEmail: reservation.guestEmail,
				guestPhone: reservation.guestPhone,
				quantity: reservation.quantity,
				totalAmount: reservation.totalAmount,
				depositAmount: reservation.depositAmount,
				balanceAmount: reservation.balanceAmount,
				discountAmount: reservation.discountAmount,
				currency: reservation.currency,
				status: reservation.status,
				isComp: reservation.isComp,
				// Dietary Requirements (issue 041): Admins only, with the consent instant.
				dietaryRequirements: reservation.dietaryRequirements,
				dietaryConsentAt: reservation.dietaryConsentAt?.toISOString() ?? null,
				accessToken: reservation.accessToken,
				expiresAt: reservation.expiresAt.toISOString(),
				confirmedAt: reservation.confirmedAt?.toISOString(),
				cancelledAt: reservation.cancelledAt?.toISOString(),
				createdAt: reservation.createdAt.toISOString(),
				origin: reservation.origin,
				balanceSettledAt: reservation.balanceSettledAt?.toISOString() ?? null,
				balanceSettledByName,
				lastMovedAt: reservation.lastMovedAt?.toISOString() ?? null,
				lastMovedByName,
				checkIns: checkInsHistory.map((c) => ({
					id: c.id,
					guests: c.guests,
					method: c.method,
					checkedInByName: c.checkedInByName,
					checkedInAt: c.checkedInAt.toISOString(),
					undoneAt: c.undoneAt?.toISOString() ?? null,
					undoneByName: c.undoneByName
				})),
				session: {
					...seatingTitlesWithFallback(reservation.eventSession, { timeZone: reservation.eventSession.event.timeZone }),
					startTime: reservation.eventSession.startTime.toISOString(),
					endTime: reservation.eventSession.endTime.toISOString(),
					event: reservation.eventSession.event
				},
				payment: reservation.payment ? {
					status: reservation.payment.status,
					amount: reservation.payment.amount,
					currency: reservation.payment.currency,
					stripePaymentIntentId: reservation.payment.stripePaymentIntentId,
					receiptUrl: reservation.payment.receiptUrl,
					refundedAmount: reservation.payment.refundedAmount
				} : null
			}
		};
	} catch (err) {
		throw error(404, 'Reservation not found');
	}
};

export const actions: Actions = {
	/**
	 * Cancel with the refund confirmed on the cancel screen (issue 028):
	 * `cancelledBy` = guest (the amount the Admin confirmed, pre-filled from
	 * the Refund Policy) or germinal (the whole refundable Deposit, whatever
	 * the amount sent). The amount is in major units ("12.50"); 0 cancels
	 * without refunding.
	 */
	cancel: async ({ params, request, locals }) => {
		requireAdmin(locals);

		const formData = await request.formData();
		const cancelledBy = formData.get('cancelledBy') === 'germinal' ? 'germinal' : 'guest';
		const amountRaw = formData.get('amount');

		let amount: number | undefined;
		if (cancelledBy === 'guest') {
			if (typeof amountRaw !== 'string' || amountRaw.trim() === '') {
				return fail(400, { error: 'Indiquez le montant à rembourser (0 pour aucun remboursement)' });
			}
			const { parseCurrency } = await import('$lib/utils/currency');
			try {
				amount = parseCurrency(amountRaw.trim().replace(',', '.'));
			} catch {
				return fail(400, { error: 'Montant à rembourser invalide' });
			}
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - just return success
			return { success: true, message: 'Réservation annulée (données fictives)' };
		}

		try {
			const { cancelWithRefund } = await import('$lib/server/services/cancellation');
			const result = await cancelWithRefund(params.id, { cancelledBy, amount });

			const { recordAuditLog } = await import('$lib/server/services/audit-log');
			await recordAuditLog({
				adminId: locals.user!.id,
				action: 'reservation.cancel',
				entityType: 'reservation',
				entityId: params.id,
				metadata: {
					cancelledBy: result.cancelledBy,
					suggestedAmount: result.suggestedAmount,
					appliedAmount: result.appliedAmount,
					refundable: result.refundable,
				},
			});

			const { formatCurrency } = await import('$lib/utils/currency');
			return {
				success: true,
				message: result.appliedAmount > 0
					? `Réservation annulée, ${formatCurrency(result.appliedAmount, result.currency, 'fr-FR')} remboursés`
					: 'Réservation annulée, sans remboursement'
			};
		} catch (err) {
			const { CancellationError } = await import('$lib/server/services/cancellation');
			if (err instanceof CancellationError) return fail(400, { error: err.message });
			const { logger } = await import('$lib/server/logger');
			logger.error({ err, reservationId: params.id }, 'Admin cancellation failed');
			return fail(400, { error: 'Échec de l’annulation de la réservation' });
		}
	},

	refund: async ({ params, request, locals }) => {
		requireAdmin(locals);

		// Optional partial refund amount, submitted as major currency units
		// (e.g. "25.00") and converted to cents. Omitted/blank means "refund
		// the full remaining balance" — the existing full-refund behavior.
		const formData = await request.formData();
		const amountRaw = formData.get('amount');

		let amount: number | undefined;
		if (typeof amountRaw === 'string' && amountRaw.trim() !== '') {
			const { parseCurrency } = await import('$lib/utils/currency');
			try {
				amount = parseCurrency(amountRaw);
			} catch {
				return fail(400, { error: 'Invalid refund amount' });
			}
			if (!Number.isFinite(amount) || amount <= 0) {
				return fail(400, { error: 'Refund amount must be greater than zero' });
			}
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - just return success
			return { success: true, message: 'Refund processed (mock)' };
		}

		try {
			const { processRefund } = await import('$lib/server/services/reservations');
			await processRefund(params.id, amount);

			const { recordAuditLog } = await import('$lib/server/services/audit-log');
			await recordAuditLog({
				adminId: locals.user!.id,
				action: 'reservation.refund',
				entityType: 'reservation',
				entityId: params.id,
				metadata: amount ? { amount } : null,
			});

			return {
				success: true,
				message: amount
					? `Partial refund of ${(amount / 100).toFixed(2)} processed successfully`
					: 'Refund processed successfully'
			};
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to process refund' });
		}
	},

	reminder: async ({ params, request, locals }) => {
		requireAdmin(locals);
		if (env.USE_MOCK_DATA) {
			// Mock mode - just return success
			return { success: true, message: 'Reminder sent (mock)' };
		}

		try {
			const { sendReservationReminder } = await import('$lib/server/services/reservations');
			await sendReservationReminder(params.id);
			return { success: true, message: 'Reminder sent successfully' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to send reminder' });
		}
	},
};
