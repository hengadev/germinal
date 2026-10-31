/**
 * An Event's Brief for its staff (issue 032): a general part for
 * everyone, plus an optional part per Staff role assigned on the Event.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { eventRoleBriefs, eventStaff, events, staffRoles } from '../db/schema';

/** One role's part of the Brief, with the role's name. */
export interface EventRoleBrief {
	staffRoleId: string;
	staffRoleName: string;
	body: string;
}

export interface EventBrief {
	/** The general part, or null when there is none. */
	general: string | null;
	roles: EventRoleBrief[];
}

/** The Event's Brief: the general part and every role part, role name first. */
export async function getEventBrief(eventId: string): Promise<EventBrief> {
	const [event] = await db
		.select({ staffBrief: events.staffBrief })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);

	const roles = await db
		.select({
			staffRoleId: eventRoleBriefs.staffRoleId,
			staffRoleName: staffRoles.name,
			body: eventRoleBriefs.body,
		})
		.from(eventRoleBriefs)
		.innerJoin(staffRoles, eq(eventRoleBriefs.staffRoleId, staffRoles.id))
		.where(eq(eventRoleBriefs.eventId, eventId))
		.orderBy(asc(staffRoles.name));

	return { general: event?.staffBrief ?? null, roles };
}

export class UnassignedRoleError extends Error {
	constructor() {
		super('Ce rôle n’est pas assigné sur cet événement');
	}
}

/**
 * Save the Event's Brief. Bodies are trimmed; an empty general part
 * clears it and an empty role part deletes its row. Only roles assigned
 * on the Event (`event_staff`) are accepted.
 */
export async function saveEventBrief(
	eventId: string,
	input: { general?: string; roles?: Record<string, string> }
): Promise<void> {
	const general = input.general?.trim() ?? '';
	await db
		.update(events)
		.set({ staffBrief: general === '' ? null : general })
		.where(eq(events.id, eventId));

	const roleIds = Object.keys(input.roles ?? {});
	const parts = Object.entries(input.roles ?? {})
		.map(([staffRoleId, body]) => ({ staffRoleId, body: (body ?? '').trim() }))
		.filter((part) => part.body !== '');

	if (roleIds.length > 0) {
		const assigned = await db
			.select({ staffRoleId: eventStaff.staffRoleId })
			.from(eventStaff)
			.where(
				and(eq(eventStaff.eventId, eventId), inArray(eventStaff.staffRoleId, roleIds))
			);
		const assignedIds = new Set(assigned.map((a: { staffRoleId: string }) => a.staffRoleId));
		if (roleIds.some((id) => !assignedIds.has(id))) {
			throw new UnassignedRoleError();
		}
	}

	for (const part of parts) {
		await db
			.insert(eventRoleBriefs)
			.values({ eventId, staffRoleId: part.staffRoleId, body: part.body })
			.onConflictDoUpdate({
				target: [eventRoleBriefs.eventId, eventRoleBriefs.staffRoleId],
				set: { body: part.body, updatedAt: new Date() },
			});
	}

	// An emptied role part deletes its row.
	const removed = roleIds.filter((id) => !parts.some((p) => p.staffRoleId === id));
	if (removed.length > 0) {
		await db.delete(eventRoleBriefs).where(
			and(eq(eventRoleBriefs.eventId, eventId), inArray(eventRoleBriefs.staffRoleId, removed))
		);
	}
}
