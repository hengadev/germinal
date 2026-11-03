import { db } from '../db';
import { eventExtras, reservationExtras } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { EditorEventExtra, EventExtraPayload, ExtrasPayload } from '$lib/types/pricing-editor';
import { ScheduleSaveRefusedError } from './event-schedule';

/**
 * Event extras (issue 067): what an Event offers alongside its meals — a
 * wine pairing, a workshop seat… — described once per Event (EN/FR) with a
 * price in the Event's currency, per person or per unit. This module owns
 * the extras section of the « Menus & tarifs » admin tab: load, parse and
 * save (one transaction). An extra already chosen on a Reservation
 * (`reservation_extras`, issue 068) can be deactivated but not deleted.
 */

/** Upper bound on an extra's price or stock. */
const MAX_EXTRA_AMOUNT = 10_000_000;
const MAX_EXTRA_TEXT = 255;
const MAX_EXTRA_DESCRIPTION = 10_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTRA_UNITS = ['per_person', 'per_unit'] as const;

/** The Event's extras in display order, with whether each is booked. */
export async function loadExtrasEditor(eventId: string): Promise<EditorEventExtra[]> {
	const rows: Omit<EditorEventExtra, 'booked'>[] = await db
		.select({
			id: eventExtras.id,
			nameEn: eventExtras.nameEn,
			nameFr: eventExtras.nameFr,
			descriptionEn: eventExtras.descriptionEn,
			descriptionFr: eventExtras.descriptionFr,
			priceAmount: eventExtras.priceAmount,
			unit: eventExtras.unit,
			stock: eventExtras.stock,
			position: eventExtras.position,
			active: eventExtras.active,
		})
		.from(eventExtras)
		.where(eq(eventExtras.eventId, eventId))
		.orderBy(eventExtras.position, eventExtras.createdAt, eventExtras.id);
	if (rows.length === 0) return [];
	const booked: { eventExtraId: string }[] = await db
		.selectDistinct({ eventExtraId: reservationExtras.eventExtraId })
		.from(reservationExtras)
		.where(inArray(reservationExtras.eventExtraId, rows.map((row) => row.id)));
	const bookedIds = new Set(booked.map((row) => row.eventExtraId));
	return rows.map((row) => ({ ...row, booked: bookedIds.has(row.id) }));
}

// ---------------------------------------------------------------------------
// Parsing the extras payload
// ---------------------------------------------------------------------------

export type ExtrasParseFailure = 'missing' | 'malformed' | 'name' | 'price' | 'stock';

export type ExtrasParseResult =
	| { ok: true; payload: ExtrasPayload }
	| { ok: false; reason: ExtrasParseFailure };

function requiredText(value: unknown, maxLength: number): string | false {
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	return trimmed === '' || trimmed.length > maxLength ? false : trimmed;
}

function optionalText(value: unknown, maxLength: number): string | null | false {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	if (trimmed.length > maxLength) return false;
	return trimmed === '' ? null : trimmed;
}

function isAmount(value: unknown): value is number {
	const amount = value as number;
	return typeof value === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= MAX_EXTRA_AMOUNT;
}

/**
 * Parse the extras payload posted by the « Menus & tarifs » tab: each
 * extra's names (both required), optional descriptions, price in minor
 * units (zero allowed), unit, optional stock and active flag, in display
 * order. Returns a failure reason the admin form maps to French copy.
 */
export function parseExtrasPayload(raw: string | null): ExtrasParseResult {
	if (raw === null || raw.trim() === '') {
		return { ok: false, reason: 'missing' };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { extras?: unknown }).extras)) {
		return { ok: false, reason: 'malformed' };
	}
	const extras: EventExtraPayload[] = [];
	const keys = new Set<string>();
	const ids = new Set<string>();
	for (const entry of (parsed as { extras: unknown[] }).extras) {
		if (typeof entry !== 'object' || entry === null) {
			return { ok: false, reason: 'malformed' };
		}
		const extra = entry as Record<string, unknown>;
		if (typeof extra.key !== 'string' || extra.key === '' || keys.has(extra.key)) {
			return { ok: false, reason: 'malformed' };
		}
		if (extra.id !== null && (typeof extra.id !== 'string' || !UUID_PATTERN.test(extra.id) || ids.has(extra.id))) {
			return { ok: false, reason: 'malformed' };
		}
		const nameEn = requiredText(extra.nameEn, MAX_EXTRA_TEXT);
		const nameFr = requiredText(extra.nameFr, MAX_EXTRA_TEXT);
		if (nameEn === false || nameFr === false) {
			return { ok: false, reason: 'name' };
		}
		const descriptionEn = optionalText(extra.descriptionEn, MAX_EXTRA_DESCRIPTION);
		const descriptionFr = optionalText(extra.descriptionFr, MAX_EXTRA_DESCRIPTION);
		if (descriptionEn === false || descriptionFr === false) {
			return { ok: false, reason: 'malformed' };
		}
		if (!isAmount(extra.priceAmount)) {
			return { ok: false, reason: 'price' };
		}
		if (typeof extra.unit !== 'string' || !(EXTRA_UNITS as readonly string[]).includes(extra.unit)) {
			return { ok: false, reason: 'malformed' };
		}
		if (extra.stock !== null && !isAmount(extra.stock)) {
			return { ok: false, reason: 'stock' };
		}
		if (typeof extra.active !== 'boolean') {
			return { ok: false, reason: 'malformed' };
		}
		keys.add(extra.key);
		if (extra.id !== null) ids.add(extra.id as string);
		extras.push({
			key: extra.key,
			id: extra.id as string | null,
			nameEn,
			nameFr,
			descriptionEn,
			descriptionFr,
			priceAmount: extra.priceAmount,
			unit: extra.unit as EventExtraPayload['unit'],
			stock: extra.stock as number | null,
			active: extra.active,
		});
	}
	return { ok: true, payload: { extras } };
}

