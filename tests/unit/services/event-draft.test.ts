import { describe, it, expect } from 'vitest';
import {
	hasEventText,
	pricingHasContent,
	readEventTextFields,
} from '../../../src/lib/server/services/event-draft';
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
			menus: [{ key: 'new-1', id: null, nameEn: 'Tasting', nameFr: 'Dégustation', descriptionEn: null, descriptionFr: null }],
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
