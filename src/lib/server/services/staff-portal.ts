/**
 * The Staff portal's single door (issue 015): every portal page load and
 * action asks this module, which loads the Event, its Days and the
 * Assignment, then delegates to the pure Staff access module. The UI only
 * reflects the answer.
 */
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, eventStaff, events, staffRoles } from '../db/schema';
import { staffAccess, activeDay, hasDayAhead, type StaffAccess, type StaffWho } from '$lib/staff/access';
import type { StaffPermission } from '$lib/staff/permissions';

/** The least the portal needs to know about the signed-in person. */
export interface StaffPortalUser {
	id: string;
	role: string;
}

const eventColumns = {
	id: events.id,
	titleEn: events.titleEn,
	titleFr: events.titleFr,
	timeZone: events.timeZone,
	startDate: events.startDate,
	endDate: events.endDate,
} as const;

export interface StaffPortalEvent {
	id: string;
	titleEn: string | null;
	titleFr: string | null;
	timeZone: string;
	startDate: Date | null;
	endDate: Date | null;
}

/** Staff access for one Event, plus the Event and the Staff Role's name. */
export interface StaffEventAccess extends StaffAccess {
	event: StaffPortalEvent;
	staffRoleName: string | null;
	/** The Assignment's Staff Role, or null for an Admin. */
	staffRoleId: string | null;
}

/**
 * Resolve a user's access at an Event. Admins hold every permission at
 * every Event without an Assignment; a Staff member without an Assignment
 * there is refused.
 */
export async function getStaffEventAccess(
	user: StaffPortalUser,
	eventId: string,
	now: Date = new Date()
): Promise<StaffEventAccess> {
	const [event] = await db
		.select(eventColumns)
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	if (!event) throw error(404, 'Événement introuvable');

	const dayRows = await db
		.select({ date: eventDays.date })
		.from(eventDays)
		.where(eq(eventDays.eventId, eventId))
		.orderBy(asc(eventDays.date));
	const dates = dayRows.map((d: { date: string }) => String(d.date));

	let who: StaffWho;
	let staffRoleName: string | null = null;
	let staffRoleId: string | null = null;
	if (user.role === 'admin') {
		who = { kind: 'admin' };
	} else {
		const [assignment] = await db
			.select({
				rolePermissions: staffRoles.permissions,
				granted: eventStaff.grantedPermissions,
				withdrawn: eventStaff.withdrawnPermissions,
				roleName: staffRoles.name,
				roleId: eventStaff.staffRoleId,
			})
			.from(eventStaff)
			.innerJoin(staffRoles, eq(eventStaff.staffRoleId, staffRoles.id))
			.where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, user.id)))
			.limit(1);
		if (!assignment) throw error(403, "Aucune affectation sur cet événement");
		who = {
			kind: 'assignment',
			rolePermissions: assignment.rolePermissions as StaffPermission[],
			granted: assignment.granted as StaffPermission[],
			withdrawn: assignment.withdrawn as StaffPermission[],
		};
		staffRoleName = assignment.roleName;
		staffRoleId = assignment.roleId;
	}

	return { event, staffRoleName, staffRoleId, ...staffAccess(who, dates, event.timeZone, now) };
}

/** One row of the portal's Assignments list. */
export interface StaffEventListItem {
	event: StaffPortalEvent;
	/** The Event's Days, 'YYYY-MM-DD', in order. */
	days: string[];
	/** The Staff Role of the Assignment, or null for an Admin. */
	staffRoleName: string | null;
}

/**
 * A user's Assignments with their Event, Days and Staff Role, upcoming
 * first then past. For an Admin, every Event with no role.
 */
export async function listStaffEvents(user: StaffPortalUser): Promise<StaffEventListItem[]> {
	if (user.role === 'admin') {
		const eventRows = await db.select(eventColumns).from(events).orderBy(asc(events.startDate));
		return withDays(eventRows, null);
	}

	const rows = await db
		.select({ event: eventColumns, roleName: staffRoles.name })
		.from(eventStaff)
		.innerJoin(events, eq(eventStaff.eventId, events.id))
		.innerJoin(staffRoles, eq(eventStaff.staffRoleId, staffRoles.id))
		.where(eq(eventStaff.userId, user.id))
		.orderBy(asc(events.startDate));
	return withDays(
		rows.map((r: { event: StaffPortalEvent; roleName: string | null }) => r.event),
		rows.map((r: { event: StaffPortalEvent; roleName: string | null }) => r.roleName)
	);
}

