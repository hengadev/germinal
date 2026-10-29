import { describe, it, expect } from 'vitest';
import {
	hasEventText,
	isEmptyDraftEvent,
	pricingHasContent,
	readAskDietaryRequirements,
	readEventTextFields,
	type DraftContentCounts,
} from '../../../src/lib/server/services/event-draft';
import { DEFAULT_EVENT_TIME_ZONE } from '../../../src/lib/utils/event-time';
import type { PricingPayload } from '../../../src/lib/types/pricing-editor';

function formOf(fields: Record<string, string>): FormData {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return form;
}

describe('readEventTextFields', () => {
	it('keeps only the fields the tab posts, blank ones as null', () => {
		const fields = readEventTextFields(formOf({ titleFr: 'Dîner', titleEn: '  ', subtitleFr: '' }));
		expect(fields).toEqual({ titleFr: 'Dîner', titleEn: null, subtitleFr: null });
		expect('locationEn' in fields).toBe(false);
	});

	it('reads the « Infos pratiques » tab’s fields like any other text (issue 040)', () => {
		expect(readEventTextFields(formOf({ practicalInfoFr: 'Code 4512B.', practicalInfoEn: '' }))).toEqual({
			practicalInfoFr: 'Code 4512B.',
			practicalInfoEn: null,
		});
		// A tab that does not post them leaves them alone.
		expect(readEventTextFields(formOf({ titleFr: 'Dîner' }))).toEqual({ titleFr: 'Dîner' });
	});

	it('reads an empty Collaborators or timings list as nothing', () => {
		expect(readEventTextFields(formOf({ collaborators: '[]', timings: '[{"label":"a","time":"b"}]' }))).toEqual({
			collaborators: null,
			timings: '[{"label":"a","time":"b"}]',
		});
	});

	it('reads the Internal Notes posted by « Essentiel », blank ones as null (issue 039)', () => {
		expect(readEventTextFields(formOf({ internalNotes: 'Client : Maison Lenoir' }))).toEqual({ internalNotes: 'Client : Maison Lenoir' });
		expect(readEventTextFields(formOf({ internalNotes: '   ' }))).toEqual({ internalNotes: null });
		expect(hasEventText(readEventTextFields(formOf({ internalNotes: 'Budget 4 000 €' })))).toBe(true);
	});

	it('ignores fields that are not the Event’s texts', () => {
		expect(readEventTextFields(formOf({ visibility: 'public', timeZone: 'Europe/London' }))).toEqual({});
	});
});

describe('hasEventText', () => {
	it('is false when every field is blank or absent', () => {
		expect(hasEventText({})).toBe(false);
		expect(hasEventText({ titleEn: null, collaborators: null })).toBe(false);
	});

	it('is true as soon as one field holds a value', () => {
		expect(hasEventText({ titleEn: null, cityFr: 'Lyon' })).toBe(true);
	});
});

describe('pricingHasContent', () => {
	const untouched: PricingPayload = {
		menus: [],
		services: [{ serviceId: 'x', menuKey: null, priceAmount: null, clearLegacyPrices: false }],
		deposit: { type: 'percent', value: 100 },
		refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 24, percent: 100 }] },
	};

	it('is false for what a new Event gets anyway', () => {
		expect(pricingHasContent(untouched)).toBe(false);
		expect(pricingHasContent({ menus: [], services: [] })).toBe(false);
		expect(pricingHasContent({ ...untouched, currency: 'EUR' })).toBe(false);
	});

	it('is true with a Menu, a price, a currency, a Deposit or a Refund Policy of its own', () => {
		expect(pricingHasContent({ ...untouched, currency: 'GBP' })).toBe(true);
		expect(pricingHasContent({
			...untouched,
			menus: [{ key: 'new-1', id: null, nameEn: 'Tasting', nameFr: 'Dégustation', courses: [], descriptionEn: null, descriptionFr: null }],
		})).toBe(true);
		expect(pricingHasContent({ ...untouched, services: [{ ...untouched.services[0], priceAmount: 0 }] })).toBe(true);
		expect(pricingHasContent({ ...untouched, deposit: { type: 'percent', value: 30 } })).toBe(true);
		expect(pricingHasContent({
			...untouched,
			refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 100 }] },
		})).toBe(true);
		expect(pricingHasContent({
			...untouched,
			refundPolicy: { type: 'manual', textEn: null, textFr: 'Sur demande.', tiers: [] },
		})).toBe(true);
	});
});

