import type { ServiceKind } from '$lib/utils/seating-times';
import type { DepositRule } from '$lib/utils/pricing';
import type { RefundPolicy } from '$lib/utils/refund-policy';

/**
 * Shapes of the admin « Menus & tarifs » tab (issue 022): the Event's Menus
 * and, for each Service (Day + meal), its Menu and price — as loaded for the
 * edit page, and the payload the tab posts back (parsed by
 * `parsePricingPayload`).
 */

/** A Menu described once on the Event. */
export interface EditorMenu {
	id: string;
	nameEn: string;
	nameFr: string;
	descriptionEn: string | null;
	descriptionFr: string | null;
}

/** A migrated Seating that kept its own price (migration 0021). */
export interface EditorLegacySeatingPrice {
	seatingId: string;
	/** `HH:MM` UTC start of the Seating. */
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
	/** Minor units; null while the price is not set (Seatings unbookable). */
	priceAmount: number | null;
	currency: string;
	seatingCount: number;
	legacySeatings: EditorLegacySeatingPrice[];
}

export interface PricingEditorData {
	menus: EditorMenu[];
	services: EditorServicePricing[];
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
	descriptionEn: string | null;
	descriptionFr: string | null;
}

export interface ServicePricingPayload {
	serviceId: string;
	/** `key` of a Menu in the same payload, or null for no Menu. */
	menuKey: string | null;
	/** Minor units, zero allowed; null leaves the price unset. */
	priceAmount: number | null;
	currency: string;
	/** Drop the legacy per-Seating prices so every Seating of the Service
	 * is booked at the Service's price. */
	clearLegacyPrices: boolean;
}

export interface PricingPayload {
	menus: MenuPayload[];
	services: ServicePricingPayload[];
	/** The Event's Deposit rule (issue 023); left unchanged when absent. */
	deposit?: DepositRule;
	/** The Event's Refund Policy (issue 027); left unchanged when absent. */
	refundPolicy?: RefundPolicy;
}
