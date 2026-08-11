import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS } from '$lib/mock-data';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-guards';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
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

		return {
			reservation: {
				id: reservation.id,
				guestName: reservation.guestName,
				guestEmail: reservation.guestEmail,
				guestPhone: reservation.guestPhone,
				quantity: reservation.quantity,
				totalAmount: reservation.totalAmount,
				currency: reservation.currency,
				status: reservation.status,
				isComp: (reservation as { isComp?: boolean }).isComp ?? false,
				accessToken: reservation.accessToken,
				expiresAt: reservation.expiresAt,
				confirmedAt: reservation.confirmedAt,
				cancelledAt: reservation.cancelledAt,
				createdAt: reservation.createdAt,
				session: {
					titleEn: (session as any).titleEn || session.title,
					titleFr: (session as any).titleFr || session.title,
					startTime: session.startTime.toISOString(),
					endTime: session.endTime.toISOString(),
					event: {
						id: event.id,
						title: event.titleEn,
						slug: event.slug,
						location: event.location,
						venueName: event.venueName,
						streetAddress: event.streetAddress,
						city: event.city,
						country: event.country
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

		return {
			reservation: {
				id: reservation.id,
				guestName: reservation.guestName,
				guestEmail: reservation.guestEmail,
				guestPhone: reservation.guestPhone,
				quantity: reservation.quantity,
				totalAmount: reservation.totalAmount,
				currency: reservation.currency,
				status: reservation.status,
				isComp: reservation.isComp,
				accessToken: reservation.accessToken,
				expiresAt: reservation.expiresAt.toISOString(),
				confirmedAt: reservation.confirmedAt?.toISOString(),
				cancelledAt: reservation.cancelledAt?.toISOString(),
				createdAt: reservation.createdAt.toISOString(),
				session: {
					titleEn: reservation.eventSession.titleEn,
					titleFr: reservation.eventSession.titleFr,
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
	cancel: async ({ params, request, locals }) => {
		requireAdmin(locals);
		if (env.USE_MOCK_DATA) {
			// Mock mode - just return success
			return { success: true, message: 'Reservation cancelled (mock)' };
		}

		try {
			const { cancelReservation } = await import('$lib/server/services/reservations');
			await cancelReservation(params.id);
			return { success: true, message: 'Reservation cancelled successfully' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to cancel reservation' });
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
