import { formatCurrency } from '$lib/utils/currency';
import type { DayGuestParty } from './day-guest-list';

/**
 * The scan result party, shaped once for the wire: only what the Scanner
 * shows — no Date, no contact details. Shared by the scan action (issue
 * 018) and the offline Day snapshot (issue 060).
 */
export function scanParty(party: DayGuestParty) {
	const balance =
		party.isComp || !party.balanceAmount || !party.currency || party.balanceSettledAt
			? null
			: formatCurrency(party.balanceAmount, party.currency, 'fr-FR');
	return {
		id: party.id ?? null,
		guestName: party.guestName ?? null,
		quantity: party.quantity ?? null,
		arrived: party.arrived ?? 0,
		balance,
		isComp: party.isComp ?? false,
		dietaryRequirements: party.dietaryRequirements ?? null,
	};
}

export type ScanPartyWire = ReturnType<typeof scanParty>;
