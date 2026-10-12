import { db } from '../db';
import { eventDays, eventMenus, eventServices, eventSessions, events } from '../db/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
	EditorMenu,
	EditorServicePricing,
	MenuPayload,
	PricingEditorData,
	PricingPayload,
	ServicePricingPayload,
} from '$lib/types/pricing-editor';
import { resolveSeatingPrice, type SeatingPrice } from '$lib/utils/seating-price';
import { formatTimeOfDay, type ServiceKind } from '$lib/utils/seating-times';
import { ScheduleSaveRefusedError } from './event-schedule';

/**
 * Menus and Service prices (issue 022).
 *
 * A Menu is described once per Event (EN/FR) and offered on its Services;
 * each Service sets the price its Seatings are booked at, so the same Menu
 * can cost differently at lunch and dinner. This module owns the « Menus &
 * tarifs » admin tab (load, parse, save in one transaction) and the lookup
 * of the price a Seating is booked at — the single place booking, emails
 * and public pages read prices from (the Pricing module of issue 023 takes
 * its unit price from here).
 */

// ---------------------------------------------------------------------------
// The price a Seating is booked at
// ---------------------------------------------------------------------------

/**
 * Columns to select (joined on the Seating's Service) to resolve a
 * Seating's price with {@link resolveSeatingPrice}.
 */
export const seatingPriceColumns = {
	servicePriceAmount: eventServices.priceAmount,
	serviceCurrency: eventServices.currency,
	legacyPriceAmount: eventSessions.legacyPriceAmount,
	legacyCurrency: eventSessions.legacyCurrency,
};

/** The unit price a Seating is booked at, or null when its Service has no
 * price yet (the Seating cannot be booked). */
export async function getSeatingPrice(tx: typeof db, seatingId: string): Promise<SeatingPrice | null> {
	const [row] = await tx
		.select(seatingPriceColumns)
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.where(eq(eventSessions.id, seatingId))
		.limit(1);
	return row ? resolveSeatingPrice(row) : null;
}

/** Unit prices of several Seatings, keyed by Seating id (null: no price). */
export async function getSeatingPrices(seatingIds: string[]): Promise<Map<string, SeatingPrice | null>> {
	if (seatingIds.length === 0) return new Map();
	const rows: ({ id: string } & Parameters<typeof resolveSeatingPrice>[0])[] = await db
		.select({ id: eventSessions.id, ...seatingPriceColumns })
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.where(inArray(eventSessions.id, seatingIds));
	return new Map(rows.map((row) => [row.id, resolveSeatingPrice(row)]));
}

/** A Service's Menu (if any) and price as the public pages show them. */
export interface PublicServiceOffer {
	serviceId: string;
	menu: {
		nameEn: string;
		nameFr: string;
		descriptionEn: string | null;
		descriptionFr: string | null;
	} | null;
	/** Minor units; null while the price is not set. */
	priceAmount: number | null;
	currency: string;
}

/** Menu and price of each of an Event's Services, keyed by Service id. */
export async function getServiceOffersByEventId(eventId: string): Promise<Map<string, PublicServiceOffer>> {
	const rows: {
		serviceId: string;
		priceAmount: number | null;
		currency: string;
		menuNameEn: string | null;
		menuNameFr: string | null;
		menuDescriptionEn: string | null;
		menuDescriptionFr: string | null;
	}[] = await db
		.select({
			serviceId: eventServices.id,
			priceAmount: eventServices.priceAmount,
			currency: eventServices.currency,
			menuNameEn: eventMenus.nameEn,
			menuNameFr: eventMenus.nameFr,
			menuDescriptionEn: eventMenus.descriptionEn,
			menuDescriptionFr: eventMenus.descriptionFr,
		})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.leftJoin(eventMenus, eq(eventServices.menuId, eventMenus.id))
		.where(eq(eventDays.eventId, eventId));

	return new Map(rows.map((row) => [row.serviceId, {
		serviceId: row.serviceId,
		menu: row.menuNameEn !== null && row.menuNameFr !== null
			? {
				nameEn: row.menuNameEn,
				nameFr: row.menuNameFr,
				descriptionEn: row.menuDescriptionEn,
				descriptionFr: row.menuDescriptionFr,
			}
			: null,
		priceAmount: row.priceAmount,
		currency: row.currency,
	}]));
}

// ---------------------------------------------------------------------------
// Parsing the « Menus & tarifs » payload
// ---------------------------------------------------------------------------

