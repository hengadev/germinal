import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffEventAccess } from '$lib/server/services/staff-portal';
import {
	getDayGuestList,
	lookupTicket,
	explainTicket,
	type DayGuestParty,
} from '$lib/server/services/day-guest-list';
import { recordCheckIn, undoLastCheckIn } from '$lib/server/services/check-ins';
import { createWalkIn } from '$lib/server/services/walk-ins';
import { createCompOnTheSpot } from '$lib/server/services/comps';
import { settleBalance, undoSettleBalance } from '$lib/server/services/balance';
import { getEventBrief } from '$lib/server/services/staff-brief';
import { moveReservation } from '$lib/server/services/moves';
import { cancelParty, refundParty, withRefundInfo } from '$lib/server/services/party-cancel-refund';
import { formatCurrency, parseAmountInput } from '$lib/utils/currency';

// The scan result party, shaped once for the wire: only what the Scanner
// shows — no Date, no contact details.
function scanParty(party: DayGuestParty) {
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

// The French refusal shown in place of a check-in button.
function refusalMessage(explanation: Awaited<ReturnType<typeof explainTicket>>): string {
	switch (explanation.reason) {
		case 'cancelled':
			return 'Cette réservation est annulée.';
		case 'not_confirmed':
			return "Cette réservation n'a pas été confirmée (paiement non finalisé).";
		case 'other_event':
			return 'Ce billet est pour un autre événement.';
		case 'other_day': {
			const label = new Intl.DateTimeFormat('fr-FR', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC',
			}).format(new Date(`${explanation.day}T12:00:00Z`));
			return `Ce billet est pour le ${label}.`;
		}
		default:
			return 'Billet inconnu.';
	}
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Non authentifié');

	const access = await getStaffEventAccess(locals.user, params.id);

	// Brief (issue 032): everyone sees the general part; a Staff member
	// only their own role's part, an Admin every part.
	const briefAll = await getEventBrief(params.id);
	const brief = {
		general: briefAll.general,
		roles: access.staffRoleId
			? briefAll.roles.filter((r) => r.staffRoleId === access.staffRoleId)
			: briefAll.roles,
	};

	// Arrivées needs a visible Day and the guest list; Cuisine, Dietary Requirements.
	const canArrivees = access.can('guest_list');
	const canCuisine = access.can('dietary');
	const canSeeArrivees = canArrivees || canCuisine;
	return {
		access: {
			permissions: access.permissions,
			day: access.day,
			canSeeGuests: access.canSeeGuests,
			canArrivees,
			canCuisine,
			canManualCheckIn: access.can('manual_check_in'),
			canCorrect: access.can('correct_mistake'),
			canScan: access.can('scan_check_in'),
			canSettle: access.can('settle_balance'),
			canMove: access.can('move'),
			canWalkIn: access.can('walk_in'),
			canComp: access.can('comp'),
			canCancelRefund: access.can('cancel_refund'),
		},
		event: access.event,
		staffRoleName: access.staffRoleName,
		brief,
		arrivees: canSeeArrivees ? await loadArrivees(access, params.id) : null,
	};
};

/** The Day guest list, with each party's refund figures when the viewer can cancel/refund. */
async function loadArrivees(access: Awaited<ReturnType<typeof getStaffEventAccess>>, eventId: string) {
	const list = await getDayGuestList(access, eventId);
	if (list && access.can('cancel_refund')) return withRefundInfo(access, eventId, list);
	return list;
}