/**
 * The Events where `user` holds `permission`, with their Days, in the
 * list's order (upcoming first, then past). Admins hold every permission
 * at every Event. One batched rule, not one access lookup per Event.
 */
export async function listStaffEventsWithPermission(
	user: StaffPortalUser,
	permission: StaffPermission
): Promise<StaffEventListItem[]> {
	if (user.role === 'admin') return listStaffEvents(user);

	type PermissionRow = {
		event: StaffPortalEvent;
		rolePermissions: unknown;
		granted: unknown;
		withdrawn: unknown;
	};
	const rows: PermissionRow[] = await db
		.select({
			event: eventColumns,
			rolePermissions: staffRoles.permissions,
			granted: eventStaff.grantedPermissions,
			withdrawn: eventStaff.withdrawnPermissions,
		})
		.from(eventStaff)
		.innerJoin(events, eq(eventStaff.eventId, events.id))
		.innerJoin(staffRoles, eq(eventStaff.staffRoleId, staffRoles.id))
		.where(eq(eventStaff.userId, user.id))
		.orderBy(asc(events.startDate));

	const items = await withDays(
		rows.map((r) => r.event),
		rows.map(() => null)
	);
	const whoByEvent = new Map(
		rows.map(
			(r: PermissionRow) =>
				[
					r.event.id,
				{
						rolePermissions: r.rolePermissions as StaffPermission[],
						granted: r.granted as StaffPermission[],
						withdrawn: r.withdrawn as StaffPermission[],
					},
				] as const
		)
	);
	const now = new Date();
	// Keep the list's upcoming-then-past order, not the query's date order.
	const kept: StaffEventListItem[] = [];
	for (const item of items) {
		const who = whoByEvent.get(item.event.id);
		if (!who) continue;
		const asking: StaffWho = {
			kind: 'assignment',
			rolePermissions: who.rolePermissions,
			granted: who.granted,
			withdrawn: who.withdrawn,
		};
		if (staffAccess(asking, item.days, item.event.timeZone, now).can(permission)) kept.push(item);
	}
	return kept;
}

/** An Event the user can scan right now (issue 034). */
export interface ScanTarget {
	eventId: string;
	title: string;
}

/**
 * The Events whose Day is under way and where the user holds
 * `scan_check_in` (Admins: every Event), in the Assignments list's
 * order. The floating Scan button opens the scanner over the current
 * page for one of these (issue 034), with a picker when there are
 * several.
 */
export async function scanTargetsFor(
	user: StaffPortalUser,
	now: Date = new Date()
): Promise<ScanTarget[]> {
	const items = await listStaffEventsWithPermission(user, 'scan_check_in');
	const targets: ScanTarget[] = [];
	for (const item of items) {
		if (activeDay(item.days, item.event.timeZone, now) !== null) {
			targets.push({
				eventId: item.event.id,
				title: item.event.titleFr || item.event.titleEn || 'Événement sans titre'
			});
		}
	}
	return targets;
}

/**
 * The Events each shortcut of the portal's header can start on, in the
 * Assignments list's order:
 * - « Nouvelle réservation »: `invite`, an Event with a Day still to come;
 * - « Fermer aux réservations »: `close_bookings`, the Day under way for a
 *   Staff member, a Day still to come for an Admin (as on the Event page);
 * - « Ajouter un walk-in »: `walk_in`, the Day under way.
 */
export interface HeaderActionTargets {
	invite: ScanTarget[];
	closeBookings: ScanTarget[];
	walkIn: ScanTarget[];
}

