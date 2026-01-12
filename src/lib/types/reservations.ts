import type { reservations, eventSessions, payments } from '$lib/server/db/schema';

export type Reservation = typeof reservations.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export type CreateReservationInput = {
	sessionId: string;
	email: string;
	name: string;
	phone?: string;
	quantity: number;
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
			location: string;
			venueName: string | null;
			streetAddress: string | null;
			city: string | null;
			country: string | null;
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
		location: string;
	};
};