describe('readAskDietaryRequirements (issue 041)', () => {
	it('reads the switch when the « Infos pratiques » tab posts it', () => {
		const on = new FormData();
		on.append('askDietaryRequirements', 'false');
		on.append('askDietaryRequirements', 'true');
		expect(readAskDietaryRequirements(on)).toBe(true);

		const off = new FormData();
		off.append('askDietaryRequirements', 'false');
		expect(readAskDietaryRequirements(off)).toBe(false);
	});

	it('leaves the switch alone when another tab is saved', () => {
		expect(readAskDietaryRequirements(formOf({ titleFr: 'Dîner' }))).toBeUndefined();
	});
});

describe('isEmptyDraftEvent (issue 015)', () => {
	const NO_CONTENT: DraftContentCounts = {
		days: 0,
		services: 0,
		seatings: 0,
		menus: 0,
		pricedServices: 0,
		media: 0,
		coupons: 0,
		staff: 0,
		tasks: 0,
	};
	const bareDraft = { visibility: 'draft', timeZone: DEFAULT_EVENT_TIME_ZONE };

	it('is true for the Draft « Nouvel événement » creates, with nothing filled in', () => {
		expect(isEmptyDraftEvent(bareDraft, NO_CONTENT)).toBe(true);
		expect(
			isEmptyDraftEvent(
				{ ...bareDraft, titleEn: null, internalNotes: null, recapFr: null, collaborators: null },
				NO_CONTENT
			)
		).toBe(true);
	});

	it('is false as soon as one text holds a value, the Internal Notes included', () => {
		expect(isEmptyDraftEvent({ ...bareDraft, titleFr: 'Une soirée' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...bareDraft, internalNotes: 'Client : Maison Lenoir' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...bareDraft, timings: '[{"label":"Portes","time":"19:00"}]' }, NO_CONTENT)).toBe(false);
	});

	it('is false with any Day, Service, Seating, Menu or price, Visual or Event Photo', () => {
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, days: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, services: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, seatings: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, menus: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, pricedServices: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, media: 1 })).toBe(false);
	});

	it('is false with a Promo Code, staff or a task, which deleting it would take along', () => {
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, coupons: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, staff: 1 })).toBe(false);
		expect(isEmptyDraftEvent(bareDraft, { ...NO_CONTENT, tasks: 1 })).toBe(false);
	});

	it('is false with a setting changed from a new Event’s, and true with the defaults', () => {
		const defaults = {
			...bareDraft,
			currency: 'EUR',
			depositType: 'percent',
			depositValue: 100,
			refundPolicyType: 'rules',
			// As jsonb gives it back: keys reordered.
			refundPolicyTiers: [{ percent: 100, hoursBefore: 24 }],
			askDietaryRequirements: false,
		};
		expect(isEmptyDraftEvent(defaults, NO_CONTENT)).toBe(true);
		expect(isEmptyDraftEvent({ ...defaults, venueCapacity: 40 }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, bookingOpensAt: new Date('2026-11-01T10:00:00Z') }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, bookingClosesHoursBefore: 48 }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, askDietaryRequirements: true }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, currency: 'GBP' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, depositValue: 30 }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, refundPolicyType: 'manual', refundPolicyTextFr: 'Non remboursable' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...defaults, refundPolicyTiers: [{ hoursBefore: 72, percent: 50 }] }, NO_CONTENT)).toBe(false);
	});

	it('is false with a cover chosen, or a Time Zone other than the default one', () => {
		expect(isEmptyDraftEvent({ ...bareDraft, coverMediaId: 'media-1' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...bareDraft, coverVideoId: 'media-2' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...bareDraft, timeZone: 'Europe/London' }, NO_CONTENT)).toBe(false);
	});

	it('is false for a Private or Public Event, however empty', () => {
		expect(isEmptyDraftEvent({ ...bareDraft, visibility: 'private' }, NO_CONTENT)).toBe(false);
		expect(isEmptyDraftEvent({ ...bareDraft, visibility: 'public' }, NO_CONTENT)).toBe(false);
	});
});
