/**
 * Guest notes and tags (issue 050): a private Admin note and free-text
 * tags on a Guest, one row per normalised email, created on the first
 * note or tag. Saving is Admin-only and audited (never with the note's
 * text); the personal-data purge job deletes a row once no
 * non-anonymised Reservation with that email remains.
 */
import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { guestNotes, users } from '../db/schema';

/**
 * The audit log's id for a Guest: a short SHA-256 of the normalised email.
 * Never the email nor the URL key (base64, reversible), so the log keeps
 * no personal data and outlives an erasure (issue 055).
 */
export function guestAuditId(email: string): string {
	return 'sha256:' + createHash('sha256').update(email).digest('hex').slice(0, 16);
}

/** At most 5 tags per Guest, each up to 30 characters. */
export const MAX_GUEST_TAGS = 5;
export const MAX_GUEST_TAG_LENGTH = 30;
/** The note is plain text, up to 2000 characters. */
export const MAX_GUEST_NOTE_LENGTH = 2000;

/** Tag suggestions shown alongside the tags already in use. */
export const DEFAULT_TAG_SUGGESTIONS = ['Habitué', 'VIP', 'Presse'];

export interface GuestNotesRecord {
	email: string;
	note: string | null;
	tags: string[];
	updatedAt: Date;
	/** The saving Admin's email, null once their account is gone. */
	updatedByEmail: string | null;
}

export type SaveGuestNotesResult = { ok: true } | { ok: false; error: string };

/**
 * Split free text into tags: commas separate, values are trimmed and
 * empties dropped, duplicates (case-insensitive) keep their first
 * spelling. Length and count limits are checked by saveGuestNotes.
 */
export function parseTags(input: string): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const part of input.split(',')) {
		const tag = part.trim();
		if (tag.length === 0) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		tags.push(tag);
	}
	return tags;
}

/**
 * Create or update a Guest's note and tags. An empty note clears it.
 * The row is keyed by the normalised email.
 */
export async function saveGuestNotes(
	email: string,
	input: { note: string; tags: string[] },
	adminId: string
): Promise<SaveGuestNotesResult> {
	const note = input.note.trim();
	if (note.length > MAX_GUEST_NOTE_LENGTH) {
		return { ok: false, error: `La note ne peut pas dépasser ${MAX_GUEST_NOTE_LENGTH} caractères.` };
	}
	const tags: string[] = [];
	for (const tag of parseTags(input.tags.join(','))) {
		if (tag.length > MAX_GUEST_TAG_LENGTH) {
			return { ok: false, error: `Chaque tag est limité à ${MAX_GUEST_TAG_LENGTH} caractères.` };
		}
		tags.push(tag);
	}
	if (tags.length > MAX_GUEST_TAGS) {
		return { ok: false, error: `Au plus ${MAX_GUEST_TAGS} tags par client.` };
	}

	await db
		.insert(guestNotes)
		.values({
			email,
			note: note.length > 0 ? note : null,
			tags,
			updatedBy: adminId,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: guestNotes.email,
			set: {
				note: note.length > 0 ? note : null,
				tags,
				updatedBy: adminId,
				updatedAt: new Date()
			}
		});
	return { ok: true };
}

/** The Guest's note-and-tags row, or null when none was ever saved. */
export async function getGuestNotes(email: string): Promise<GuestNotesRecord | null> {
	const [row] = await db
		.select({
			email: guestNotes.email,
			note: guestNotes.note,
			tags: guestNotes.tags,
			updatedAt: guestNotes.updatedAt,
			updatedByEmail: users.email
		})
		.from(guestNotes)
		.leftJoin(users, eq(users.id, guestNotes.updatedBy))
		// A set-null FK: the row survives its Admin's account.
		.where(sql`${guestNotes.email} = ${email}`);
	if (!row) return null;
	return { ...row, tags: row.tags ?? [] };
}

/** Tags per email, for the Clients list; emails without a row get []. */
export async function tagsByEmail(emails: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (emails.length === 0) return map;
	const rows = await db
		.select({ email: guestNotes.email, tags: guestNotes.tags })
		.from(guestNotes)
		.where(inArray(guestNotes.email, emails));
	for (const row of rows) map.set(row.email, row.tags ?? []);
	return map;
}

/** Every tag in use (alphabetical) plus the default suggestions, deduped. */
export async function tagSuggestions(): Promise<string[]> {
	const rows = (await db
		.select({ tag: sql<string>`unnest(${guestNotes.tags})` })
		.from(guestNotes)) as { tag: string }[];
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const tag of [...rows.map((r) => r.tag), ...DEFAULT_TAG_SUGGESTIONS]) {
		const key = tag.trim().toLowerCase();
		if (key.length === 0 || seen.has(key)) continue;
		seen.add(key);
		tags.push(tag.trim());
	}
	return tags.sort((a, b) => a.localeCompare(b, 'fr'));
}