export type PricingParseFailure =
	| 'missing'
	| 'malformed'
	| 'menu'
	| 'menu-name'
	| 'service'
	| 'price'
	| 'currency';

export type PricingParseResult =
	| { ok: true; payload: PricingPayload }
	| { ok: false; reason: PricingParseFailure };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Currencies the admin can price a Service in. */
export const SERVICE_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

/** Upper bound on a Service price (minor units): 100 000.00. */
const MAX_PRICE_AMOUNT = 10_000_000;

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

/**
 * Parse the payload posted by the « Menus & tarifs » tab: the Event's Menus
 * (EN/FR name required, descriptions optional) and each Service's Menu and
 * price (whole minor units, zero allowed, or null for “not set yet”).
 * Returns a failure reason the admin form maps to French copy.
 */
export function parsePricingPayload(raw: string | null): PricingParseResult {
	if (raw === null || raw.trim() === '') {
		return { ok: false, reason: 'missing' };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return { ok: false, reason: 'malformed' };
	}
	const { menus, services } = parsed as Record<string, unknown>;
	if (!Array.isArray(menus) || !Array.isArray(services)) {
		return { ok: false, reason: 'malformed' };
	}

	const menuKeys = new Set<string>();
	const menuIds = new Set<string>();
	const parsedMenus: MenuPayload[] = [];
	for (const entry of menus) {
		if (typeof entry !== 'object' || entry === null) {
			return { ok: false, reason: 'malformed' };
		}
		const menu = entry as Record<string, unknown>;
		if (typeof menu.key !== 'string' || menu.key === '' || menuKeys.has(menu.key)) {
			return { ok: false, reason: 'menu' };
		}
		if (menu.id !== null && (typeof menu.id !== 'string' || !UUID_PATTERN.test(menu.id) || menuIds.has(menu.id))) {
			return { ok: false, reason: 'menu' };
		}
		const nameEn = requiredText(menu.nameEn, 255);
		const nameFr = requiredText(menu.nameFr, 255);
		if (nameEn === false || nameFr === false) {
			return { ok: false, reason: 'menu-name' };
		}
		const descriptionEn = optionalText(menu.descriptionEn, 10000);
		const descriptionFr = optionalText(menu.descriptionFr, 10000);
		if (descriptionEn === false || descriptionFr === false) {
			return { ok: false, reason: 'menu' };
		}
		menuKeys.add(menu.key);
		if (menu.id !== null) menuIds.add(menu.id as string);
		parsedMenus.push({
			key: menu.key,
			id: menu.id as string | null,
			nameEn,
			nameFr,
			descriptionEn,
			descriptionFr,
		});
	}

	const serviceIds = new Set<string>();
	const parsedServices: ServicePricingPayload[] = [];
	for (const entry of services) {
		if (typeof entry !== 'object' || entry === null) {
			return { ok: false, reason: 'malformed' };
		}
		const service = entry as Record<string, unknown>;
		if (typeof service.serviceId !== 'string' || !UUID_PATTERN.test(service.serviceId) || serviceIds.has(service.serviceId)) {
			return { ok: false, reason: 'service' };
		}
		if (service.menuKey !== null && (typeof service.menuKey !== 'string' || !menuKeys.has(service.menuKey))) {
			return { ok: false, reason: 'menu' };
		}
		if (
			service.priceAmount !== null &&
			(!Number.isInteger(service.priceAmount) ||
				(service.priceAmount as number) < 0 ||
				(service.priceAmount as number) > MAX_PRICE_AMOUNT)
		) {
			return { ok: false, reason: 'price' };
		}
		if (
			typeof service.currency !== 'string' ||
			!(SERVICE_CURRENCIES as readonly string[]).includes(service.currency.toUpperCase())
		) {
			return { ok: false, reason: 'currency' };
		}
		if (typeof service.clearLegacyPrices !== 'boolean') {
			return { ok: false, reason: 'malformed' };
		}
		// Dropping the legacy per-Seating prices needs a Service price for
		// those Seatings to fall back on.
		if (service.clearLegacyPrices && service.priceAmount === null) {
			return { ok: false, reason: 'price' };
		}
		serviceIds.add(service.serviceId);
		parsedServices.push({
			serviceId: service.serviceId,
			menuKey: service.menuKey as string | null,
			priceAmount: service.priceAmount as number | null,
			currency: service.currency.toUpperCase(),
			clearLegacyPrices: service.clearLegacyPrices,
		});
	}

	return { ok: true, payload: { menus: parsedMenus, services: parsedServices } };
}

