import type { ServiceKind } from '$lib/utils/seating-times';
import type { DepositRule } from '$lib/utils/pricing';
import type { RefundPolicy } from '$lib/utils/refund-policy';

/**
 * Shapes of the admin « Menus & tarifs » tab (issue 022): the Event's Menus
 * and, for each Service (Day + meal), its Menu and price — as loaded for the
 * edit page, and the payload the tab posts back (parsed by
 * `parsePricingPayload`).
 */

/** A dish served at a Course: its name and an optional description,
 * each in French and English. Several dishes in one Course are served
 * together unless one is an `alternative`: the page then reads « ou »
 * before it, with an optional short note (« options sans gluten »). */
export interface MenuDish {
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
	/** True when served instead of the previous dish, never the first of
	 * a Course. */
	alternative: boolean;
	noteEn: string | null;
	noteFr: string | null;
}

/** One step of a Menu (« Entrée », « Plat »…): its label and what is
 * served — one dish, or several for the guest to choose from at the
 * table. The label may be left blank. */
export interface MenuCourse {
	labelEn: string;
	labelFr: string;
	dishes: MenuDish[];
}

export const MAX_MENU_COURSES = 20;
export const MAX_COURSE_LABEL = 60;
export const MAX_COURSE_DISHES = 6;
/** A dish's name (a line of the printed card). */
export const MAX_COURSE_DISH = 500;
export const MAX_COURSE_DISH_DESCRIPTION = 500;
/** An alternative's short note (« options sans gluten »). */
export const MAX_COURSE_DISH_NOTE = 120;

/** A Menu described once on the Event: its Courses in order, then an
 * optional note (the `description`: wine pairing, allergens…). */
export interface EditorMenu {
	id: string;
	nameEn: string;
	nameFr: string;
	courses: MenuCourse[];
	descriptionEn: string | null;
	descriptionFr: string | null;
}

/** A drink of the Event's Drinks card (issue 086): its name, an optional
 * description (each in French and English) and an optional price in minor
 * units of the Event's currency — informational only, paid on site. */
export interface DrinkItem {
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
	priceAmount: number | null;
}

/** One section of the Drinks card (« Au verre », « Bouteilles »…): its
 * label (FR/EN) and its drinks in order. */
export interface DrinkSection {
	labelEn: string;
	labelFr: string;
	drinks: DrinkItem[];
}

export const MAX_DRINK_SECTIONS = 10;
export const MAX_DRINK_SECTION_LABEL = 60;
export const MAX_DRINKS_PER_SECTION = 30;
/** A drink's name (a line of the card). */
export const MAX_DRINK_NAME = 200;
export const MAX_DRINK_DESCRIPTION = 500;
/** The card's note (paid on site, allergens…). */
export const MAX_DRINK_CARD_NOTE = 1000;

/** One of the Event's Drinks cards (issues 086, 087), like a Menu:
 * its name, then its sections in order (« Au verre », « Bouteilles »…) —
 * each with its label (FR/EN) and its drinks in order — and an optional
 * note. Offered on the Services that pick it. */
export interface EditorDrinkCard {
	id: string;
	nameEn: string;
	nameFr: string;
	sections: DrinkSection[];
	noteEn: string | null;
	noteFr: string | null;
}

/** A Drinks card as posted (like a Menu): `id` null creates it. `key` is
 * how Services refer to it in the same payload. A card left empty (no
 * drink) or left out of the payload is deleted; the Services that offered
 * it then offer none. */
export interface DrinkCardPayload {
	key: string;
	id: string | null;
	nameEn: string;
	nameFr: string;
	sections: DrinkSection[];
	noteEn: string | null;
	noteFr: string | null;
}

/** A migrated Seating that kept its own price (migration 0021). */
export interface EditorLegacySeatingPrice {
	seatingId: string;
	/** `HH:MM` start of the Seating, in the Event's Time Zone. */
	start: string;
	priceAmount: number;
	currency: string;
}

/** A Service with its Menu and price. */
export interface EditorServicePricing {
	serviceId: string;
	date: string;
	kind: ServiceKind;
	menuId: string | null;
	/** The Drinks card (issue 087) the meal offers, like its Menu. */
	drinkCardId: string | null;
	/** Minor units, in the Event's currency; null while the price is not
	 * set (Seatings unbookable). */
	priceAmount: number | null;
	seatingCount: number;
	legacySeatings: EditorLegacySeatingPrice[];
}

/** An Event extra (issue 067) as loaded for the edit page, in display
 * order. */
export interface EditorEventExtra {
	id: string;
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
	/** Minor units, in the Event's currency. */
	priceAmount: number;
	unit: 'per_person' | 'per_unit';
	/** Total stock across the Event; null for an unlimited extra. */
	stock: number | null;
	position: number;
	active: boolean;
	/** True once a Reservation has chosen it: it can no longer be
	 * deleted, only deactivated. */
	booked: boolean;
}

export interface PricingEditorData {
	menus: EditorMenu[];
	/** The Event's Drinks cards (issues 086, 087), oldest first. */
	drinkCards?: EditorDrinkCard[];
	services: EditorServicePricing[];
	/** The Event's extras (issue 067), in display order. */
	extras?: EditorEventExtra[];
	/** The Event's currency (issue 042): every price of the tab is in it. */
	currency: string;
	/** True once the Event has a Reservation: the currency can no longer
	 * change. */
	currencyLocked: boolean;
	/** The Event's Deposit rule (issue 023). */
	deposit: DepositRule;
	/** The Event's Refund Policy (issue 027). */
	refundPolicy: RefundPolicy;
}

/** A Menu as posted: `id` null creates it. `key` is how Services refer to
 * it in the same payload (the id for an existing Menu, any unique string
 * for a new one). Menus of the Event left out of the payload are deleted. */
export interface MenuPayload {
	key: string;
	id: string | null;
	nameEn: string;
	nameFr: string;
	courses: MenuCourse[];
	descriptionEn: string | null;
	descriptionFr: string | null;
}

export interface ServicePricingPayload {
	serviceId: string;
	/** `key` of a Menu in the same payload, or null for no Menu. */
	menuKey: string | null;
	/** `key` of a Drinks card in the same payload, or null for none. */
	drinkCardKey: string | null;
	/** Minor units, zero allowed; null leaves the price unset. */
	priceAmount: number | null;
	/** Drop the legacy per-Seating prices so every Seating of the Service
	 * is booked at the Service's price. */
	clearLegacyPrices: boolean;
}

/** An Event extra as posted: `id` null creates it; `key` is how the save
 * answer names it back. Extras of the Event left out of the payload are
 * deleted — unless already booked, which the save refuses. */
export interface EventExtraPayload {
	key: string;
	id: string | null;
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
	/** Minor units, zero allowed. */
	priceAmount: number;
	unit: 'per_person' | 'per_unit';
	stock: number | null;
	active: boolean;
}

export interface ExtrasPayload {
	extras: EventExtraPayload[];
}

export interface PricingPayload {
	menus: MenuPayload[];
	services: ServicePricingPayload[];
	/** The Event's currency (issue 042); left unchanged when absent. */
	currency?: string;
	/** The Event's Deposit rule (issue 023); left unchanged when absent. */
	deposit?: DepositRule;
	/** The Event's Refund Policy (issue 027); left unchanged when absent. */
	refundPolicy?: RefundPolicy;
	/** The Event's Drinks cards (issues 086, 087); left unchanged when
	 * absent (the new-event form). */
	drinkCards?: DrinkCardPayload[];
}
