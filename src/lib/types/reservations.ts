import type { reservations, eventSessions, payments, media } from '$lib/server/db/schema';

export type Reservation = typeof reservations.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Media = typeof media.$inferSelect;

export type CreateReservationInput = {
	sessionId: string;
	email: string;
	name: string;
	phone?: string;
	quantity: number;
	notificationPreference?: 'email' | 'sms' | 'both';
	promoCode?: string;
	/** Dietary Requirements (issue 041): stored only on an Event that asks,
	 * and only with `dietaryConsent`. */
	dietaryRequirements?: string;
	dietaryConsent?: boolean;
	honeypot?: string;
	ipAddress?: string | null;
	userAgent?: string | null;
};

/**
 * Input for an Admin-initiated comp (complimentary) Reservation.
 * Deliberately excludes payment/checkout-only fields (promoCode, honeypot,
 * ipAddress, userAgent) since comp Reservations skip the public checkout
 * flow entirely.
 */
export type CreateCompReservationInput = {
	sessionId: string;
	email: string;
	name: string;
	phone?: string;
	quantity: number;
	notificationPreference?: 'email' | 'sms' | 'both';
};

export type ReservationWithDetails = Reservation & {
	eventSession: typeof eventSessions.$inferSelect & {
		event: {
			id: string;
			titleEn: string;
			titleFr: string;
			locationEn: string;
			locationFr: string;
			venueNameEn: string | null;
			venueNameFr: string | null;
			streetAddressEn: string | null;
			streetAddressFr: string | null;
			cityEn: string | null;
			cityFr: string | null;
			countryEn: string | null;
			countryFr: string | null;
			/** The Event's Time Zone (ADR 0006). */
			timeZone: string;
			coverMedia: Media | null;
		};
	};
	payment: Payment | null;
};

export type TicketEmailData = {
	guestEmail: string;
	guestName: string;
	accessToken: string;
	reservation: Reservation;
	session: typeof eventSessions.$inferSelect;
	event: {
		// Missing on an Event published unfinished (ADR 0008).
		titleEn: string | null;
		titleFr: string | null;
		id: string;
		locationEn: string | null;
		locationFr?: string | null;
		/** The Event's Time Zone (ADR 0006): times are shown on its clock. */
		timeZone: string;
		// The venue's name and address, and the Practical Info (issue 040),
		// shown to Guests in the confirmation and reminder emails. Optional
		// so callers holding a narrower Event still compile; missing pieces
		// fall back to the location line and no Practical Info section.
		venueNameEn?: string | null;
		venueNameFr?: string | null;
		streetAddressEn?: string | null;
		streetAddressFr?: string | null;
		cityEn?: string | null;
		cityFr?: string | null;
		countryEn?: string | null;
		countryFr?: string | null;
		postalCode?: string | null;
		practicalInfoEn?: string | null;
		practicalInfoFr?: string | null;
	};
	qrCode?: string;
	googleCalendarUrl?: string;
	icsUrl?: string;
};
