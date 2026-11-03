import { db } from '../db';
import { eventExtras, reservationExtras, reservations } from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

// ---------------------------------------------------------------------------
// Booking (issue 068)
// ---------------------------------------------------------------------------

/** An Extra a Guest chose at booking, as the API takes it. */
export interface BookingExtraChoice {
	extraId: string;
	quantity: number;
}

/** Upper bound on a per-unit Extra's quantity at booking. */
export const MAX_EXTRA_QUANTITY = 20;

/** Thrown when booking (or an Admin change) would take an Extra past its
 * stock; carries the Extra's name for the Guest-facing message. */
export class ExtraSoldOutError extends Error {
	constructor(
		public readonly extraNameFr: string,
		public readonly extraNameEn: string
	) {
		super(`Extra sold out: ${extraNameEn}`);
		this.name = 'ExtraSoldOutError';
	}
	get messageFr(): string {
		return `« ${this.extraNameFr} » n’est plus disponible en quantité suffisante.`;
	}
	get messageEn(): string {
		return `“${this.extraNameEn}” is no longer available in sufficient quantity.`;
	}
}

/** The snapshots a booking stores on the Reservation. */
export interface ReservationExtraSnapshot {
	eventExtraId: string;
	nameEn: string;
	nameFr: string;
	unitPrice: number;
	unit: 'per_person' | 'per_unit';
	quantity: number;
}

/** Statuses of Reservations that still hold their Extras' stock. */
const STOCK_HOLDING_STATUSES = ['pending', 'processing', 'confirmed'] as const;

/**
 * Resolve a booking's Extras against the Event's active ones, under the
 * `event_extras` rows' lock (call inside the booking transaction): a
 * per-person Extra takes the party size as its quantity (the client's is
 * ignored), a per-unit one keeps what was asked. Refuses with
 * {@link ExtraSoldOutError} when an Extra is unknown, inactive, of another
 * Event, or when its stock cannot cover the request — stock counts every
 * booked quantity on Reservations that still hold seats.
 */
export async function resolveBookingExtras(
	tx: typeof db,
	eventId: string,
	seats: number,
	choices: BookingExtraChoice[]
): Promise<{ snapshots: ReservationExtraSnapshot[]; total: number }> {
	if (choices.length === 0) return { snapshots: [], total: 0 };

	// One row per Extra, even if a client sent duplicates.
	const asked = new Map<string, number>();
	for (const choice of choices) {
		if (choice.quantity < 1) continue;
		asked.set(choice.extraId, Math.min(MAX_EXTRA_QUANTITY, choice.quantity + (asked.get(choice.extraId) ?? 0)));
	}
	if (asked.size === 0) return { snapshots: [], total: 0 };

	const rows = await tx
		.select()
		.from(eventExtras)
		.where(and(inArray(eventExtras.id, [...asked.keys()]), eq(eventExtras.eventId, eventId)))
		.for('update') as unknown as (typeof eventExtras.$inferSelect)[];
	const byId = new Map(rows.map((row: typeof eventExtras.$inferSelect) => [row.id, row]));
	for (const id of asked.keys()) {
		const row = byId.get(id);
		if (!row) throw new ExtraSoldOutError('Supplément', 'Extra');
		if (!row.active) throw new ExtraSoldOutError(row.nameFr, row.nameEn);
	}

	const booked: { eventExtraId: string; booked: number }[] = await tx
		.select({
			eventExtraId: reservationExtras.eventExtraId,
			booked: sql<number>`coalesce(sum(${reservationExtras.quantity}), 0)::int`,
		})
		.from(reservationExtras)
		.innerJoin(reservations, eq(reservationExtras.reservationId, reservations.id))
		.where(and(
			inArray(reservationExtras.eventExtraId, [...asked.keys()]),
			inArray(reservations.status, [...STOCK_HOLDING_STATUSES])
		))
		.groupBy(reservationExtras.eventExtraId);
	const bookedById = new Map(booked.map((row) => [row.eventExtraId, row.booked]));

	let total = 0;
	const snapshots: ReservationExtraSnapshot[] = [];
	for (const row of rows) {
		// Rows are ordered by the Map's insertion; resolve every asked Extra.
		const quantity = row.unit === 'per_person' ? seats : (asked.get(row.id) ?? 0);
		if (quantity < 1) continue;
		if (row.stock !== null && (bookedById.get(row.id) ?? 0) + quantity > row.stock) {
			throw new ExtraSoldOutError(row.nameFr, row.nameEn);
		}
		snapshots.push({
			eventExtraId: row.id,
			nameEn: row.nameEn,
			nameFr: row.nameFr,
			unitPrice: row.priceAmount,
			unit: row.unit,
			quantity,
		});
		total += row.priceAmount * quantity;
	}
	return { snapshots, total };
}