/** French admin copy for each way the extras payload can be invalid. */
export function extrasPayloadErrorMessage(reason: ExtrasParseFailure): string {
	switch (reason) {
		case 'missing':
			return 'Les extras de l’événement sont requis.';
		case 'malformed':
			return 'Les extras soumis sont invalides.';
		case 'name':
			return 'Chaque extra doit avoir un nom en français et en anglais (255 caractères au plus).';
		case 'price':
			return 'Le prix de chaque extra doit être un montant positif ou nul, au centime près.';
		case 'stock':
			return 'Le stock de chaque extra doit être un nombre entier positif ou nul, ou vide pour un stock illimité.';
	}
}

// ---------------------------------------------------------------------------
// Saving the extras
// ---------------------------------------------------------------------------

/** Refused: the payload names an extra outside this Event. */
export class UnknownExtraTargetError extends ScheduleSaveRefusedError {
	constructor() {
		super('Impossible d’enregistrer : un des extras soumis n’appartient pas à cet événement.');
		this.name = 'UnknownExtraTargetError';
	}
}

/** Refused: a removed extra is already booked on a Reservation. */
export class ExtraInUseError extends ScheduleSaveRefusedError {
	constructor(names: string[]) {
		super(
			`Impossible de supprimer ${names.length > 1 ? 'les extras' : 'l’extra'} « ${names.join(' », « ')} » : ` +
			'déjà réservé par un convive. Désactivez-le plutôt pour le retirer de la vente.'
		);
		this.name = 'ExtraInUseError';
	}
}

/** What an extras save made. */
export interface SavedExtras {
	/** Each posted extra's id by its key, created ones included: the editor
	 * keeps its drafts and takes their ids. */
	extraIds: Record<string, string>;
}

/**
 * Save the extras section in one transaction: new extras are created,
 * listed ones updated (position = payload order), extras left out deleted.
 * Refuses — with a French message and nothing written — an extra of
 * another Event and deleting an extra already booked on a Reservation
 * (deactivate it instead).
 */
export async function saveExtras(eventId: string, payload: ExtrasPayload): Promise<SavedExtras> {
	return db.transaction(async (tx: typeof db): Promise<SavedExtras> => {
		const existing: { id: string; nameFr: string }[] = await tx
			.select({ id: eventExtras.id, nameFr: eventExtras.nameFr })
			.from(eventExtras)
			.where(eq(eventExtras.eventId, eventId))
			.for('update');
		const existingIds = new Set(existing.map((row) => row.id));

		for (const extra of payload.extras) {
			if (extra.id !== null && !existingIds.has(extra.id)) {
				throw new UnknownExtraTargetError();
			}
		}

		// Extras left out of the payload are deleted — unless a Reservation
		// has already chosen one (issue 068): those are deactivated, not
		// deleted, so their snapshots keep making sense.
		const listedIds = new Set(payload.extras.flatMap((extra) => (extra.id === null ? [] : [extra.id])));
		const removed = existing.filter((row) => !listedIds.has(row.id));
		if (removed.length > 0) {
			const booked: { eventExtraId: string }[] = await tx
				.selectDistinct({ eventExtraId: reservationExtras.eventExtraId })
				.from(reservationExtras)
				.where(inArray(reservationExtras.eventExtraId, removed.map((row) => row.id)));
			if (booked.length > 0) {
				const bookedIds = new Set(booked.map((row) => row.eventExtraId));
				throw new ExtraInUseError(removed.filter((row) => bookedIds.has(row.id)).map((row) => row.nameFr));
			}
			await tx.delete(eventExtras).where(inArray(eventExtras.id, removed.map((row) => row.id)));
		}

		const extraIdByKey = new Map<string, string>();
		for (const [index, extra] of payload.extras.entries()) {
			const fields = {
				nameEn: extra.nameEn,
				nameFr: extra.nameFr,
				descriptionEn: extra.descriptionEn,
				descriptionFr: extra.descriptionFr,
				priceAmount: extra.priceAmount,
				unit: extra.unit,
				stock: extra.stock,
				position: index,
				active: extra.active,
			};
			if (extra.id === null) {
				const [created]: { id: string }[] = await tx.insert(eventExtras)
					.values({ eventId, ...fields })
					.returning({ id: eventExtras.id });
				extraIdByKey.set(extra.key, created.id);
			} else {
				await tx.update(eventExtras)
					.set({ ...fields, updatedAt: new Date() })
					.where(eq(eventExtras.id, extra.id));
				extraIdByKey.set(extra.key, extra.id);
			}
		}
		return { extraIds: Object.fromEntries(extraIdByKey) };
	});
}
