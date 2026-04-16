import { db } from '../db';
import { eventStaff, users, events } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export class StaffAssignmentError extends Error {
	constructor(
		message: string,
		public readonly code: 'NOT_FOUND' | 'WRONG_ROLE' | 'ALREADY_ASSIGNED'
	) {
		super(message);
		this.name = 'StaffAssignmentError';
	}
}

export interface EventStaffWithUser {
	id: string;
	eventId: string;
	userId: string;
	roleLabel: string | null;
	createdAt: Date;
	user: {
		id: string;
		email: string;
		firstName: string;
		lastName: string;
		phone: string | null;
		role: string;
	};
}

export interface EventStaffWithEvent {
	id: string;
	eventId: string;
	userId: string;
	roleLabel: string | null;
	createdAt: Date;
	event: {
		id: string;
		titleEn: string;
		titleFr: string;
		startDate: Date;
		endDate: Date;
	};
}

/**
 * Assign a staff member to an event
 */
export async function assignStaff(
	eventId: string,
	userId: string,
	roleLabel?: string
): Promise<EventStaffWithUser> {
	try {
		// Validate user exists and has staff role
		const [user] = await db
			.select({ id: users.id, role: users.role })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			throw new StaffAssignmentError('User not found', 'NOT_FOUND');
		}
		if (user.role !== 'staff') {
			throw new StaffAssignmentError('User does not have the staff role', 'WRONG_ROLE');
		}

		// Check for duplicate assignment
		const alreadyAssigned = await isUserAssignedToEvent(userId, eventId);
		if (alreadyAssigned) {
			throw new StaffAssignmentError(
				'Staff member is already assigned to this event',
				'ALREADY_ASSIGNED'
			);
		}

		const [staff] = await db
			.insert(eventStaff)
			.values({
				eventId,
				userId,
				roleLabel: roleLabel || null,
			})
			.returning();

		if (!staff) {
			throw new Error('Failed to assign staff to event');
		}

		// Fetch only the newly inserted record with its user
		const [fullStaff] = await db.query.eventStaff.findMany({
			where: eq(eventStaff.id, staff.id),
			with: { user: true },
			limit: 1,
		});

		if (!fullStaff) {
			throw new Error('Failed to retrieve assigned staff');
		}

		logger.info(`Assigned staff ${userId} to event ${eventId} with role ${roleLabel || 'default'}`);
		return {
			...fullStaff,
			user: {
				id: fullStaff.user.id,
				email: fullStaff.user.email,
				firstName: fullStaff.user.firstName,
				lastName: fullStaff.user.lastName,
				phone: fullStaff.user.phone,
				role: fullStaff.user.role,
			},
		};
	} catch (error) {
		logger.error({ err: error }, 'Failed to assign staff to event');
		throw error;
	}
}

/**
 * Remove a staff member from an event
 */
export async function removeStaff(eventId: string, userId: string): Promise<void> {
	try {
		await db
			.delete(eventStaff)
			.where(
				and(
					eq(eventStaff.eventId, eventId),
					eq(eventStaff.userId, userId)
				)
			);

		logger.info(`Removed staff ${userId} from event ${eventId}`);
	} catch (error) {
		logger.error({ err: error }, 'Failed to remove staff from event');
		throw error;
	}
}

/**
 * Get all staff assigned to an event
 */
export async function getStaffForEvent(eventId: string): Promise<EventStaffWithUser[]> {
	try {
		const staff = await db.query.eventStaff.findMany({
			where: eq(eventStaff.eventId, eventId),
			with: {
				user: true,
			},
			orderBy: (eventStaff, { asc }) => [asc(eventStaff.createdAt)],
		});

		return staff.map(s => ({
			...s,
			user: {
				id: s.user.id,
				email: s.user.email,
				firstName: s.user.firstName,
				lastName: s.user.lastName,
				phone: s.user.phone,
				role: s.user.role,
			},
		}));
	} catch (error) {
		logger.error({ err: error }, 'Failed to get staff for event');
		throw error;
	}
}

/**
 * Get all events a staff member is assigned to
 */
export async function getEventsForStaff(userId: string): Promise<EventStaffWithEvent[]> {
	try {
		const assignments = await db.query.eventStaff.findMany({
			where: eq(eventStaff.userId, userId),
			with: {
				event: true,
			},
			orderBy: (eventStaff, { desc }) => [desc(eventStaff.createdAt)],
		});

		return assignments.map(a => ({
			...a,
			event: {
				id: a.event.id,
				titleEn: a.event.titleEn,
				titleFr: a.event.titleFr,
				startDate: a.event.startDate,
				endDate: a.event.endDate,
			},
		}));
	} catch (error) {
		logger.error({ err: error }, 'Failed to get events for staff');
		throw error;
	}
}

/**
 * Get all staff users (for dropdowns)
 */
export async function getAllStaff(): Promise<Array<{ id: string; email: string; firstName: string; lastName: string; phone: string | null; role: string; createdAt: Date }>> {
	try {
		const staff = await db
			.select({
				id: users.id,
				email: users.email,
				firstName: users.firstName,
				lastName: users.lastName,
				phone: users.phone,
				role: users.role,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(eq(users.role, 'staff'));

		return staff;
	} catch (error) {
		logger.error({ err: error }, 'Failed to get all staff');
		throw error;
	}
}

/**
 * Check if a user is assigned to an event
 */
export async function isUserAssignedToEvent(userId: string, eventId: string): Promise<boolean> {
	try {
		const [assignment] = await db
			.select()
			.from(eventStaff)
			.where(
				and(
					eq(eventStaff.userId, userId),
					eq(eventStaff.eventId, eventId)
				)
			)
			.limit(1);

		return !!assignment;
	} catch (error) {
		logger.error({ err: error }, 'Failed to check user assignment');
		throw error;
	}
}
