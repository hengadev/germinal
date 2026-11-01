// Issue 042 — « À traiter »: every Reservation whose money needs an Admin.
// A read-only service: each alert is computed from current data, so it
// disappears once its cause is fixed. Later issues add other kinds; keep
// one query per kind in moneyAlerts, and moneyAlertCounts just counts.

import { and, asc, eq, inArray, isNull, like, lt, notLike, or } from 'drizzle-orm';
import { db } from '../db';
import { disputes, events, eventSessions, payments, reservations } from '../db/schema';
import { env } from '../env';
import { formatCurrency } from '$lib/utils/currency';
import { formatSeatingDateTime } from '$lib/utils/event-time';

/** The alert kinds, in display order. Later issues add kinds here. */
export type MoneyAlertKind =
	| 'refund_failed'
	| 'paid_without_seat'
	| 'refunded_but_active'
	| 'dispute_open';

export interface MoneyAlert {
	kind: MoneyAlertKind;
	reservationId: string;
	guestName: string;
	eventTitle: string;
	seatingStart: Date;
	/** Minor units of the amount still owed to the Guest. */
	amount: number;
	currency: string;
	detail: string;
	href: string;
}

export interface MoneyAlertCounts {
	total: number;
	byKind: Partial<Record<MoneyAlertKind, number>>;
}

/**
 * refund_failed: a cancelled Reservation whose Payment records a refused
 * refund (« Refund failed: … » written by the refund-after-cancellation
 * path) and is not refunded up to the Deposit paid. The link goes to the
 * Reservation's Admin page, whose refund action refunds by hand.
 */
async function refundFailedAlerts(): Promise<MoneyAlert[]> {
	type Row = {
		paymentId: string;
		reservationId: string;
		guestName: string;
		eventTitle: string | null;
		eventTitleEn: string;
		seatingStart: Date;
		amount: number;
		refundedAmount: number;
		currency: string;
		lastError: string | null;
	};
	const rows: Row[] = await db
		.select({
			paymentId: payments.id,
			reservationId: reservations.id,
			guestName: reservations.guestName,
			eventTitle: events.titleFr,
			eventTitleEn: events.titleEn,
			seatingStart: eventSessions.startTime,
			amount: payments.amount,
			refundedAmount: payments.refundedAmount,
			currency: payments.currency,
			lastError: payments.lastError
		})
		.from(payments)
		.innerJoin(reservations, eq(payments.reservationId, reservations.id))
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(
			and(
				eq(reservations.status, 'cancelled'),
				like(payments.lastError, 'Refund failed:%'),
				lt(payments.refundedAmount, payments.amount)
			)
		);

	return rows
		.map((row) => ({
			kind: 'refund_failed' as const,
			reservationId: row.reservationId,
			guestName: row.guestName,
			// The back office is French (CONTEXT.md); fall back to English.
			eventTitle: row.eventTitle || row.eventTitleEn,
			seatingStart: row.seatingStart,
			amount: row.amount - row.refundedAmount,
			currency: row.currency,
			detail: row.lastError ?? '',
			href: `/admin/reservations/${row.reservationId}`
		}))
		.sort((a: MoneyAlert, b: MoneyAlert) => a.seatingStart.getTime() - b.seatingStart.getTime());
}

/**
 * paid_without_seat: a succeeded (or partially refunded) Payment on an
 * expired or cancelled Reservation that is not fully refunded. The
 * late-payment path refunds these automatically, so this only appears
 * when that refund failed. The Admin refunds by hand on the
 * Reservation's Admin page.
 */
async function paidWithoutSeatAlerts(): Promise<MoneyAlert[]> {
	type Row = {
		reservationId: string;
		guestName: string;
		eventTitle: string | null;
		eventTitleEn: string;
		timeZone: string;
		seatingStart: Date;
		amount: number;
		refundedAmount: number;
		currency: string;
		paidAt: Date | null;
		createdAt: Date;
	};
	const rows: Row[] = await db
		.select({
			reservationId: reservations.id,
			guestName: reservations.guestName,
			eventTitle: events.titleFr,
			eventTitleEn: events.titleEn,
			timeZone: events.timeZone,
			seatingStart: eventSessions.startTime,
			amount: payments.amount,
			refundedAmount: payments.refundedAmount,
			currency: payments.currency,
			paidAt: payments.webhookProcessedAt,
			createdAt: payments.createdAt
		})
		.from(payments)
		.innerJoin(reservations, eq(payments.reservationId, reservations.id))
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(
			and(
				inArray(payments.status, ['succeeded', 'partially_refunded']),
				inArray(reservations.status, ['expired', 'cancelled']),
				lt(payments.refundedAmount, payments.amount),
				// Those are the refund_failed alerts: don't list them twice.
				or(isNull(payments.lastError), notLike(payments.lastError, 'Refund failed:%'))
			)
		);

	return rows
		.map((row) => ({
			kind: 'paid_without_seat' as const,
			reservationId: row.reservationId,
			guestName: row.guestName,
			eventTitle: row.eventTitle || row.eventTitleEn,
			seatingStart: row.seatingStart,
			amount: row.amount - row.refundedAmount,
			currency: row.currency,
			detail: `Payé le ${formatSeatingDateTime(row.paidAt ?? row.createdAt, row.timeZone, 'fr')}`,
			href: `/admin/reservations/${row.reservationId}`
		}))
		.sort((a: MoneyAlert, b: MoneyAlert) => a.seatingStart.getTime() - b.seatingStart.getTime());
}

