// Issue 042 — « À traiter »: every Reservation whose money needs an Admin.
// A read-only service: each alert is computed from current data, so it
// disappears once its cause is fixed. Later issues add other kinds; keep
// one query per kind in moneyAlerts, and moneyAlertCounts just counts.

import { and, eq, like, lt } from 'drizzle-orm';
import { db } from '../db';
import { events, eventSessions, payments, reservations } from '../db/schema';

/** The alert kinds, in display order. Later issues add kinds here. */
export type MoneyAlertKind = 'refund_failed';

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

/** Every open money alert, oldest Seating first. */
export async function moneyAlerts(_now = new Date()): Promise<MoneyAlert[]> {
	const alerts: MoneyAlert[] = [
		...(await refundFailedAlerts())
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
