/**
 * Shared bits of the Arrivées variants: display helpers over the
 * permission-shaped party rows.
 */
import { seatingTitle } from '$lib/utils/seating-title';
import { formatCurrency } from '$lib/utils/currency';
import type { DayGuestParty, DayGuestSeating } from '$lib/server/services/day-guest-list';

export type ArriveesFields = { guestList: boolean; dietary: boolean; contact: boolean };

/** A Seating's French title (stored or derived), e.g. « Dîner — …, 19h00 ». */
export function seatingLabel(seating: DayGuestSeating, timeZone: string): string {
	return seatingTitle(seating, 'fr', { timeZone });
}

/** « 34 » or « 34 / 32 » (red when over capacity). */
export function capacityLabel(seating: DayGuestSeating): { text: string; over: boolean } {
	if (seating.totalCapacity === null) return { text: `${seating.booked}`, over: false };
	return {
		text: `${seating.booked} / ${seating.totalCapacity}`,
		over: seating.booked > seating.totalCapacity,
	};
}

/** The best label a party offers under this access. */
export function partyLabel(party: DayGuestParty): string {
	return party.guestName ?? party.guestEmail ?? party.guestPhone ?? 'Sans nom';
}

/** Balance due in euros, only for accesses that may see it. */
export function balanceLabel(
	party: DayGuestParty,
	fields: ArriveesFields
): string | null {
	if (!fields.guestList) return null;
	if (party.balanceAmount === undefined || party.currency === undefined) return null;
	return formatCurrency(party.balanceAmount, party.currency, 'fr-FR');
}