/** A Reservation's Extras snapshots, in booking order. */
export async function loadReservationExtras(
	reservationId: string
): Promise<(ReservationExtraSnapshot & { id: string })[]> {
	const { db } = await import('../db');
	return db
		.select({
			id: reservationExtras.id,
			eventExtraId: reservationExtras.eventExtraId,
			nameEn: reservationExtras.nameEn,
			nameFr: reservationExtras.nameFr,
			unitPrice: reservationExtras.unitPrice,
			unit: reservationExtras.unit,
			quantity: reservationExtras.quantity,
		})
		.from(reservationExtras)
		.where(eq(reservationExtras.reservationId, reservationId));
}

/** The Extras' total of a Reservation's snapshots, in minor units. */
export const extrasTotalOf = (snapshots: { unitPrice: number; quantity: number }[]): number =>
	snapshots.reduce((sum, snapshot) => sum + snapshot.unitPrice * snapshot.quantity, 0);

/** A bookable Extra as the booking page shows it (issue 068). */
export interface BookableExtra {
	id: string;
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
	priceAmount: number;
	unit: 'per_person' | 'per_unit';
	/** Units still bookable, or null when the Extra is unlimited. */
	remaining: number | null;
}

/** The Event's active Extras for the booking form, with what stock each
 * has left (stock minus every booked quantity on Reservations that still
 * hold seats). */
export async function loadBookableExtras(eventId: string): Promise<BookableExtra[]> {
	const rows = await db
		.select({
			id: eventExtras.id,
			nameEn: eventExtras.nameEn,
			nameFr: eventExtras.nameFr,
			descriptionEn: eventExtras.descriptionEn,
			descriptionFr: eventExtras.descriptionFr,
			priceAmount: eventExtras.priceAmount,
			unit: eventExtras.unit,
			stock: eventExtras.stock,
		})
		.from(eventExtras)
		.where(and(eq(eventExtras.eventId, eventId), eq(eventExtras.active, true)))
		.orderBy(eventExtras.position, eventExtras.createdAt, eventExtras.id);
	if (rows.length === 0) return [];
	const booked: { eventExtraId: string; booked: number }[] = await db
		.select({
			eventExtraId: reservationExtras.eventExtraId,
			booked: sql<number>`coalesce(sum(${reservationExtras.quantity}), 0)::int`,
		})
		.from(reservationExtras)
		.innerJoin(reservations, eq(reservationExtras.reservationId, reservations.id))
		.where(and(
			inArray(reservationExtras.eventExtraId, rows.map((row: { id: string }) => row.id)),
			inArray(reservations.status, [...STOCK_HOLDING_STATUSES])
		))
		.groupBy(reservationExtras.eventExtraId);
	const bookedById = new Map(booked.map((row: { eventExtraId: string; booked: number }) => [row.eventExtraId, row.booked]));
	return rows.map((row: typeof rows[number]) => ({
		id: row.id,
		nameEn: row.nameEn,
		nameFr: row.nameFr,
		descriptionEn: row.descriptionEn,
		descriptionFr: row.descriptionFr,
		priceAmount: row.priceAmount,
		unit: row.unit,
		remaining: row.stock === null ? null : Math.max(0, row.stock - (bookedById.get(row.id) ?? 0)),
	}));
}

// ---------------------------------------------------------------------------
// Admin quantity change (issue 068)
// ---------------------------------------------------------------------------

/**
 * Change the quantities of a Reservation's booked Extras (issue 068): one
 * transaction, the Event Extra rows locked, the stock re-checked against
 * every other Reservation still holding seats. Only the Balance is
 * re-priced: the Deposit already paid never changes, and the Balance is
 * the new total minus it (floored at 0, which then shrinks the Deposit —
 * the constraint wants Deposit + Balance = Total). The settled mark is
 * cleared when the Balance grows, as a party-size change does.
 */
export async function changeReservationExtras(input: {
	reservationId: string;
	/** New quantity of each booked Extra (0 removes it); booked Extras not
	 * listed keep their quantity. */
	quantities: { extraId: string; quantity: number }[];
	actorId: string;
	now?: Date;
}): Promise<
	| { ok: true; total: number; balance: number; currency: string }
	| { ok: false; error: string }
