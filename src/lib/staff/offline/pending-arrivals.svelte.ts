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

/** The replay answered (recorded, duplicate or refused): the page data
 *  now tells the truth, the local crutch goes. */
export function clearPendingArrivals(reservationIds: string[]): void {
	for (const id of reservationIds) delete pendingArrivals.byReservation[id];
}

/** How many of this Reservation's guests wait for the network. */
export function pendingArrivalsFor(reservationId: string): number {
	return pendingArrivals.byReservation[reservationId] ?? 0;
}
