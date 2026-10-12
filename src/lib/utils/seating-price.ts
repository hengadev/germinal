/**
 * The price a Seating is booked at (issue 022) — pure, shared by the server
 * and the client.
 *
 * The price lives on the Service: every Seating of a Service is booked at
 * the Service's price. The one exception is a Seating migrated from a
 * Session whose price differed from the one its merged Service took
 * (migration 0021): it keeps that legacy price, so no migrated booking
 * price changed. A Service whose price has not been set yet makes its
 * Seatings unbookable (`null`).
 *
 * Every reader of a Seating's price goes through {@link resolveSeatingPrice};
 * the Pricing module (issue 023) takes the unit price from here.
 */

export interface SeatingPriceSource {
	/** The Service's price in minor units, or null when not set yet. */
	servicePriceAmount: number | null;
	serviceCurrency: string;
	/** Legacy per-Seating price kept by migration 0021, or null. */
	legacyPriceAmount: number | null;
	legacyCurrency: string | null;
}

export interface SeatingPrice {
	/** Unit price per seat, in minor units (cents). Zero is a free Seating. */
	amount: number;
	currency: string;
	/** True when the price is a migrated legacy per-Seating price rather
	 * than the Service's. */
	legacy: boolean;
}

/** The unit price a Seating is booked at, or null when it has none. */
export function resolveSeatingPrice(source: SeatingPriceSource): SeatingPrice | null {
	if (source.legacyPriceAmount !== null && source.legacyCurrency !== null) {
		return { amount: source.legacyPriceAmount, currency: source.legacyCurrency, legacy: true };
	}
	if (source.servicePriceAmount === null) {
		return null;
	}
	return { amount: source.servicePriceAmount, currency: source.serviceCurrency, legacy: false };
}

/** A Service's own price (what its Seatings cost), or null when not set. */
export function servicePrice(service: {
	priceAmount: number | null;
	currency: string;
}): { amount: number; currency: string } | null {
	return service.priceAmount === null ? null : { amount: service.priceAmount, currency: service.currency };
}

/**
 * The unit price a Reservation was booked at, from its own snapshot (total
 * before discount ÷ seats), so later price changes on the Service never
 * alter what a Ticket or reminder says the Guest paid for.
 */
export function bookedUnitPriceAmount(reservation: {
	totalAmount: number;
	discountAmount: number | null;
	quantity: number;
}): number {
	if (reservation.quantity <= 0) return 0;
	return Math.round((reservation.totalAmount + (reservation.discountAmount ?? 0)) / reservation.quantity);
}