/** French admin copy for each way the pricing payload can be invalid. */
export function pricingPayloadErrorMessage(reason: PricingParseFailure): string {
	switch (reason) {
		case 'missing':
			return 'Les menus et tarifs de l’événement sont requis.';
		case 'malformed':
			return 'Les menus et tarifs soumis sont invalides.';
		case 'menu':
			return 'Un des menus soumis est invalide.';
		case 'menu-name':
			return 'Chaque menu doit avoir un nom en anglais et en français (255 caractères au plus).';
		case 'service':
			return 'Un des repas soumis est invalide.';
		case 'price':
			return 'Les prix doivent être des montants positifs ou nuls (0 pour un repas gratuit), au centime près.';
		case 'currency':
			return `La devise doit être l’une des suivantes : ${SERVICE_CURRENCIES.join(', ')}.`;
	}
}

// ---------------------------------------------------------------------------
// Saving the « Menus & tarifs » tab
// ---------------------------------------------------------------------------

/** Refused: the payload names a Menu or Service outside this Event. */
export class UnknownPricingTargetError extends ScheduleSaveRefusedError {
	constructor() {
		super('Impossible d’enregistrer : un des menus ou repas soumis n’appartient pas à cet événement.');
		this.name = 'UnknownPricingTargetError';
	}
}

/** Refused: a removed Menu is still offered on a Service. */
export class MenuInUseError extends ScheduleSaveRefusedError {
	constructor(public readonly menuNames: string[]) {
		super(
			`Impossible de supprimer ${menuNames.length > 1 ? 'les menus' : 'le menu'} « ${menuNames.join(' », « ')} » : ` +
			'retirez-le d’abord des repas qui le proposent.'
		);
		this.name = 'MenuInUseError';
	}
}

/**
 * Save the « Menus & tarifs » tab in one transaction: new Menus are
 * created, listed ones updated, Menus left out deleted; each listed Service
 * gets its Menu and price (and optionally loses its legacy per-Seating
 * prices). Services outside the payload are untouched. Refuses — with a
 * French message and nothing written — a Menu or Service of another Event,
 * and deleting a Menu still offered on a Service.
 */
export async function savePricing(eventId: string, payload: PricingPayload): Promise<void> {
	await db.transaction(async (tx: typeof db) => {
		const [event] = await tx.select({ id: events.id })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.for('update');
		if (!event) {
			throw new Error('Event not found');
		}

		const existingMenus: { id: string; nameFr: string }[] = await tx
			.select({ id: eventMenus.id, nameFr: eventMenus.nameFr })
			.from(eventMenus)
			.where(eq(eventMenus.eventId, eventId));
		const existingMenuIds = new Set(existingMenus.map((menu) => menu.id));

		const serviceRows: { id: string }[] = await tx
			.select({ id: eventServices.id })
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventDays.eventId, eventId));
		const eventServiceIds = new Set(serviceRows.map((row) => row.id));

		for (const menu of payload.menus) {
			if (menu.id !== null && !existingMenuIds.has(menu.id)) {
				throw new UnknownPricingTargetError();
			}
		}
		for (const service of payload.services) {
			if (!eventServiceIds.has(service.serviceId)) {
				throw new UnknownPricingTargetError();
			}
		}

		// Menus: update the listed ones, create the new ones.
		const menuIdByKey = new Map<string, string>();
		for (const menu of payload.menus) {
			const fields = {
				nameEn: menu.nameEn,
				nameFr: menu.nameFr,
				descriptionEn: menu.descriptionEn,
				descriptionFr: menu.descriptionFr,
			};
			if (menu.id === null) {
				const [created]: { id: string }[] = await tx.insert(eventMenus)
					.values({ eventId, ...fields })
					.returning({ id: eventMenus.id });
				menuIdByKey.set(menu.key, created.id);
			} else {
				await tx.update(eventMenus)
					.set({ ...fields, updatedAt: new Date() })
					.where(eq(eventMenus.id, menu.id));
				menuIdByKey.set(menu.key, menu.id);
			}
		}

		// Services: Menu and price, then the legacy prices they drop.
		for (const service of payload.services) {
			await tx.update(eventServices)
				.set({
					menuId: service.menuKey === null ? null : menuIdByKey.get(service.menuKey)!,
					priceAmount: service.priceAmount,
					currency: service.currency,
					updatedAt: new Date(),
				})
				.where(eq(eventServices.id, service.serviceId));
		}
		const clearing = payload.services
			.filter((service) => service.clearLegacyPrices)
			.map((service) => service.serviceId);
		if (clearing.length > 0) {
			await tx.update(eventSessions)
				.set({ legacyPriceAmount: null, legacyCurrency: null, updatedAt: new Date() })
				.where(and(
					inArray(eventSessions.serviceId, clearing),
					isNotNull(eventSessions.legacyPriceAmount)
				));
		}

		// Menus left out of the payload are deleted — unless a Service still
		// offers them (including Services outside the payload).
		const listedIds = new Set(payload.menus.flatMap((menu) => (menu.id === null ? [] : [menu.id])));
		const removed = existingMenus.filter((menu) => !listedIds.has(menu.id));
		if (removed.length > 0) {
			const stillOffered: { menuId: string | null }[] = await tx
				.selectDistinct({ menuId: eventServices.menuId })
				.from(eventServices)
				.where(inArray(eventServices.menuId, removed.map((menu) => menu.id)));
			if (stillOffered.length > 0) {
				const offered = new Set(stillOffered.map((row) => row.menuId));
				throw new MenuInUseError(
					removed.filter((menu) => offered.has(menu.id)).map((menu) => menu.nameFr)
				);
			}
			await tx.delete(eventMenus)
				.where(inArray(eventMenus.id, removed.map((menu) => menu.id)));
		}
	});
}