> {
	const { reservationId, quantities, actorId } = input;
	const now = input.now ?? new Date();

	return db.transaction(async (tx: typeof db) => {
		const [party] = await tx
			.select({
				id: reservations.id,
				status: reservations.status,
				totalAmount: reservations.totalAmount,
				depositAmount: reservations.depositAmount,
				balanceAmount: reservations.balanceAmount,
				balanceSettledAt: reservations.balanceSettledAt,
				currency: reservations.currency,
			})
			.from(reservations)
			.where(eq(reservations.id, reservationId))
			.for('update');
		if (!party) return { ok: false as const, error: 'Réservation introuvable.' };
		if (party.status === 'cancelled' || party.status === 'expired') {
			return { ok: false as const, error: 'Cette réservation est annulée ou expirée.' };
		}

		const snapshots = await tx
			.select()
			.from(reservationExtras)
			.where(eq(reservationExtras.reservationId, reservationId));
		const byExtra = new Map(snapshots.map((row: typeof snapshots[number]) => [row.eventExtraId, row]));
		const asked = new Map<string, number>();
		for (const change of quantities) {
			if (!Number.isInteger(change.quantity) || change.quantity < 0 || change.quantity > MAX_EXTRA_QUANTITY) {
				return { ok: false as const, error: 'Quantité de supplément invalide.' };
			}
			if (byExtra.has(change.extraId)) asked.set(change.extraId, change.quantity);
		}
		if (asked.size === 0) return { ok: true as const, total: party.totalAmount, balance: party.balanceAmount, currency: party.currency };

		// Stock: what every other seat-holding Reservation has booked.
		const changedIds = [...asked.keys()];
		const extraRows = (await tx
			.select({ id: eventExtras.id, nameFr: eventExtras.nameFr, stock: eventExtras.stock })
			.from(eventExtras)
			.where(inArray(eventExtras.id, changedIds))
			.for('update')) as unknown as { id: string; nameFr: string; stock: number | null }[];
		const extraById = new Map(extraRows.map((row) => [row.id, row]));
		const others: { eventExtraId: string; booked: number }[] = await tx
			.select({
				eventExtraId: reservationExtras.eventExtraId,
				booked: sql<number>`coalesce(sum(${reservationExtras.quantity}), 0)::int`,
			})
			.from(reservationExtras)
			.innerJoin(reservations, eq(reservationExtras.reservationId, reservations.id))
			.where(and(
				inArray(reservationExtras.eventExtraId, changedIds),
				inArray(reservations.status, [...STOCK_HOLDING_STATUSES]),
				sql`${reservations.id} <> ${reservationId}`
			))
			.groupBy(reservationExtras.eventExtraId);
		const bookedByOthers = new Map(others.map((row: { eventExtraId: string; booked: number }) => [row.eventExtraId, row.booked]));
		for (const [extraId, quantity] of asked) {
			const extra = extraById.get(extraId);
			if (!extra) continue;
			if (extra.stock !== null && quantity + (bookedByOthers.get(extraId) ?? 0) > extra.stock) {
				return { ok: false as const, error: `« ${extra.nameFr} » n'est plus disponible en quantité suffisante.` };
			}
		}

		let oldExtrasTotal = 0;
		let newExtrasTotal = 0;
		for (const snapshot of snapshots) {
			oldExtrasTotal += snapshot.unitPrice * snapshot.quantity;
			const quantity = asked.get(snapshot.eventExtraId) ?? snapshot.quantity;
			newExtrasTotal += snapshot.unitPrice * quantity;
			if (quantity === 0) {
				await tx.delete(reservationExtras).where(eq(reservationExtras.id, snapshot.id));
			} else if (quantity !== snapshot.quantity) {
				await tx
					.update(reservationExtras)
					.set({ quantity })
					.where(eq(reservationExtras.id, snapshot.id));
			}
		}

		// Re-price: only the total and the Balance move; the Deposit paid
		// online is untouched unless the new total falls under it.
		const total = party.totalAmount - oldExtrasTotal + newExtrasTotal;
		const deposit = Math.min(party.depositAmount, total);
		const balance = total - deposit;
		const settled = balance > party.balanceAmount
			? { balanceSettledAt: null, balanceSettledBy: null }
			: {};
		await tx
			.update(reservations)
			.set({ totalAmount: total, depositAmount: deposit, balanceAmount: balance, updatedAt: now, ...settled })
			.where(eq(reservations.id, reservationId));

		const { recordAuditLog } = await import('./audit-log');
		await recordAuditLog({
			adminId: actorId,
			action: 'reservation.change_extras',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: {
				reservationId,
				before: { total: party.totalAmount, balance: party.balanceAmount },
				after: { total, balance },
				quantities: Object.fromEntries(asked),
			},
		});

		return { ok: true as const, total, balance, currency: party.currency };
	});
}