export const actions: Actions = {
	checkIn: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The Check-in permission is re-resolved on the server, never trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		const guests = Number(formData.get('guests'));
		if (!access.can('manual_check_in')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de faire entrer à la main.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string' || !Number.isInteger(guests)) {
			return fail(400, { error: 'Requête invalide.' });
		}

		const result = await recordCheckIn({
			access,
			eventId: params.id,
			reservationId,
			guests,
			method: 'manual',
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
	},

	walkIn: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', walkIn: true });

		// The Walk-in permission is re-resolved on the server, never trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const seatingId = formData.get('seatingId');
		const name = formData.get('name');
		const quantity = Number(formData.get('quantity'));
		const email = formData.get('email');
		const phone = formData.get('phone');

		if (!access.can('walk_in')) {
			return fail(403, { error: "Vous n'avez pas la permission d'ajouter un walk-in.", walkIn: true });
		}
		if (typeof seatingId !== 'string' || typeof name !== 'string' || !Number.isInteger(quantity)) {
			return fail(400, { error: 'Requête invalide.', walkIn: true });
		}

		const result = await createWalkIn({
			access,
			eventId: params.id,
			seatingId,
			name,
			quantity,
			email: typeof email === 'string' && email.trim() !== '' ? email.trim() : undefined,
			phone: typeof phone === 'string' && phone.trim() !== '' ? phone.trim() : undefined,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, walkIn: true });
	},

	comp: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', comp: true });

		// The "offer a Comp" permission is re-resolved on the server, never
		// trusted from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const seatingId = formData.get('seatingId');
		const name = formData.get('name');
		const quantity = Number(formData.get('quantity'));
		const email = formData.get('email');
		const phone = formData.get('phone');

		if (!access.can('comp')) {
			return fail(403, { error: "Vous n'avez pas la permission d'offrir une invitation.", comp: true });
		}
		if (typeof seatingId !== 'string' || typeof name !== 'string' || !Number.isInteger(quantity)) {
			return fail(400, { error: 'Requête invalide.', comp: true });
		}

		const result = await createCompOnTheSpot({
			access,
			eventId: params.id,
			seatingId,
			name,
			quantity,
			email: typeof email === 'string' && email.trim() !== '' ? email.trim() : undefined,
			phone: typeof phone === 'string' && phone.trim() !== '' ? phone.trim() : undefined,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, comp: true });
	},

	scan: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { scanRefusal: 'Non authentifié.' });

		// The scan Check-in permission is re-resolved on the server.
		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('scan_check_in')) {
			return fail(403, {
				scanRefusal: "Vous n'avez pas la permission de faire entrer par scan.",
			});
		}

		const formData = await request.formData();
		const token = formData.get('token');
		if (typeof token !== 'string' || !token) {
			return fail(400, { scanRefusal: 'Billet inconnu.' });
		}

		// A scan records nothing: it resolves the Ticket, or explains the refusal.
		const party = await lookupTicket(access, params.id, token);
		if (party) {
			if (party.quantity !== undefined && (party.arrived ?? 0) >= party.quantity) {
				return fail(422, { scanRefusal: 'Tout le groupe est déjà entré.' });
			}
			return { scan: { party: scanParty(party) } };
		}
		const explanation = await explainTicket(params.id, token);
		return fail(422, { scanRefusal: refusalMessage(explanation) });
	},

	scanCheckIn: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', reservationId: null });

		const access = await getStaffEventAccess(locals.user, params.id);
		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		const guests = Number(formData.get('guests'));
		if (!access.can('scan_check_in')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de faire entrer par scan.",
				reservationId,
			});
		}
		if (typeof reservationId !== 'string' || !Number.isInteger(guests)) {
			return fail(400, { error: 'Requête invalide.', reservationId });
		}

		const result = await recordCheckIn({
			access,
			eventId: params.id,
			reservationId,
			guests,
			method: 'scan',
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
		return { scanCheckedIn: { guests, arrived: result.arrived, quantity: result.quantity } };
	},

	undoCheckIn: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('correct_mistake')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de corriger une erreur.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		const result = await undoLastCheckIn({
			access,
			eventId: params.id,
			reservationId,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
	},

	settleBalance: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The settle permission is re-resolved on the server, never trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('settle_balance')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de régler un solde.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		const result = await settleBalance({
			access,
			eventId: params.id,
			reservationId,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
	},

	move: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The Move permission is re-resolved on the server, never trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		const toSeatingId = formData.get('toSeatingId');
		if (!access.can('move')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de déplacer une réservation.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string' || typeof toSeatingId !== 'string') {
			return fail(400, { error: 'Requête invalide.', reservationId });
		}

		const result = await moveReservation({
			access,
			eventId: params.id,
			reservationId,
			toSeatingId,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
		return { moved: true };
	},

	undoSettleBalance: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('correct_mistake')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de corriger une erreur.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		const result = await undoSettleBalance({
			access,
			eventId: params.id,
			reservationId,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
	},

	cancelReservation: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The cancel/refund permission is re-resolved on the server, never
		// trusted from the client.
		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('cancel_refund')) {
			return fail(403, {
				error: "Vous n'avez pas la permission d'annuler une réservation.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		// cancelledBy guest: an amount in major units, comma accepted (0 allowed);
		// germinal: the whole refundable amount, whatever was sent.
		const cancelledBy = formData.get('cancelledBy') === 'germinal' ? 'germinal' : 'guest';
		let amount: number | undefined;
		if (cancelledBy === 'guest') {
			const parsed = parseAmountInput(formData.get('amount'));
			if ('error' in parsed) {
				return fail(400, {
					error:
						parsed.error === 'blank'
							? 'Indiquez le montant à rembourser (0 pour aucun remboursement)'
							: 'Montant à rembourser invalide',
					reservationId
				});
			}
			amount = parsed.cents;
		}

		const result = await cancelParty({
			access,
			eventId: params.id,
			reservationId,
			cancelledBy,
			amount,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
		return { cancelReservation: true, reservationId, message: result.message };
	},

	refundReservation: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('cancel_refund')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de rembourser une réservation.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		// Partial refund in major units, comma accepted; blank means the whole
		// refundable remainder.
		const parsed = parseAmountInput(formData.get('amount'));
		if ('error' in parsed && parsed.error === 'invalid') {
			return fail(400, { error: 'Montant à rembourser invalide', reservationId });
		}

		const result = await refundParty({
			access,
			eventId: params.id,
			reservationId,
			amount: 'cents' in parsed ? parsed.cents : undefined,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
		return { refundReservation: true, reservationId, message: result.message };
	},
};