export async function headerActionTargetsFor(
	user: StaffPortalUser,
	now: Date = new Date()
): Promise<HeaderActionTargets> {
	const [invite, closeBookings, walkIn] = await Promise.all([
		listStaffEventsWithPermission(user, 'invite'),
		listStaffEventsWithPermission(user, 'close_bookings'),
		listStaffEventsWithPermission(user, 'walk_in')
	]);
	const underWay = (item: StaffEventListItem) =>
		activeDay(item.days, item.event.timeZone, now) !== null;
	const ahead = (item: StaffEventListItem) => hasDayAhead(item.days, item.event.timeZone, now);
	const target = (item: StaffEventListItem): ScanTarget => ({
		eventId: item.event.id,
		title: item.event.titleFr || item.event.titleEn || 'Événement sans titre'
	});
	return {
		invite: invite.filter(ahead).map(target),
		closeBookings: closeBookings.filter(user.role === 'admin' ? ahead : underWay).map(target),
		walkIn: walkIn.filter(underWay).map(target)
	};
}

async function withDays(
	eventRows: StaffPortalEvent[],
	roleNames: (string | null)[] | null
): Promise<StaffEventListItem[]> {
	const ids = eventRows.map((e) => e.id);
	const dayMap = new Map<string, string[]>();
	if (ids.length > 0) {
		const dayRows = await db
			.select({ eventId: eventDays.eventId, date: eventDays.date })
			.from(eventDays)
			.where(inArray(eventDays.eventId, ids))
			.orderBy(asc(eventDays.date));
		for (const row of dayRows) {
			const list = dayMap.get(row.eventId) ?? [];
			list.push(String(row.date));
			dayMap.set(row.eventId, list);
		}
	}

	const now = Date.now();
	const items = eventRows.map((event, i) => ({
		event,
		days: dayMap.get(event.id) ?? [],
		staffRoleName: roleNames ? roleNames[i] : null,
	}));
	// Upcoming and ongoing Events first, soonest first; then Events without
	// dates; then past ones, most recent first. An Event is past once its end
	// (or start, if it has no end) is behind us.
	const upcoming = items.filter((i) => endOf(i.event) !== null && endOf(i.event)! >= now);
	const undated = items.filter((i) => endOf(i.event) === null);
	const past = items.filter((i) => endOf(i.event) !== null && endOf(i.event)! < now).reverse();
	return [...upcoming, ...undated, ...past];
}

function endOf(event: StaffPortalEvent): number | null {
	return (event.endDate ?? event.startDate)?.getTime() ?? null;
}

// ---------------------------------------------------------------------------
// « Fermé aux réservations » (issue 039)
// ---------------------------------------------------------------------------

/** One Seating the close-bookings sheet (issue 039) offers. */
export interface StaffBookingSeating {
	id: string;
	/** The Seating's Day, 'YYYY-MM-DD'. */
	dayDate: string;
	/** Its Service (Déjeuner / Dîner), grouped by the sheet. */
	serviceId: string;
	serviceKind: 'lunch' | 'dinner';
	/** ISO start time. */
	startTime: string;
	/** Whether the Seating is closed to bookings. */
	closed: boolean;
}

/**
 * The Seatings the close-bookings sheet may act on: for a Staff member,
 * the current Day's; for an Admin, every upcoming Seating of the Event
 * (grouped by Day in the sheet).
 */