/**
 * refunded_but_active: a Payment refunded in full (usually by hand in the
 * Stripe dashboard) on a still-confirmed Reservation: its seats stay
 * taken and its Ticket still scans. The Admin cancels the Reservation
 * from its Admin page.
 */
async function refundedButActiveAlerts(): Promise<MoneyAlert[]> {
	type Row = {
		reservationId: string;
		guestName: string;
		eventTitle: string | null;
		eventTitleEn: string;
		seatingStart: Date;
		refundedAmount: number;
		currency: string;
	};
	const rows: Row[] = await db
		.select({
			reservationId: reservations.id,
			guestName: reservations.guestName,
			eventTitle: events.titleFr,
			eventTitleEn: events.titleEn,
			seatingStart: eventSessions.startTime,
			refundedAmount: payments.refundedAmount,
			currency: payments.currency
		})
		.from(payments)
		.innerJoin(reservations, eq(payments.reservationId, reservations.id))
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(
			and(
				eq(payments.status, 'refunded'),
				eq(reservations.status, 'confirmed')
			)
		);

	return rows
		.map((row) => ({
			kind: 'refunded_but_active' as const,
			reservationId: row.reservationId,
			guestName: row.guestName,
			eventTitle: row.eventTitle || row.eventTitleEn,
			seatingStart: row.seatingStart,
			amount: row.refundedAmount,
			currency: row.currency,
			detail: `Remboursé : ${formatCurrency(row.refundedAmount, row.currency, 'fr-FR')}`,
			href: `/admin/reservations/${row.reservationId}`
		}))
		.sort((a: MoneyAlert, b: MoneyAlert) => a.seatingStart.getTime() - b.seatingStart.getTime());
}

/** The dispute's Stripe dashboard URL (with /test in test mode). */
function stripeDisputeUrl(stripeDisputeId: string): string {
	const prefix = env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? '/test' : '';
	return `https://dashboard.stripe.com${prefix}/disputes/${stripeDisputeId}`;
}

/**
 * dispute_open: a Stripe dispute awaiting a response (needs_response,
 * warning_needs_response), soonest evidence deadline first. Disputes under
 * review, won, lost or closed are not alerts.
 */
async function disputeOpenAlerts(): Promise<MoneyAlert[]> {
	type Row = {
		reservationId: string;
		guestName: string;
		eventTitle: string | null;
		eventTitleEn: string;
		timeZone: string;
		seatingStart: Date;
		amount: number;
		currency: string;
		reason: string | null;
		evidenceDueBy: Date | null;
		stripeDisputeId: string;
	};
	const rows: Row[] = await db
		.select({
			reservationId: reservations.id,
			guestName: reservations.guestName,
			eventTitle: events.titleFr,
			eventTitleEn: events.titleEn,
			timeZone: events.timeZone,
			seatingStart: eventSessions.startTime,
			amount: disputes.amount,
			currency: disputes.currency,
			reason: disputes.reason,
			evidenceDueBy: disputes.evidenceDueBy,
			stripeDisputeId: disputes.stripeDisputeId
		})
		.from(disputes)
		.innerJoin(payments, eq(disputes.paymentId, payments.id))
		.innerJoin(reservations, eq(payments.reservationId, reservations.id))
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(inArray(disputes.status, ['needs_response', 'warning_needs_response']))
		.orderBy(asc(disputes.evidenceDueBy));

	return rows.map((row) => {
		const deadline = row.evidenceDueBy
			? ` — réponse attendue avant le ${formatSeatingDateTime(row.evidenceDueBy, row.timeZone, 'fr')}`
			: '';
		return {
			kind: 'dispute_open' as const,
			reservationId: row.reservationId,
			guestName: row.guestName,
		eventTitle: row.eventTitle || row.eventTitleEn,
			seatingStart: row.seatingStart,
			amount: row.amount,
			currency: row.currency,
			detail: `${row.reason ?? 'dispute'}${deadline}`,
			href: stripeDisputeUrl(row.stripeDisputeId)
		};
	});
}

/** Every open money alert, page order, each kind oldest Seating first. */
export async function moneyAlerts(_now = new Date()): Promise<MoneyAlert[]> {
	const alerts: MoneyAlert[] = [
		...(await refundFailedAlerts()),
		...(await paidWithoutSeatAlerts()),
		...(await refundedButActiveAlerts()),
		...(await disputeOpenAlerts())
	];
	return alerts;
}

/** How many alerts are open, total and per kind (for the sidebar badge). */
export async function moneyAlertCounts(now = new Date()): Promise<MoneyAlertCounts> {
	const alerts = await moneyAlerts(now);
	const byKind: Partial<Record<MoneyAlertKind, number>> = {};
	for (const alert of alerts) {
		byKind[alert.kind] = (byKind[alert.kind] ?? 0) + 1;
	}
	return { total: alerts.length, byKind };
}
