/**
 * Issue 061 — the arrivals queued offline, by Reservation: the party
 * cards show them on top of the page's arrived counts until the replay
 * succeeds and invalidateAll() reloads the truth.
 */
export const pendingArrivals = $state({ byReservation: {} as Record<string, number> });

/** An arrival queued offline: it counts on screen straight away. */
export function addPendingArrival(reservationId: string, guests: number): void {
	pendingArrivals.byReservation[reservationId] =
		(pendingArrivals.byReservation[reservationId] ?? 0) + guests;
}

/** The replay answered these entries (recorded, duplicate or refused):
 *  the page data now tells their truth. Entries still queued keep counting. */
export function settlePendingArrivals(entries: { reservationId: string; guests: number }[]): void {
	for (const { reservationId, guests } of entries) {
		const left = (pendingArrivals.byReservation[reservationId] ?? 0) - guests;
		if (left > 0) pendingArrivals.byReservation[reservationId] = left;
		else delete pendingArrivals.byReservation[reservationId];
	}
}

/** How many of this Reservation's guests wait for the network. */
export function pendingArrivalsFor(reservationId: string): number {
	return pendingArrivals.byReservation[reservationId] ?? 0;
}
