import type { ServiceKind } from '$lib/utils/seating-times';
import type { DepositRule } from '$lib/utils/pricing';
import type { RefundPolicy } from '$lib/utils/refund-policy';

/**
 * Shapes of the admin « Menus & tarifs » tab (issue 022): the Event's Menus
 * and, for each Service (Day + meal), its Menu and price — as loaded for the
 * edit page, and the payload the tab posts back (parsed by
 * `parsePricingPayload`).
 */

/** A dish served at a Course. */
export interface MenuDish {
	en: string;
	fr: string;
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
export const MAX_COURSE_DISH = 500;

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
	/** Minor units, in the Event's currency; null while the price is not
	 * set (Seatings unbookable). */
	priceAmount: number | null;
	seatingCount: number;
	legacySeatings: EditorLegacySeatingPrice[];
}

export interface PricingEditorData {
	menus: EditorMenu[];
	services: EditorServicePricing[];
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
	/** Minor units, zero allowed; null leaves the price unset. */
	priceAmount: number | null;
	/** Drop the legacy per-Seating prices so every Seating of the Service
	 * is booked at the Service's price. */
	clearLegacyPrices: boolean;
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
}
