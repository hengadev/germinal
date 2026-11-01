// Issue 042 — « À traiter »: every Reservation whose money needs an Admin.
// A read-only service: each alert is computed from current data, so it
// disappears once its cause is fixed. Later issues add other kinds; keep
// one query per kind in moneyAlerts, and moneyAlertCounts just counts.

import { and, eq, gt, gte, inArray, isNull, like, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import {
	checkIns,
	events,
	eventDays,
	eventServices,
	eventSessions,
	payments,
	reservations
} from '../db/schema';
import { wallClockToInstant } from '$lib/utils/event-time';

/** The alert kinds, in display order. Later issues add kinds here. */
export type MoneyAlertKind = 'refund_failed' | 'balance_unsettled';

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

/** A Day ends at 6 a.m. the next morning, on the Event's clock. */
const DAY_END_MINUTES = 6 * 60;

/**
 * balance_unsettled: a confirmed, non-Comp Reservation with a Balance
 * still owed, at least one Check-in, and a Seating whose Day is over
 * (it ended at 6 a.m. the next morning, in the Event's Time Zone). Only
 * the last 30 days of Seatings, so old data does not flood the page.
 */
async function balanceUnsettledAlerts(now: Date): Promise<MoneyAlert[]> {
	type Row = {
		reservationId: string;
		guestName: string;
		eventTitle: string | null;
		eventTitleEn: string;
		seatingStart: Date;
		balanceAmount: number;
		quantity: number;
		currency: string;
		timeZone: string;
		day: string;
	};
	// Broad SQL filter (last 31 days by start time); the exact Day-end and
	// check-in tests follow in TypeScript, where the Time Zone lives.
	const rows: Row[] = await db
		.select({
			reservationId: reservations.id,
			guestName: reservations.guestName,
			eventTitle: events.titleFr,
			eventTitleEn: events.titleEn,
			seatingStart: eventSessions.startTime,
			balanceAmount: reservations.balanceAmount,
			quantity: reservations.quantity,
			currency: reservations.currency,
			timeZone: events.timeZone,
			day: eventDays.date
		})
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(
			and(
				eq(reservations.status, 'confirmed'),
				eq(reservations.isComp, false),
				gt(reservations.balanceAmount, 0),
				isNull(reservations.balanceSettledAt),
				gte(eventSessions.startTime, new Date(now.getTime() - 31 * 24 * 3_600_000))
			)
		);
	if (rows.length === 0) return [];

	// Arrived guests: the sum of Check-ins not undone, per Reservation.
	const arrivedRows: { reservationId: string; arrived: number }[] = await db
		.select({
			reservationId: checkIns.reservationId,
			arrived: sql<number>`coalesce(sum(${checkIns.guests}), 0)::int`
		})
		.from(checkIns)
		.where(
			and(
				inArray(
					checkIns.reservationId,
					rows.map((row) => row.reservationId)
				),
				isNull(checkIns.undoneAt)
			)
		)
		.groupBy(checkIns.reservationId);
	const arrivedByReservation = new Map<string, number>(arrivedRows.map((r) => [r.reservationId, r.arrived]));

	return rows
		.filter(
			(row) =>
				// The Day is over: it ended at 6 a.m. the next morning, Event time.
				wallClockToInstant(row.day, DAY_END_MINUTES + 24 * 60, row.timeZone).getTime() <=
					now.getTime() &&
				(arrivedByReservation.get(row.reservationId) ?? 0) > 0 &&
				// Only the last 30 days (the SQL window is a day wider).
				row.seatingStart.getTime() >= now.getTime() - 30 * 24 * 3_600_000
		)
		.map((row) => ({
			kind: 'balance_unsettled' as const,
			reservationId: row.reservationId,
			guestName: row.guestName,
			eventTitle: row.eventTitle || row.eventTitleEn,
			seatingStart: row.seatingStart,
			amount: row.balanceAmount,
			currency: row.currency,
			detail: `${arrivedByReservation.get(row.reservationId)} / ${row.quantity} arrivés`,
			href: `/admin/reservations/${row.reservationId}`
		}))
		// Grouped by Event, then Seating.
		.sort(
			(a: MoneyAlert, b: MoneyAlert) =>
				a.eventTitle.localeCompare(b.eventTitle) ||
				a.seatingStart.getTime() - b.seatingStart.getTime()
		);
}

/** Every open money alert, oldest Seating first. */
export async function moneyAlerts(now = new Date()): Promise<MoneyAlert[]> {
	const alerts: MoneyAlert[] = [
		...(await refundFailedAlerts()),
		...(await balanceUnsettledAlerts(now))
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
