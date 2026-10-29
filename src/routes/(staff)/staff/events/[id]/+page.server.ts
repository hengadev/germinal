import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffEventAccess } from '$lib/server/services/staff-portal';
import {
	getDayGuestList,
	lookupTicket,
	explainTicket,
	type DayGuestParty,
} from '$lib/server/services/day-guest-list';
import { getTasksForUser, updateTaskStatus } from '$lib/server/services/tasks';
import { taskStatusEnum } from '$lib/server/db/schema';
import { recordCheckIn, undoLastCheckIn } from '$lib/server/services/check-ins';
import { createWalkIn } from '$lib/server/services/walk-ins';
import { settleBalance, undoSettleBalance } from '$lib/server/services/balance';
import { moveReservation } from '$lib/server/services/moves';
import { formatCurrency } from '$lib/utils/currency';

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

	const canTasks = access.can('tasks');
	// Arrivées needs a visible Day and the guest list or Dietary Requirements.
	const canArrivees = access.can('guest_list') || access.can('dietary');
	return {
		access: {
			permissions: access.permissions,
			day: access.day,
			canSeeGuests: access.canSeeGuests,
			canTasks,
			canArrivees,
			canManualCheckIn: access.can('manual_check_in'),
			canCorrect: access.can('correct_mistake'),
			canScan: access.can('scan_check_in'),
			canSettle: access.can('settle_balance'),
			canMove: access.can('move'),
			canWalkIn: access.can('walk_in'),
		},
		event: access.event,
		staffRoleName: access.staffRoleName,
		tasks: canTasks
			? (await getTasksForUser(locals.user.id)).filter((t) => t.event.id === params.id)
			: [],
		arrivees: canArrivees ? await getDayGuestList(access, params.id) : null,
	};
};

export const actions: Actions = {
	updateTaskStatus: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The Tasks permission is checked against Staff access, not trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('tasks')) {
			return fail(403, { error: "Vous n'avez pas la permission Tâches sur cet événement." });
		}

		const formData = await request.formData();
		const taskId = formData.get('taskId');
		const status = formData.get('status');
		if (typeof taskId !== 'string' || typeof status !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}
		if (!(taskStatusEnum.enumValues as readonly string[]).includes(status)) {
			return fail(400, { error: 'Statut invalide.' });
		}

		// Only the person's own Tasks for this Event.
		const task = (await getTasksForUser(locals.user.id)).find(
			(t) => t.id === taskId && t.event.id === params.id
		);
		if (!task) {
			return fail(404, { error: 'Tâche introuvable.' });
		}

		await updateTaskStatus(taskId, status as (typeof taskStatusEnum.enumValues)[number]);
		return { success: true };
	},

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
};
