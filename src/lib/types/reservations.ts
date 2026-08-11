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
			slug: string;
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
		titleEn: string;
		titleFr: string;
		slug: string;
		locationEn: string;
	};
	qrCode?: string;
	googleCalendarUrl?: string;
	icsUrl?: string;
};
