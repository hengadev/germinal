import { db } from '../db';
import { coupons, eventDays, eventDrinkCards, eventMenus, eventServices, eventSessions, events, reservations } from '../db/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
	DrinkCardPayload,
	DrinkItem,
	DrinkSection,
	EditorDrinkCard,
	EditorMenu,
	EditorServicePricing,
	MenuCourse,
	MenuDish,
	MenuPayload,
	PricingEditorData,
	PricingPayload,
	ServicePricingPayload,
} from '$lib/types/pricing-editor';
import { resolveSeatingPrice, type SeatingPrice } from '$lib/utils/seating-price';
import { DEPOSIT_TYPES, depositRuleOf, isValidDepositRule, type DepositRule } from '$lib/utils/pricing';
import {
	MAX_REFUND_POLICY_TEXT,
	REFUND_POLICY_TYPES,
	refundPolicyOf,
	validateTiers,
	type RefundPolicy,
	type RefundTier,
} from '$lib/utils/refund-policy';
import type { ServiceKind } from '$lib/utils/seating-times';
import { clockOf, DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';
import { DEFAULT_EVENT_CURRENCY, EVENT_CURRENCIES, parseEventCurrency } from '$lib/utils/currency';
import { ScheduleSaveRefusedError } from './event-schedule';
import {
	MAX_COURSE_DISH,
	MAX_COURSE_DISH_DESCRIPTION,
	MAX_COURSE_DISH_NOTE,
	MAX_COURSE_DISHES,
	MAX_COURSE_LABEL,
	MAX_MENU_COURSES,
	MAX_DRINKS_PER_SECTION,
	MAX_DRINK_CARD_NOTE,
	MAX_DRINK_DESCRIPTION,
	MAX_DRINK_NAME,
	MAX_DRINK_SECTIONS,
	MAX_DRINK_SECTION_LABEL,
} from '$lib/types/pricing-editor';

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
 * Columns to select (joined on the Seating's Service and Event) to resolve
 * a Seating's price with {@link resolveSeatingPrice}. The price is in the
 * Event's currency (issue 042).
 */
export const seatingPriceColumns = {
	servicePriceAmount: eventServices.priceAmount,
	eventCurrency: events.currency,
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
		.innerJoin(events, eq(eventSessions.eventId, events.id))
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
		.innerJoin(events, eq(eventSessions.eventId, events.id))
		.where(inArray(eventSessions.id, seatingIds));
	return new Map(rows.map((row) => [row.id, resolveSeatingPrice(row)]));
}

/** A Service's Menu and Drinks card (if any) and price as the public
 * pages show them. */
export interface PublicServiceOffer {
	serviceId: string;
	menu: {
		nameEn: string;
		nameFr: string;
		courses: MenuCourse[];
		descriptionEn: string | null;
		descriptionFr: string | null;
	} | null;
	/** The meal's Drinks card (issue 087), like its Menu; null for none. */
	drinks: {
		nameEn: string;
		nameFr: string;
		sections: DrinkSection[];
		noteEn: string | null;
		noteFr: string | null;
	} | null;
	/** Minor units; null while the price is not set. */
	priceAmount: number | null;
	/** The Event's currency (issue 042). */
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
		menuCourses: MenuCourse[] | null;
		menuDescriptionEn: string | null;
		menuDescriptionFr: string | null;
		drinkNameEn: string | null;
		drinkNameFr: string | null;
		drinkSections: DrinkSection[] | null;
		drinkNoteEn: string | null;
		drinkNoteFr: string | null;
	}[] = await db
		.select({
			serviceId: eventServices.id,
			priceAmount: eventServices.priceAmount,
			currency: events.currency,
			menuNameEn: eventMenus.nameEn,
			menuNameFr: eventMenus.nameFr,
			menuCourses: eventMenus.courses,
			menuDescriptionEn: eventMenus.descriptionEn,
			menuDescriptionFr: eventMenus.descriptionFr,
			drinkNameEn: eventDrinkCards.nameEn,
			drinkNameFr: eventDrinkCards.nameFr,
			drinkSections: eventDrinkCards.sections,
			drinkNoteEn: eventDrinkCards.noteEn,
			drinkNoteFr: eventDrinkCards.noteFr,
		})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.innerJoin(events, eq(eventDays.eventId, events.id))
		.leftJoin(eventMenus, eq(eventServices.menuId, eventMenus.id))
		.leftJoin(eventDrinkCards, eq(eventServices.drinkCardId, eventDrinkCards.id))
		.where(eq(eventDays.eventId, eventId));

	return new Map(rows.map((row) => [row.serviceId, {
		serviceId: row.serviceId,
		menu: row.menuNameEn !== null && row.menuNameFr !== null
			? {
				nameEn: row.menuNameEn,
				nameFr: row.menuNameFr,
				courses: row.menuCourses ?? [],
				descriptionEn: row.menuDescriptionEn,
				descriptionFr: row.menuDescriptionFr,
			}
			: null,
		drinks: row.drinkNameEn !== null && row.drinkNameFr !== null
			? {
				nameEn: row.drinkNameEn,
				nameFr: row.drinkNameFr,
				sections: row.drinkSections ?? [],
				noteEn: row.drinkNoteEn,
				noteFr: row.drinkNoteFr,
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
	| 'drink-card'
	| 'drink-card-name'
	| 'service'
	| 'price'
	| 'currency'
	| 'deposit'
	| 'refund-policy';

export type PricingParseResult =
	| { ok: true; payload: PricingPayload }
	| { ok: false; reason: PricingParseFailure };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** A Course's dishes as posted, in order; a dish with no French name
 * is dropped (a dish added but not written yet), and the first is never
 * an alternative. False when malformed, too many or too long. */
function parseDishes(value: unknown): MenuDish[] | false {
	if (!Array.isArray(value)) return false;
	const dishes: MenuDish[] = [];
	for (const [index, entry] of value.entries()) {
		if (typeof entry !== 'object' || entry === null) return false;
		const dish = entry as Record<string, unknown>;
		const nameEn = optionalText(dish.nameEn, MAX_COURSE_DISH);
		const nameFr = optionalText(dish.nameFr, MAX_COURSE_DISH);
		const descriptionEn = optionalText(dish.descriptionEn, MAX_COURSE_DISH_DESCRIPTION);
		const descriptionFr = optionalText(dish.descriptionFr, MAX_COURSE_DISH_DESCRIPTION);
		const noteEn = optionalText(dish.noteEn, MAX_COURSE_DISH_NOTE);
		const noteFr = optionalText(dish.noteFr, MAX_COURSE_DISH_NOTE);
		if (
			nameEn === false || nameFr === false || descriptionEn === false || descriptionFr === false ||
			noteEn === false || noteFr === false
		) {
			return false;
		}
		if (nameFr !== null) {
			const alternative = dish.alternative === true && index > 0;
			dishes.push({
				nameEn: nameEn ?? '',
				nameFr,
				descriptionEn,
				descriptionFr,
				alternative,
				noteEn: alternative ? noteEn : null,
				noteFr: alternative ? noteFr : null,
			});
		}
	}
	return dishes.length > MAX_COURSE_DISHES ? false : dishes;
}

/** A Menu's Courses as posted, in order; a Course with no dish is
 * dropped (a step started but not written yet). False when malformed, too
 * many or too long. */
function parseCourses(value: unknown): MenuCourse[] | false {
	if (value === undefined) return [];
	if (!Array.isArray(value)) return false;
	const courses: MenuCourse[] = [];
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) return false;
		const course = entry as Record<string, unknown>;
		const labelEn = optionalText(course.labelEn, MAX_COURSE_LABEL);
		const labelFr = optionalText(course.labelFr, MAX_COURSE_LABEL);
		const dishes = parseDishes(course.dishes);
		if (labelEn === false || labelFr === false || dishes === false) return false;
		if (dishes.length === 0) continue;
		courses.push({ labelEn: labelEn ?? '', labelFr: labelFr ?? '', dishes });
	}
	return courses.length > MAX_MENU_COURSES ? false : courses;
}

/** The Drinks card as posted (issue 086): its sections in order, each
 * with its drinks in order. A drink without a French name is dropped (a
 * line started but not written yet), and a section without a drink too —
 * the note alone does not keep a card. False when malformed, too many or
 * too long. */
function parseDrinkSections(value: unknown): DrinkSection[] | false {
	if (!Array.isArray(value)) return false;
	const sections: DrinkSection[] = [];
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) return false;
		const section = entry as Record<string, unknown>;
		const labelEn = optionalText(section.labelEn, MAX_DRINK_SECTION_LABEL);
		const labelFr = optionalText(section.labelFr, MAX_DRINK_SECTION_LABEL);
		if (labelEn === false || labelFr === false || !Array.isArray(section.drinks)) return false;
		const drinks: DrinkItem[] = [];
		for (const raw of section.drinks) {
			if (typeof raw !== 'object' || raw === null) return false;
			const drink = raw as Record<string, unknown>;
			const nameEn = optionalText(drink.nameEn, MAX_DRINK_NAME);
			const nameFr = optionalText(drink.nameFr, MAX_DRINK_NAME);
			const descriptionEn = optionalText(drink.descriptionEn, MAX_DRINK_DESCRIPTION);
			const descriptionFr = optionalText(drink.descriptionFr, MAX_DRINK_DESCRIPTION);
			if (nameEn === false || nameFr === false || descriptionEn === false || descriptionFr === false) return false;
			if (
				drink.priceAmount !== null &&
				drink.priceAmount !== undefined &&
				(!Number.isInteger(drink.priceAmount) ||
					(drink.priceAmount as number) < 0 ||
					(drink.priceAmount as number) > MAX_PRICE_AMOUNT)
			) {
				return false;
			}
			if (nameFr !== null) {
				drinks.push({
					nameEn: nameEn ?? '',
					nameFr,
					descriptionEn,
					descriptionFr,
					priceAmount: (drink.priceAmount as number | null | undefined) ?? null,
				});
			}
		}
		if (drinks.length > MAX_DRINKS_PER_SECTION) return false;
		if (drinks.length === 0) continue;
		sections.push({ labelEn: labelEn ?? '', labelFr: labelFr ?? '', drinks });
	}
	return sections.length > MAX_DRINK_SECTIONS ? false : sections;
}

/**
 * Parse the payload posted by the « Menus & tarifs » tab: the Event's Menus
 * and Drinks cards (FR name required, EN name, content and note optional;
 * issue 087 makes the cards a list like the Menus) and each Service's
 * Menu, Drinks card and price (whole minor units, zero allowed, or null
 * for “not set yet”), and the Event's currency (issue 042; absent, it is
 * left as is).
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
	const { menus, drinkCards, services, currency, deposit, refundPolicy } = parsed as Record<string, unknown>;
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
		// The English name may be left blank: it is generated from the
		// French (pricing-translation.ts) before the Menu is saved.
		const nameEn = optionalText(menu.nameEn, 255);
		const nameFr = requiredText(menu.nameFr, 255);
		if (nameEn === false || nameFr === false) {
			return { ok: false, reason: 'menu-name' };
		}
		const descriptionEn = optionalText(menu.descriptionEn, 10000);
		const descriptionFr = optionalText(menu.descriptionFr, 10000);
		const courses = parseCourses(menu.courses);
		if (descriptionEn === false || descriptionFr === false || courses === false) {
			return { ok: false, reason: 'menu' };
		}
		menuKeys.add(menu.key);
		if (menu.id !== null) menuIds.add(menu.id as string);
		parsedMenus.push({
			key: menu.key,
			id: menu.id as string | null,
			nameEn: nameEn ?? '',
			nameFr,
			courses,
			descriptionEn,
			descriptionFr,
		});
	}

	// The Event's Drinks cards (issue 087), parsed like its Menus.
	const drinkCardKeys = new Set<string>();
	const drinkCardIds = new Set<string>();
	const parsedDrinkCards: DrinkCardPayload[] = [];
	if (drinkCards !== undefined && !Array.isArray(drinkCards)) {
		return { ok: false, reason: 'drink-card' };
	}
	for (const entry of drinkCards ?? []) {
		if (typeof entry !== 'object' || entry === null) {
			return { ok: false, reason: 'drink-card' };
		}
		const card = entry as Record<string, unknown>;
		if (typeof card.key !== 'string' || card.key === '' || drinkCardKeys.has(card.key)) {
			return { ok: false, reason: 'drink-card' };
		}
		if (card.id !== null && (typeof card.id !== 'string' || !UUID_PATTERN.test(card.id) || drinkCardIds.has(card.id))) {
			return { ok: false, reason: 'drink-card' };
		}
		// The English name may be left blank: it is generated from the
		// French (pricing-translation.ts) before the card is saved.
		const cardNameEn = optionalText(card.nameEn, 255);
		const cardNameFr = requiredText(card.nameFr, 255);
		if (cardNameEn === false || cardNameFr === false) {
			return { ok: false, reason: 'drink-card-name' };
		}
		const sections = parseDrinkSections(card.sections);
		const noteEn = optionalText(card.noteEn, MAX_DRINK_CARD_NOTE);
		const noteFr = optionalText(card.noteFr, MAX_DRINK_CARD_NOTE);
		if (sections === false || noteEn === false || noteFr === false) {
			return { ok: false, reason: 'drink-card' };
		}
		drinkCardKeys.add(card.key);
		if (card.id !== null) drinkCardIds.add(card.id as string);
		parsedDrinkCards.push({
			key: card.key,
			id: card.id as string | null,
			nameEn: cardNameEn ?? '',
			nameFr: cardNameFr,
			sections,
			noteEn,
			noteFr,
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
		if (service.drinkCardKey !== null && service.drinkCardKey !== undefined &&
			(typeof service.drinkCardKey !== 'string' || !drinkCardKeys.has(service.drinkCardKey))) {
			return { ok: false, reason: 'drink-card' };
		}
		if (
			service.priceAmount !== null &&
			(!Number.isInteger(service.priceAmount) ||
				(service.priceAmount as number) < 0 ||
				(service.priceAmount as number) > MAX_PRICE_AMOUNT)
		) {
			return { ok: false, reason: 'price' };
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
			drinkCardKey: (service.drinkCardKey as string | null | undefined) ?? null,
			priceAmount: service.priceAmount as number | null,
			clearLegacyPrices: service.clearLegacyPrices,
		});
	}

	// The Event's currency (issue 042) is optional: absent, left as is.
	let parsedCurrency: string | undefined;
	if (currency !== undefined) {
		const code = parseEventCurrency(currency);
		if (!code) {
			return { ok: false, reason: 'currency' };
		}
		parsedCurrency = code;
	}

	// The Deposit rule (issue 023) is optional: absent, it is left as is.
	let parsedDeposit: DepositRule | undefined;
	if (deposit !== undefined) {
		if (typeof deposit !== 'object' || deposit === null) {
			return { ok: false, reason: 'deposit' };
		}
		const { type, value } = deposit as Record<string, unknown>;
		if (typeof type !== 'string' || !(DEPOSIT_TYPES as readonly string[]).includes(type) || typeof value !== 'number') {
			return { ok: false, reason: 'deposit' };
		}
		parsedDeposit = { type: type as DepositRule['type'], value };
		if (!isValidDepositRule(parsedDeposit)) {
			return { ok: false, reason: 'deposit' };
		}
	}

	// The Refund Policy (issue 027) is optional too: absent, left as is.
	let parsedRefundPolicy: RefundPolicy | undefined;
	if (refundPolicy !== undefined) {
		const policy = parseRefundPolicy(refundPolicy);
		if (!policy) {
			return { ok: false, reason: 'refund-policy' };
		}
		parsedRefundPolicy = policy;
	}

	return {
		ok: true,
		payload: {
			menus: parsedMenus,
			...(drinkCards !== undefined ? { drinkCards: parsedDrinkCards } : {}),
			services: parsedServices,
			...(parsedCurrency ? { currency: parsedCurrency } : {}),
			...(parsedDeposit ? { deposit: parsedDeposit } : {}),
			...(parsedRefundPolicy ? { refundPolicy: parsedRefundPolicy } : {}),
		},
	};
}

/**
 * A posted Refund Policy: its type, EN/FR statements (trimmed, empty →
 * null) and tiers (sorted largest window first). A rule-based policy needs
 * valid tiers; a manual one may keep earlier valid tiers or none. Null when
 * invalid.
 */
function parseRefundPolicy(raw: unknown): RefundPolicy | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const { type, textEn, textFr, tiers } = raw as Record<string, unknown>;
	if (typeof type !== 'string' || !(REFUND_POLICY_TYPES as readonly string[]).includes(type)) return null;
	const en = optionalText(textEn, MAX_REFUND_POLICY_TEXT);
	const fr = optionalText(textFr, MAX_REFUND_POLICY_TEXT);
	if (en === false || fr === false) return null;
	let parsedTiers: RefundTier[];
	if (Array.isArray(tiers) && tiers.length === 0 && type === 'manual') {
		parsedTiers = [];
	} else {
		const valid = validateTiers(tiers);
		if (!valid) return null;
		parsedTiers = valid;
	}
	return { type: type as RefundPolicy['type'], textEn: en, textFr: fr, tiers: parsedTiers };
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
			return 'Chaque menu doit avoir un nom en français ; un nom compte 255 caractères au plus.';
		case 'drink-card':
			return 'Une des cartes des boissons soumise est invalide : au plus 10 sections de 30 boissons, des textes courts et des prix positifs ou nuls au centime près.';
		case 'drink-card-name':
			return 'Chaque carte des boissons doit avoir un nom en français ; un nom compte 255 caractères au plus.';
		case 'service':
			return 'Un des repas soumis est invalide.';
		case 'price':
			return 'Les prix doivent être des montants positifs ou nuls (0 pour un repas gratuit), au centime près.';
		case 'currency':
			return `La devise doit être l’une des suivantes : ${EVENT_CURRENCIES.join(', ')}.`;
		case 'deposit':
			return 'L’acompte est invalide : un pourcentage entier entre 1 et 100, ou un montant fixe par convive supérieur à zéro, au centime près.';
		case 'refund-policy':
			return 'La politique de remboursement est invalide : de 1 à 10 paliers, chacun avec un délai différent (en heures entières, un an au plus) et un pourcentage entier de 0 à 100 qui diminue à l’approche de la séance ; textes de 2000 caractères au plus.';
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

/** Refused: the Event has Reservations, recorded in its current currency. */
export class CurrencyChangeRefusedError extends ScheduleSaveRefusedError {
	constructor() {
		super(
			'Impossible de changer la devise : l’événement a déjà des réservations, enregistrées dans sa devise actuelle.'
		);
		this.name = 'CurrencyChangeRefusedError';
	}
}

/**
 * Whether any Seating of the Event has a Reservation, whatever its status —
 * what locks the Event's currency (issue 042).
 */
export async function eventHasReservations(tx: typeof db, eventId: string): Promise<boolean> {
	const [booked] = await tx
		.select({ id: reservations.id })
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.where(eq(eventSessions.eventId, eventId))
		.limit(1);
	return booked !== undefined;
}

/** What a pricing save made. */
export interface SavedPricing {
	/** Each posted Menu's id by its key, created ones included: the editor
	 * keeps its drafts and takes their ids. */
	menuIds: Record<string, string>;
	/** Each posted Drinks card's id by its key, created ones included
	 * (issue 087). */
	drinkCardIds: Record<string, string>;
}

/**
 * Save the « Menus & tarifs » tab in one transaction: new Menus are
 * created, listed ones updated, Menus left out deleted; each listed Service
 * gets its Menu and price (and optionally loses its legacy per-Seating
 * prices), and the Event takes the currency, the Deposit rule and the
 * Refund Policy when they are posted.
 * Services outside the payload are untouched. Refuses — with a
 * French message and nothing written — a Menu, Drinks card or Service of
 * another Event, deleting a Menu still offered on a Service, and changing
 * the currency once the Event has a Reservation. A Drinks card left out
 * of the payload or emptied is deleted; the Services that offered it then
 * offer none.
 */
export async function savePricing(eventId: string, payload: PricingPayload): Promise<SavedPricing> {
	return db.transaction(async (tx: typeof db): Promise<SavedPricing> => {
		const [event] = await tx.select({ id: events.id, currency: events.currency })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.for('update');
		if (!event) {
			throw new Error('Event not found');
		}

		// The currency is locked once the Event has a Reservation (issue
		// 042): Reservations and payments keep the one they recorded.
		if (payload.currency && payload.currency !== event.currency) {
			if (await eventHasReservations(tx, eventId)) {
				throw new CurrencyChangeRefusedError();
			}
			await tx.update(events)
				.set({ currency: payload.currency, updatedAt: new Date() })
				.where(eq(events.id, eventId));
			// Fixed-amount Coupons are in the Event's currency and follow it;
			// none has been redeemed yet, as nothing has been booked.
			await tx.update(coupons)
				.set({ currency: payload.currency, updatedAt: new Date() })
				.where(and(eq(coupons.eventId, eventId), eq(coupons.discountType, 'amount')));
		}

		if (payload.deposit) {
			await tx.update(events)
				.set({ depositType: payload.deposit.type, depositValue: payload.deposit.value, updatedAt: new Date() })
				.where(eq(events.id, eventId));
		}

		if (payload.refundPolicy) {
			await tx.update(events)
				.set({
					refundPolicyType: payload.refundPolicy.type,
					refundPolicyTextEn: payload.refundPolicy.textEn,
					refundPolicyTextFr: payload.refundPolicy.textFr,
					refundPolicyTiers: payload.refundPolicy.tiers,
					updatedAt: new Date(),
				})
				.where(eq(events.id, eventId));
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
		const existingDrinkCards: { id: string }[] = await tx
			.select({ id: eventDrinkCards.id })
			.from(eventDrinkCards)
			.where(eq(eventDrinkCards.eventId, eventId));
		const existingDrinkCardIds = new Set(existingDrinkCards.map((card) => card.id));
		// An emptied card (no drink left) is dropped from the payload's list,
		// so the removal pass below deletes its row (issue 086).
		const keptDrinkCards = (payload.drinkCards ?? []).filter((card) => card.sections.length > 0);
		for (const card of keptDrinkCards) {
			if (card.id !== null && !existingDrinkCardIds.has(card.id)) {
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
				courses: menu.courses,
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

		// Drinks cards (issue 087): update the listed ones, create the new
		// ones — like the Menus above.
		const drinkCardIdByKey = new Map<string, string>();
		for (const card of keptDrinkCards) {
			const fields = {
				nameEn: card.nameEn,
				nameFr: card.nameFr,
				sections: card.sections,
				noteEn: card.noteEn,
				noteFr: card.noteFr,
			};
			if (card.id === null) {
				const [created]: { id: string }[] = await tx.insert(eventDrinkCards)
					.values({ eventId, ...fields })
					.returning({ id: eventDrinkCards.id });
				drinkCardIdByKey.set(card.key, created.id);
			} else {
				await tx.update(eventDrinkCards)
					.set({ ...fields, updatedAt: new Date() })
					.where(eq(eventDrinkCards.id, card.id));
				drinkCardIdByKey.set(card.key, card.id);
			}
		}

		// Services: Menu, Drinks card and price, then the legacy prices they drop.
		for (const service of payload.services) {
			await tx.update(eventServices)
				.set({
					menuId: service.menuKey === null ? null : menuIdByKey.get(service.menuKey)!,
					drinkCardId: service.drinkCardKey === null
						? null
						// A card emptied in the same save is gone: the meal offers none.
						: drinkCardIdByKey.get(service.drinkCardKey) ?? null,
					priceAmount: service.priceAmount,
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

		// Drinks cards left out of the payload (or emptied) are deleted — the
		// Services that still offered one are simply unlinked (the foreign
		// key sets them to none), unlike the Menus. Absent from the payload
		// (the new-event form), the cards are left as stored.
		if (payload.drinkCards !== undefined) {
			const listedCardIds = new Set(keptDrinkCards.flatMap((card) => (card.id === null ? [] : [card.id])));
			const removedCards = existingDrinkCards.filter((card) => !listedCardIds.has(card.id));
			if (removedCards.length > 0) {
				await tx.delete(eventDrinkCards)
					.where(inArray(eventDrinkCards.id, removedCards.map((card) => card.id)));
			}
		}
		return {
			menuIds: Object.fromEntries(menuIdByKey),
			drinkCardIds: Object.fromEntries(drinkCardIdByKey),
		};
	});
}

const KIND_ORDER: Record<ServiceKind, number> = { lunch: 0, dinner: 1 };

/**
 * The « Menus & tarifs » tab as loaded for the edit page: the Event's Menus
 * (oldest first) and its Services ordered by Day then meal, each with its
 * Menu, price, Seating count and the Seatings that kept a legacy price; the
 * Event's currency and whether it is locked by a Reservation.
 */
export async function loadPricingEditor(eventId: string): Promise<PricingEditorData> {
	const [event]: {
		depositType: DepositRule['type'];
		depositValue: number;
		refundPolicyType: RefundPolicy['type'];
		refundPolicyTextEn: string | null;
		refundPolicyTextFr: string | null;
		refundPolicyTiers: unknown;
		timeZone: string;
		currency: string;
	}[] = await db
		.select({
			depositType: events.depositType,
			depositValue: events.depositValue,
			refundPolicyType: events.refundPolicyType,
			refundPolicyTextEn: events.refundPolicyTextEn,
			refundPolicyTextFr: events.refundPolicyTextFr,
			refundPolicyTiers: events.refundPolicyTiers,
			timeZone: events.timeZone,
			currency: events.currency,
		})
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);

	const menus: EditorMenu[] = await db
		.select({
			id: eventMenus.id,
			nameEn: eventMenus.nameEn,
			nameFr: eventMenus.nameFr,
			courses: eventMenus.courses,
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
		drinkCardId: string | null;
		priceAmount: number | null;
	}[] = await db
		.select({
			id: eventServices.id,
			kind: eventServices.kind,
			date: sql<string>`${eventDays.date}::text`,
			menuId: eventServices.menuId,
			drinkCardId: eventServices.drinkCardId,
			priceAmount: eventServices.priceAmount,
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
				drinkCardId: service.drinkCardId,
				priceAmount: service.priceAmount,
				seatingCount: seatings.length,
				legacySeatings: seatings.flatMap((seating) =>
					seating.legacyPriceAmount !== null && seating.legacyCurrency !== null
						? [{
							seatingId: seating.id,
							start: clockOf(seating.startTime, event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE),
							priceAmount: seating.legacyPriceAmount,
							currency: seating.legacyCurrency,
						}]
						: []
				),
			};
		});

	const drinkCards: EditorDrinkCard[] = await db
		.select({
			id: eventDrinkCards.id,
			nameEn: eventDrinkCards.nameEn,
			nameFr: eventDrinkCards.nameFr,
			sections: eventDrinkCards.sections,
			noteEn: eventDrinkCards.noteEn,
			noteFr: eventDrinkCards.noteFr,
		})
		.from(eventDrinkCards)
		.where(eq(eventDrinkCards.eventId, eventId))
		.orderBy(eventDrinkCards.createdAt, eventDrinkCards.id);

	return {
		menus,
		drinkCards,
		services,
		currency: event?.currency ?? DEFAULT_EVENT_CURRENCY,
		currencyLocked: await eventHasReservations(db, eventId),
		deposit: depositRuleOf(event ?? {}),
		refundPolicy: refundPolicyOf(event ?? {}),
	};
}

/**
 * The Event's Drinks cards (issues 086, 087) as loaded for the edit page
 * and the public pages: oldest first, each with its name, sections and
 * note.
 */
export async function loadEventDrinkCards(eventId: string): Promise<EditorDrinkCard[]> {
	return db
		.select({
			id: eventDrinkCards.id,
			nameEn: eventDrinkCards.nameEn,
			nameFr: eventDrinkCards.nameFr,
			sections: eventDrinkCards.sections,
			noteEn: eventDrinkCards.noteEn,
			noteFr: eventDrinkCards.noteFr,
		})
		.from(eventDrinkCards)
		.where(eq(eventDrinkCards.eventId, eventId))
		.orderBy(eventDrinkCards.createdAt, eventDrinkCards.id);
}
