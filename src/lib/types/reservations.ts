import type { reservations, eventSessions, payments } from '$lib/server/db/schema';

export type Reservation = typeof reservations.$inferSelect;
export type Payment = typeof payments.$inferSelect;

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

export type ReservationWithDetails = Reservation & {
	eventSession: typeof eventSessions.$inferSelect & {
		event: {
			id: string;
			title: string;
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
		title: string;
		locationEn: string;
	};
};