const KIND_ORDER: Record<ServiceKind, number> = { lunch: 0, dinner: 1 };

/**
 * The « Menus & tarifs » tab as loaded for the edit page: the Event's Menus
 * (oldest first) and its Services ordered by Day then meal, each with its
 * Menu, price, Seating count and the Seatings that kept a legacy price.
 */
export async function loadPricingEditor(eventId: string): Promise<PricingEditorData> {
	const menus: EditorMenu[] = await db
		.select({
			id: eventMenus.id,
			nameEn: eventMenus.nameEn,
			nameFr: eventMenus.nameFr,
			descriptionEn: eventMenus.descriptionEn,
			descriptionFr: eventMenus.descriptionFr,
		})
		.from(eventMenus)
		.where(eq(eventMenus.eventId, eventId))
		.orderBy(eventMenus.createdAt, eventMenus.id);

	const serviceRows: {
		id: string;
		kind: ServiceKind;
		date: string;
		menuId: string | null;
		priceAmount: number | null;
		currency: string;
	}[] = await db
		.select({
			id: eventServices.id,
			kind: eventServices.kind,
			date: sql<string>`${eventDays.date}::text`,
			menuId: eventServices.menuId,
			priceAmount: eventServices.priceAmount,
			currency: eventServices.currency,
		})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(eventDays.eventId, eventId));

	const seatingRows: {
		id: string;
		serviceId: string;
		startTime: Date;
		legacyPriceAmount: number | null;
		legacyCurrency: string | null;
	}[] = await db
		.select({
			id: eventSessions.id,
			serviceId: eventSessions.serviceId,
			startTime: eventSessions.startTime,
			legacyPriceAmount: eventSessions.legacyPriceAmount,
			legacyCurrency: eventSessions.legacyCurrency,
		})
		.from(eventSessions)
		.where(eq(eventSessions.eventId, eventId))
		.orderBy(eventSessions.startTime);

	const services: EditorServicePricing[] = serviceRows
		.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
		.map((service) => {
			const seatings = seatingRows.filter((seating) => seating.serviceId === service.id);
			return {
				serviceId: service.id,
				date: service.date,
				kind: service.kind,
				menuId: service.menuId,
				priceAmount: service.priceAmount,
				currency: service.currency,
				seatingCount: seatings.length,
				legacySeatings: seatings.flatMap((seating) =>
					seating.legacyPriceAmount !== null && seating.legacyCurrency !== null
						? [{
							seatingId: seating.id,
							start: formatTimeOfDay(seating.startTime.getUTCHours() * 60 + seating.startTime.getUTCMinutes()),
							priceAmount: seating.legacyPriceAmount,
							currency: seating.legacyCurrency,
						}]
						: []
				),
			};
		});

	return { menus, services };
}
