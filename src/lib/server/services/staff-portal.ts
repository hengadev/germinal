/**
 * The Staff portal's single door (issue 015): every portal page load and
 * action asks this module, which loads the Event, its Days and the
 * Assignment, then delegates to the pure Staff access module. The UI only
 * reflects the answer.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { eventDays, eventStaff, events, staffRoles } from '../db/schema';
import { staffAccess, type StaffAccess, type StaffWho } from '$lib/staff/access';
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
	if (user.role === 'admin') {
		who = { kind: 'admin' };
	} else {
		const [assignment] = await db
			.select({
				rolePermissions: staffRoles.permissions,
				granted: eventStaff.grantedPermissions,
				withdrawn: eventStaff.withdrawnPermissions,
				roleName: staffRoles.name,
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
	}

	return { event, staffRoleName, ...staffAccess(who, dates, event.timeZone, now) };
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
	// Upcoming Events first (by start, Events without a start last), then past.
	return items.sort((a, b) => rank(a.event.startDate, now) - rank(b.event.startDate, now));
}

function rank(startDate: Date | null, now: number): number {
	if (!startDate) return 1; // no start date: keep after upcoming, order preserved
	return startDate.getTime() >= now ? 0 : 2;
}
