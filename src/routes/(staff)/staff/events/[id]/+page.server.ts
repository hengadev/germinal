import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getStaffEventAccess,
	seatingsForBookingClosure,
	setSeatingBookingsClosed,
	upcomingSeatingsForInvitation,
} from '$lib/server/services/staff-portal';
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
import { recordAuditLog } from '$lib/server/services/audit-log';
import { moveReservation } from '$lib/server/services/moves';
import { cancelParty, refundParty, withRefundInfo } from '$lib/server/services/party-cancel-refund';
import { changeParty } from '$lib/server/services/party-size';
import { withPartySizeInfo } from '$lib/server/services/day-guest-list';
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
	const isAdmin = locals.user.role === 'admin';
	const canCloseBookings = access.can('close_bookings');
	const canInvite = access.can('invite');
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
			canChangeParty: access.can('change_party'),
			canCloseBookings,
			canInvite,
		},
		// « Fermé aux réservations » (039) : les séances du Jour en cours,
		// ou — pour un Admin — toutes les séances à venir de l'événement.
		closeBookings: canCloseBookings
			? await seatingsForBookingClosure(params.id, access.day, isAdmin)
			: [],
		// « Nouvelle réservation » (040) : toute séance publiée à venir de
		// l'événement, pas seulement celle du Jour en cours.
		invite: canInvite ? await upcomingSeatingsForInvitation(params.id) : [],
		event: access.event,
		staffRoleName: access.staffRoleName,
		brief,
		arrivees: canSeeArrivees ? await loadArrivees(access, params.id) : null,
	};
};

