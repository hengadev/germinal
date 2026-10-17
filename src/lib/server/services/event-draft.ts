import type { CreateEventInput } from '$lib/types/events';
import type { PricingPayload } from '$lib/types/pricing-editor';
import { FULL_PAYMENT_DEPOSIT } from '$lib/utils/pricing';
import { DEFAULT_REFUND_POLICY } from '$lib/utils/refund-policy';
import { DEFAULT_EVENT_CURRENCY } from '$lib/utils/currency';

/**
 * Drafts (ADR 0008, issue 036): « Nouvel événement » opens the same tabbed
 * editor as an existing Event, with no Event yet. The first save of any tab
 * creates a Draft with what that tab holds, nothing being required; a save
 * with nothing filled in creates nothing.
 */

/** French admin copy for a first save with nothing filled in. */
export const NOTHING_TO_SAVE_MESSAGE =
	'Rien à enregistrer : remplissez au moins un champ pour créer le brouillon.';

/** The Event's own text fields, as posted by the Essentiel (with the
 * Internal Notes, issue 039), Lieu and Programme tabs (each posts only its
 * own). */
export const EVENT_TEXT_FIELDS = [
	'titleEn',
	'titleFr',
	'subtitleEn',
	'subtitleFr',
	'descriptionEn',
	'descriptionFr',
	'locationEn',
	'locationFr',
	'venueNameEn',
	'venueNameFr',
	'streetAddressEn',
	'streetAddressFr',
	'districtEn',
	'districtFr',
	'cityEn',
	'cityFr',
	'postalCode',
	'countryEn',
	'countryFr',
	'collaborators',
	'timings',
	'curatorEn',
	'curatorFr',
	'admissionInfoEn',
	'admissionInfoFr',
	'internalNotes',
	'practicalInfoEn',
	'practicalInfoFr',
] as const;

export type EventTextField = (typeof EVENT_TEXT_FIELDS)[number];
export type EventTextFields = Partial<Record<EventTextField, string | null>>;

/** Fields posted as a JSON list, where an empty list means nothing. */
const LIST_FIELDS: ReadonlySet<EventTextField> = new Set(['collaborators', 'timings']);

/**
 * The text fields present in a tab's form: a blank one is null (cleared),
 * as is an empty Collaborators or Programme list. Fields the tab does not
 * post are left out, so saving one tab never touches another's fields.
 */
export function readEventTextFields(formData: FormData): EventTextFields {
	const fields: EventTextFields = {};
	for (const name of EVENT_TEXT_FIELDS) {
		if (!formData.has(name)) continue;
		const raw = formData.get(name);
		const value = typeof raw === 'string' ? raw : '';
		const blank = value.trim() === '' || (LIST_FIELDS.has(name) && value.trim() === '[]');
		fields[name] = blank ? null : value;
	}
	return fields;
}

/** The « Infos pratiques » switch « Demander les allergies et régimes
 * alimentaires » (issue 041). The tab posts a hidden `false` before the
 * checkbox's `true`, so the field is present whenever the tab is saved;
 * a tab that does not post it leaves the switch alone (undefined). */
export function readAskDietaryRequirements(formData: FormData): boolean | undefined {
	if (!formData.has('askDietaryRequirements')) return undefined;
	return formData.getAll('askDietaryRequirements').includes('true');
}

/** Whether any of the fields holds a value. */
export function hasEventText(fields: EventTextFields): boolean {
	return Object.values(fields).some((value) => value !== null && value !== undefined);
}

function sameTiers(a: readonly { hoursBefore: number; percent: number }[], b: readonly { hoursBefore: number; percent: number }[]): boolean {
	return a.length === b.length && a.every((tier, i) => tier.hoursBefore === b[i].hoursBefore && tier.percent === b[i].percent);
}

/**
 * Whether a « Menus & tarifs » payload holds anything beyond what a new
 * Event gets anyway: a Menu, a Service's Menu or price, a currency other
 * than EUR, a Deposit other than full payment, or a Refund Policy other than
 * the default one.
 */
export function pricingHasContent(payload: PricingPayload): boolean {
	if (payload.menus.length > 0) return true;
	if (payload.currency !== undefined && payload.currency !== DEFAULT_EVENT_CURRENCY) return true;
	if (payload.services.some((service) => service.menuKey !== null || service.priceAmount !== null)) return true;
	const deposit = payload.deposit;
	if (deposit && (deposit.type !== FULL_PAYMENT_DEPOSIT.type || deposit.value !== FULL_PAYMENT_DEPOSIT.value)) {
		return true;
	}
	const refund = payload.refundPolicy;
	if (
		refund &&
		(refund.type !== DEFAULT_REFUND_POLICY.type ||
			(refund.textEn ?? '').trim() !== '' ||
			(refund.textFr ?? '').trim() !== '' ||
			!sameTiers(refund.tiers, DEFAULT_REFUND_POLICY.tiers))
	) {
		return true;
	}
	return false;
}

/**
 * Create a Draft with what the first save holds. Always a Draft, never the
 * Spotlight (issue 032); everything else may be missing. Returns its id.
 */
export async function createDraftEvent(input: CreateEventInput = {}): Promise<string> {
	const { createEvent } = await import('./events');
	const event = await createEvent({ ...input, visibility: 'draft', isSpotlight: false });
	return event.id;
}
