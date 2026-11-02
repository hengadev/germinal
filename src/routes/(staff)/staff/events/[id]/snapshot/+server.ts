import { error, json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reservations } from '$lib/server/db/schema';
import { getStaffEventAccess } from '$lib/server/services/staff-portal';
import { getDayGuestList } from '$lib/server/services/day-guest-list';
import { scanParty } from '$lib/server/services/scan-party';

/**
 * Issue 060 — the Day's snapshot for the phone: every party of the Day,
 * with only the fields the viewer's permissions allow (same rules as the
 * guest list), and each ticket code as a SHA-256 hex hash — never the
 * code itself. Refused without the scan or manual Check-in permission,
 * and outside a Day.
 */
export const GET = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Non authentifié');

	const access = await getStaffEventAccess(locals.user, params.id);
	if (!access.can('scan_check_in') && !access.can('manual_check_in')) {
		throw error(403, 'Permission de scan ou d’entrée manuelle requise.');
	}
	if (access.day === null) throw error(403, 'Aucun jour en cours.');

	const list = await getDayGuestList(access, params.id);
	if (!list) throw error(403, 'Liste des invités indisponible.');

	// The tokens of the Day's parties, read by Reservation id in one query;
	// only their hash leaves the server.
	const ids = list.seatings.flatMap((seating) =>
		seating.parties.flatMap((party) => (party.id ? [party.id] : []))
	);
	const rows = ids.length
		? await db
				.select({ id: reservations.id, token: reservations.accessToken })
				.from(reservations)
				.where(inArray(reservations.id, ids))
		: [];
	const hashById = new Map(
		rows.map((row: { id: string; token: string }) => [
			row.id,
			createHash('sha256').update(row.token, 'utf8').digest('hex')
		])
	);

	return json({
		day: list.day,
		takenAt: new Date().toISOString(),
		seatings: list.seatings.map((seating) => ({
			id: seating.id,
			startTime: seating.startTime,
			parties: seating.parties.flatMap((party) => {
				const tokenHash = party.id ? hashById.get(party.id) : undefined;
				if (!tokenHash) return [];
				return [{ ...scanParty(party), tokenHash }];
			}),
		})),
	});
};
