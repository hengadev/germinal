/**
 * Balance due on admin reservation lists and detail (issue 024).
 *
 * A Reservation stores how its total (after discount) splits between the
 * Deposit paid online and the Balance due at the venue
 * (`deposit_amount + balance_amount = total_amount`, issue 023). These
 * helpers turn that into what the admin back-office shows, so whoever runs
 * the door knows how much to collect from each Guest.
 *
 * Pure and dependency-free so both the server loads and the Svelte pages use
 * the same rules.
 */

/** Statuses for which the booking no longer stands: nothing to collect. */
const DEAD_STATUSES = new Set(['cancelled', 'expired']);

export interface ReservationAmountsSource {
	status: string;
	totalAmount: number;
	isComp?: boolean | null;
	/** Absent on mock rows / rows predating issue 023. */
	depositAmount?: number | null;
	balanceAmount?: number | null;
}

export interface ReservationAmounts {
	total: number;
	deposit: number;
	balance: number;
}

/**
 * The stored total / Deposit / Balance of a Reservation. Comp Reservations
 * are always 0/0/0. Rows without a stored split (mock data) are treated as
 * paid in full online — the default Deposit rule (100 %) — so the Balance
 * is 0 rather than an invented amount.
 */
export function reservationAmounts(r: ReservationAmountsSource): ReservationAmounts {
	if (r.isComp) return { total: 0, deposit: 0, balance: 0 };
	if (r.depositAmount == null || r.balanceAmount == null) {
		return { total: r.totalAmount, deposit: r.totalAmount, balance: 0 };
	}
	return { total: r.totalAmount, deposit: r.depositAmount, balance: r.balanceAmount };
}

/**
 * The Balance to show in the "Reste à régler" column, or `null` ("—") when
 * there is nothing to collect because the booking no longer stands
 * (cancelled — including every refunded one — or expired). The stored
 * balance of a cancelled Reservation is kept for the record but must never
 * reach the door as money to collect.
 */
export function balanceToCollect(r: ReservationAmountsSource): number | null {
	if (DEAD_STATUSES.has(r.status)) return null;
	return reservationAmounts(r).balance;
}

/**
 * What the door will collect across a set of Reservations: the sum of the
 * Balances of confirmed Reservations only. Pending/processing bookings have
 * not paid their Deposit yet and may still expire, so they are left out.
 */
export function totalBalanceToCollect(rows: ReservationAmountsSource[]): number {
	return rows.reduce(
		(sum, r) => (r.status === 'confirmed' ? sum + (balanceToCollect(r) ?? 0) : sum),
		0
	);
}

export interface FilterableReservation {
	status: string;
	seatingId: string;
	sessionTitle: string;
	sessionStartTime: string;
	guestName: string;
	guestEmail: string | null;
	eventTitle?: string;
}

export interface ReservationFilters {
	/** `'all'` or a reservation status. */
	status?: string;
	/** `'all'` or a Seating (event_sessions) id. */
	seatingId?: string;
	search?: string;
}

/** Filter admin reservation rows by status, Seating and free-text search. */
export function filterReservations<T extends FilterableReservation>(
	rows: T[],
	filters: ReservationFilters
): T[] {
	const status = filters.status && filters.status !== 'all' ? filters.status : null;
	const seatingId = filters.seatingId && filters.seatingId !== 'all' ? filters.seatingId : null;
	const query = filters.search?.trim().toLowerCase() ?? '';

	return rows.filter((r) => {
		if (status && r.status !== status) return false;
		if (seatingId && r.seatingId !== seatingId) return false;
		if (query) {
			const haystack = [r.guestName, r.guestEmail ?? '', r.eventTitle ?? '', r.sessionTitle];
			if (!haystack.some((v) => v.toLowerCase().includes(query))) return false;
		}
		return true;
	});
}

export interface SeatingFilterOption {
	id: string;
	label: string;
}

/**
 * The Seatings present in a set of reservation rows, one option each, in
 * chronological order. When `withEvent` is set (the global list spans
 * several Events) the label is prefixed with the Event title.
 */
export function seatingFilterOptions(
	rows: FilterableReservation[],
	options: { withEvent?: boolean } = {}
): SeatingFilterOption[] {
	const seen = new Map<string, { label: string; start: string }>();
	for (const r of rows) {
		if (seen.has(r.seatingId)) continue;
		const label =
			options.withEvent && r.eventTitle ? `${r.eventTitle} — ${r.sessionTitle}` : r.sessionTitle;
		seen.set(r.seatingId, { label, start: r.sessionStartTime });
	}
	return [...seen.entries()]
		.sort(([, a], [, b]) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label))
		.map(([id, { label }]) => ({ id, label }));
}
