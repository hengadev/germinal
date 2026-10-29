/**
 * Shared bits of the Arrivées screen: display helpers over the
 * permission-shaped party rows.
 */
import { formatCurrency } from '$lib/utils/currency';
import type { DayGuestParty, DayGuestSeating } from '$lib/server/services/day-guest-list';

export type ArriveesFields = { guestList: boolean; dietary: boolean; contact: boolean };

/** A Seating's start, the way the door says it: « 12 h 00 », « 20 h 30 ». */
export function seatingTime(seating: DayGuestSeating, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('fr-FR', {
		hour: 'numeric',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone,
	}).formatToParts(new Date(seating.startTime));
	const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
	const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
	return `${Number(hour)} h ${minute}`;
}

/** « 34 » or « 34 / 32 » (over capacity when booked exceeds it). */
export function capacityLabel(seating: DayGuestSeating): { text: string; over: boolean } {
	if (seating.totalCapacity === null) return { text: `${seating.booked}`, over: false };
	return {
		text: `${seating.booked} / ${seating.totalCapacity}`,
		over: seating.booked > seating.totalCapacity,
	};
}

/** « 1 personne », « 4 personnes ». */
export function guests(count: number): string {
	return `${count} ${count === 1 ? 'personne' : 'personnes'}`;
}

/** The Balance still due on site, or null when nothing is (or it may not be seen). */
export function balanceDue(party: DayGuestParty): string | null {
	if (party.isComp || !party.balanceAmount || !party.currency) return null;
	return formatCurrency(party.balanceAmount, party.currency, 'fr-FR');
}

/** What the search box matches: the name, plus phone and e-mail when they may be seen. */
export function matches(party: DayGuestParty, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const digits = q.replace(/\D/g, '');
	return (
		(party.guestName ?? '').toLowerCase().includes(q) ||
		(party.guestEmail ?? '').toLowerCase().includes(q) ||
		(digits.length >= 3 && (party.guestPhone ?? '').replace(/\D/g, '').includes(digits))
	);
}

/** The Seating under way: the last one already started, or the first before any has. */
export function currentSeatingId(seatings: DayGuestSeating[], now: Date): string | null {
	const started = seatings.filter((s) => new Date(s.startTime).getTime() <= now.getTime());
	return (started.at(-1) ?? seatings[0])?.id ?? null;
}

/** « Déjeuner », « Dîner ». */
export function serviceLabel(kind: DayGuestSeating['serviceKind']): string {
	return kind === 'lunch' ? 'Déjeuner' : 'Dîner';
}

/** The Day's Services, in order, each with its Seatings. */
export function servicesOf(
	seatings: DayGuestSeating[]
): { id: string; kind: DayGuestSeating['serviceKind']; seatings: DayGuestSeating[] }[] {
	const services: { id: string; kind: DayGuestSeating['serviceKind']; seatings: DayGuestSeating[] }[] = [];
	for (const seating of seatings) {
		let service = services.find((s) => s.id === seating.serviceId);
		if (!service) {
			service = { id: seating.serviceId, kind: seating.serviceKind, seatings: [] };
			services.push(service);
		}
		service.seatings.push(seating);
	}
	return services;
}