export async function seatingsForBookingClosure(
	eventId: string,
	day: string | null,
	admin: boolean
): Promise<StaffBookingSeating[]> {
	const now = new Date();
	const conditions = [eq(eventSessions.eventId, eventId)];
	if (admin) {
		conditions.push(gte(eventSessions.startTime, now));
	} else {
		if (day === null) return [];
		conditions.push(eq(eventDays.date, day));
	}
	const rows = await db
		.select({
			id: eventSessions.id,
			dayDate: eventDays.date,
			serviceId: eventServices.id,
			serviceKind: eventServices.kind,
			startTime: eventSessions.startTime,
			bookingsClosedAt: eventSessions.bookingsClosedAt
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(and(...conditions))
		.orderBy(asc(eventDays.date), asc(eventSessions.startTime));
	return rows.map(
		(r: {
			id: string;
			dayDate: string;
			serviceId: string;
			serviceKind: 'lunch' | 'dinner';
			startTime: Date;
			bookingsClosedAt: Date | null;
		}) => ({
			id: r.id,
			dayDate: String(r.dayDate),
			serviceId: r.serviceId,
			serviceKind: r.serviceKind,
			startTime: r.startTime.toISOString(),
			closed: r.bookingsClosedAt !== null
		})
	);
}

/**
 * Close (or reopen) Seatings to online bookings (issue 039). Refuses a
 * Seating of another Event, and — for a Staff member, who may only act
 * during a Day — one of another Day than the current. Returns the ids
 * actually written to, for the audit entry.
 */
export async function setSeatingBookingsClosed(input: {
	eventId: string;
	seatingIds: string[];
	closed: boolean;
	actorId: string;
	/** A Staff member acts only on the current Day's Seatings. */
	day: string | null;
	admin: boolean;
}): Promise<{ ok: true; written: string[] } | { ok: false; error: string }> {
	if (input.seatingIds.length === 0) return { ok: false, error: 'Aucune séance choisie.' };
	if (!input.admin && input.day === null) {
		return { ok: false, error: "Aucun jour en cours : impossible de fermer aux réservations." };
	}
	const conditions = [
		eq(eventSessions.eventId, input.eventId),
		inArray(eventSessions.id, input.seatingIds)
	];
	if (!input.admin) conditions.push(eq(eventDays.date, input.day!));
	const rows = await db
		.select({ id: eventSessions.id })
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(and(...conditions));
	if (rows.length !== input.seatingIds.length) {
		return { ok: false, error: 'Séance introuvable pour cet événement.' };
	}
	const written = rows.map((r: { id: string }) => r.id);
	await db
		.update(eventSessions)
		.set(
			input.closed
				? { bookingsClosedAt: new Date(), bookingsClosedBy: input.actorId, updatedAt: new Date() }
				: { bookingsClosedAt: null, bookingsClosedBy: null, updatedAt: new Date() }
		)
		.where(inArray(eventSessions.id, written));
	return { ok: true, written };
}

// ---------------------------------------------------------------------------
// « Nouvelle réservation » (issue 040)
// ---------------------------------------------------------------------------

/** One upcoming published Seating the invitation sheet (issue 040) offers. */
export interface StaffInviteSeating {
	id: string;
	/** The Seating's Day, 'YYYY-MM-DD'. */
	dayDate: string;
	/** Its Service (Déjeuner / Dîner), grouped by the sheet. */
	serviceKind: 'lunch' | 'dinner';
	/** ISO start time. */
	startTime: string;
	/**
	 * Remaining capacity, or null when the Seating has no limit (ADR 0009).
	 * `createCompReservation` refuses a full Seating, so the sheet marks
	 * those « Complet ».
	 */
	remaining: number | null;
}

/**
 * Every upcoming published Seating of an Event (issue 040): the invitation
 * sheet offers any of them, today first — unlike a Walk-in, an invitation
 * is not limited to the current Day.
 */
export async function upcomingSeatingsForInvitation(eventId: string): Promise<StaffInviteSeating[]> {
	const rows = await db
		.select({
			id: eventSessions.id,
			dayDate: eventDays.date,
			serviceKind: eventServices.kind,
			startTime: eventSessions.startTime,
			availableCapacity: eventSessions.availableCapacity
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(
			and(
				eq(eventSessions.eventId, eventId),
				eq(eventSessions.published, true),
				gte(eventSessions.startTime, new Date())
			)
		)
		.orderBy(asc(eventDays.date), asc(eventSessions.startTime));
	return rows.map(
		(r: {
			id: string;
			dayDate: string;
			serviceKind: 'lunch' | 'dinner';
			startTime: Date;
			availableCapacity: number | null;
		}) => ({
			id: r.id,
			dayDate: String(r.dayDate),
			serviceKind: r.serviceKind,
			startTime: r.startTime.toISOString(),
			remaining: r.availableCapacity
		})
	);
}
