import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { events } from '../db/schema';
import { jobLogger } from '../logger';
import { deleteEmptyDraft, EMPTY_DRAFT_IDLE_HOURS } from '../services/event-draft';

/**
 * Delete the empty Drafts no one came back to (issue 015, ADR 0010):
 * those not updated for 24 hours. The emptiness check is the one the
 * editor's leave endpoint uses, so only an empty Draft is ever deleted —
 * a Draft with anything filled in, and any published Event, stays. Run
 * hourly via pg-boss; the scheduler skips it in mock mode.
 */
export async function cleanupEmptyDrafts(now: Date = new Date()) {
	const cutoff = new Date(now.getTime() - EMPTY_DRAFT_IDLE_HOURS * 60 * 60 * 1000);
	const stale = await db
		.select({ id: events.id })
		.from(events)
		.where(and(eq(events.visibility, 'draft'), lt(events.updatedAt, cutoff)));

	const deleted: string[] = [];
	const errors: string[] = [];
	for (const { id } of stale) {
		try {
			if (await deleteEmptyDraft(id)) deleted.push(id);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			jobLogger.error({ eventId: id, error: errorMsg }, '[Empty Drafts Job] Failed to delete a stale Draft');
			errors.push(`${id}: ${errorMsg}`);
		}
	}

	if (deleted.length > 0 || errors.length > 0) {
		jobLogger.info({ deleted: deleted.length, failed: errors.length }, '[Empty Drafts Job] Completed');
	}
	return { deleted: deleted.length, errors };
}