/** The Day guest list, with each party's refund figures when the viewer can cancel/refund, and its party-size figures when they can change the party's size. */
async function loadArrivees(access: Awaited<ReturnType<typeof getStaffEventAccess>>, eventId: string) {
	const list = await getDayGuestList(access, eventId);
	if (list && access.can('cancel_refund')) await withRefundInfo(access, eventId, list);
	if (list && access.can('change_party')) await withPartySizeInfo(access, eventId, list);
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
		const clientId = formData.get('clientId');

		const result = await recordCheckIn({
			access,
			eventId: params.id,
			reservationId,
			guests,
			method: 'manual',
			actorId: locals.user.id,
			clientId: typeof clientId === 'string' && clientId !== '' ? clientId : undefined,
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
		const clientId = formData.get('clientId');

		const result = await recordCheckIn({
			access,
			eventId: params.id,
			reservationId,
			guests,
			method: 'scan',
			actorId: locals.user.id,
			clientId: typeof clientId === 'string' && clientId !== '' ? clientId : undefined,
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

	// « Modifier le nombre » (issue 048) : change le nombre de personnes
	// d'une partie confirmée du Jour en cours. La permission et le Jour
	// sont revérifiés sur le serveur, jamais depuis le client ; un
	// remboursement du trop-perçu exige en plus cancel_refund.
	changeParty: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		const access = await getStaffEventAccess(locals.user, params.id);

		const formData = await request.formData();
		const reservationId = formData.get('reservationId');
		if (!access.can('change_party')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de modifier le nombre de personnes.",
				reservationId
			});
		}
		if (typeof reservationId !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}

		const quantity = Number(formData.get('quantity'));
		if (!Number.isInteger(quantity) || quantity < 1) {
			return fail(400, { error: 'Nombre de personnes invalide.', reservationId });
		}

		// Le remboursement du trop-perçu, en euros dans la feuille, en
		// centimes ici — uniquement pour qui peut aussi annuler/rembourser.
		let refundAmount: number | undefined;
		if (access.can('cancel_refund')) {
			const parsed = parseAmountInput(formData.get('refundAmount'));
			if ('error' in parsed && parsed.error === 'invalid') {
				return fail(400, { error: 'Montant de remboursement invalide.', reservationId });
			}
			if (!('error' in parsed)) refundAmount = parsed.cents;
		}

		const result = await changeParty({
			access,
			eventId: params.id,
			reservationId,
			quantity,
			refundAmount,
			actorId: locals.user.id,
		});
		if (!result.ok) return fail(422, { error: result.error, reservationId });
		return {
			changeParty: true,
			reservationId,
			message:
				`Nombre modifié : ${result.quantity} personne${result.quantity > 1 ? 's' : ''}, ` +
				`reste à payer sur place ${formatCurrency(result.balance, result.currency, 'fr-FR')}` +
				(result.refunded > 0
					? `, ${formatCurrency(result.refunded, result.currency, 'fr-FR')} remboursés`
					: '') +
				(result.overflow > 0
					? ` — ${result.overflow} place${result.overflow > 1 ? 's' : ''} au-delà de la capacité`
					: '')
		};
	},

	// « Nouvelle réservation » (issue 040) : crée une invitation (un Comp)
	// sur une séance à venir de cet événement et envoie le billet par
	// email. La permission est revérifiée sur le serveur, jamais depuis le
	// client. Contrairement aux permissions d'invités, elle fonctionne
	// aussi hors d'un Jour : elle ne montre aucune donnée d'invité.
	invite: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', invite: true });

		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('invite')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de créer une invitation.",
				invite: true
			});
		}

		const formData = await request.formData();
		const seatingId = formData.get('seatingId');
		const name = formData.get('name')?.toString().trim();
		const email = formData.get('email')?.toString().trim();
		const phone = formData.get('phone')?.toString().trim();
		const quantity = parseInt(formData.get('quantity')?.toString() ?? '1', 10);
		if (typeof seatingId !== 'string' || !seatingId) {
			return fail(400, { error: 'Choisissez une séance.', invite: true });
		}
		if (!name) {
			return fail(400, { error: "Le nom de l'invité est requis.", invite: true });
		}
		if (!email || !email.includes('@')) {
			return fail(400, { error: 'Un email valide est requis : le billet est envoyé par email.', invite: true });
		}
		if (!Number.isInteger(quantity) || quantity < 1) {
			return fail(400, { error: 'Le nombre d\u2019invités doit être un entier positif.', invite: true });
		}

		// Même validation que l'action create de l'admin (/admin/reservations/new) :
		// la séance doit appartenir à cet événement, être publiée et à venir —
		// createCompReservation revérifie la publication et l'heure, mais pas
		// l'événement.
		const { db } = await import('$lib/server/db');
		const { eventSessions } = await import('$lib/server/db/schema');
		const { and, eq, gt } = await import('drizzle-orm');
		const [seating] = await db
			.select({ id: eventSessions.id })
			.from(eventSessions)
			.where(
				and(
					eq(eventSessions.id, seatingId),
					eq(eventSessions.eventId, params.id),
					eq(eventSessions.published, true),
					gt(eventSessions.startTime, new Date())
				)
			);
		if (!seating) {
			return fail(422, { error: 'Séance introuvable pour cet événement.', invite: true });
		}

		try {
			const { createCompReservation } = await import('$lib/server/services/reservations');
			const result = await createCompReservation({
				sessionId: seatingId,
				email,
				name,
				phone: phone || undefined,
				quantity,
				// Le billet part par email ; pas d'option SMS depuis le portail.
				notificationPreference: 'email'
			});
			await recordAuditLog({
				adminId: locals.user.id,
				action: 'reservation.invite',
				entityType: 'reservation',
				entityId: result.reservation.id,
				metadata: {
					seatingId,
					quantity,
					name,
					// Issue 045 : l'invitation a pu dépasser la capacité.
					overflowSeats: result.overflowSeats
				}
			});
			// Issue 045 : la séance complète n'empêche plus l'invitation ; le
			// dépassement est signalé.
			const overflowSuffix =
				result.overflowSeats > 0
					? `, ${result.overflowSeats} place${result.overflowSeats > 1 ? 's' : ''} au-delà de la capacité`
					: '';
			return { invited: true, message: `Invitation créée pour ${name}${overflowSuffix}` };
		} catch (err) {
			return fail(422, {
				error: err instanceof Error ? err.message : 'Échec de la création de l\u2019invitation.',
				invite: true
			});
		}
	},

	// « Fermé aux réservations » (issue 039) : ferme une ou plusieurs
	// séances aux réservations en ligne. La permission est revérifiée sur
	// le serveur, jamais depuis le client.
	closeBookings: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', closeBookingsForm: true });

		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('close_bookings')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de fermer aux réservations.",
				closeBookingsForm: true
			});
		}

		const formData = await request.formData();
		const seatingIds = formData
			.getAll('seatingId')
			.filter((v): v is string => typeof v === 'string' && v !== '');

		const result = await setSeatingBookingsClosed({
			eventId: params.id,
			seatingIds,
			closed: true,
			actorId: locals.user.id,
			day: access.day,
			admin: locals.user.role === 'admin'
		});
		if (!result.ok) return fail(422, { error: result.error, closeBookingsForm: true });
		await recordAuditLog({
			adminId: locals.user.id,
			action: 'seating.close_bookings',
			entityType: 'session',
			entityId: result.written[0] ?? null,
			metadata: { seatingIds: result.written }
		});
		return { bookingsClosed: true };
	},

	reopenBookings: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié.', closeBookingsForm: true });

		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('close_bookings')) {
			return fail(403, {
				error: "Vous n'avez pas la permission de rouvrir les réservations.",
				closeBookingsForm: true
			});
		}

		const formData = await request.formData();
		const seatingId = formData.get('seatingId');
		if (typeof seatingId !== 'string' || !seatingId) {
			return fail(400, { error: 'Requête invalide.', closeBookingsForm: true });
		}

		const result = await setSeatingBookingsClosed({
			eventId: params.id,
			seatingIds: [seatingId],
			closed: false,
			actorId: locals.user.id,
			day: access.day,
			admin: locals.user.role === 'admin'
		});
		if (!result.ok) return fail(422, { error: result.error, closeBookingsForm: true });
		await recordAuditLog({
			adminId: locals.user.id,
			action: 'seating.reopen_bookings',
			entityType: 'session',
			entityId: seatingId,
			metadata: { seatingIds: result.written }
		});
		return { bookingsReopened: true };
	},
};
