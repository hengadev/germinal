import { describe, it, expect, vi } from 'vitest';
import { parseDrinkCardPayload } from '../../../src/lib/server/services/service-pricing';
import { translatePricing } from '../../../src/lib/server/services/pricing-translation';
import type { Translator } from '../../../src/lib/server/services/translator';
import { drinksViewOf, type StoredDrinkCard } from '$lib/utils/event-page';
import { adoptSavedDrinkCard } from '$lib/utils/editor-refresh';
import { MAX_DRINK_NAME, MAX_DRINK_SECTIONS, MAX_DRINKS_PER_SECTION } from '$lib/types/pricing-editor';

// The Event's Drinks card (issue 086): posted with the Menus tab, shown
// after the Menus, its English generated from the French on save.

function drink(over: Record<string, unknown> = {}) {
	return { nameEn: '', nameFr: 'Spritz', descriptionEn: null, descriptionFr: null, priceAmount: null, ...over };
}

function card(sections: unknown[], over: Record<string, unknown> = {}) {
	return JSON.stringify({ sections, noteEn: null, noteFr: null, ...over });
}

describe('parseDrinkCardPayload', () => {
	it('keeps sections and drinks in order, with optional prices', () => {
		const parsed = parseDrinkCardPayload(
			card(
				[
					{ labelEn: '', labelFr: 'Cocktails', drinks: [drink({ priceAmount: 1200, descriptionFr: 'Apérol' }), drink({ nameFr: 'Negroni' })] },
					{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: 'Citronnade', priceAmount: 0 })] },
				],
				{ noteFr: '  Réglées sur place  ' }
			)
		);
		expect(parsed).toEqual({
			sections: [
				{
					labelEn: '',
					labelFr: 'Cocktails',
					drinks: [drink({ priceAmount: 1200, descriptionFr: 'Apérol' }), drink({ nameFr: 'Negroni' })],
				},
				{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: 'Citronnade', priceAmount: 0 })] },
			],
			noteEn: null,
			noteFr: 'Réglées sur place',
		});
	});

	it('drops drinks without a French name, then sections left empty', () => {
		const parsed = parseDrinkCardPayload(
			card([
				{ labelEn: '', labelFr: 'Vins', drinks: [drink({ nameFr: '  ' })] },
				{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: '' }), drink({ nameFr: 'Eau' })] },
			])
		);
		expect(parsed?.sections).toEqual([{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: 'Eau' })] }]);
		// No drink at all: no section, which removes the card on save.
		expect(parseDrinkCardPayload(card([{ labelEn: '', labelFr: 'Vins', drinks: [] }], { noteFr: 'Seule' }))?.sections).toEqual([]);
	});

	it('refuses negative or fractional prices, malformed payloads and too many or too long texts', () => {
		const section = (drinks: unknown[]) => [{ labelEn: '', labelFr: 'S', drinks }];
		expect(parseDrinkCardPayload(card(section([drink({ priceAmount: -1 })])))).toBeNull();
		expect(parseDrinkCardPayload(card(section([drink({ priceAmount: 12.5 })])))).toBeNull();
		expect(parseDrinkCardPayload(card(section([drink({ nameFr: 'x'.repeat(MAX_DRINK_NAME + 1) })])))).toBeNull();
		expect(parseDrinkCardPayload(card(section(Array.from({ length: MAX_DRINKS_PER_SECTION + 1 }, () => drink()))))).toBeNull();
		expect(
			parseDrinkCardPayload(card(Array.from({ length: MAX_DRINK_SECTIONS + 1 }, () => ({ labelEn: '', labelFr: 'S', drinks: [drink()] }))))
		).toBeNull();
		expect(parseDrinkCardPayload('{')).toBeNull();
		expect(parseDrinkCardPayload(JSON.stringify({ sections: 'x' }))).toBeNull();
		expect(parseDrinkCardPayload(null)).toBeNull();
	});
});

const STORED: StoredDrinkCard = {
	sections: [
		{
			labelEn: 'Cocktails',
			labelFr: 'Cocktails',
			drinks: [
				{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: 'Aperol, prosecco', descriptionFr: 'Apérol, prosecco', priceAmount: 1200 },
				{ nameEn: '', nameFr: 'Citronnade', descriptionEn: null, descriptionFr: null, priceAmount: null },
			],
		},
		{ labelEn: '', labelFr: 'Vide', drinks: [] },
	],
	noteEn: null,
	noteFr: 'Réglées sur place',
};

describe('drinksViewOf', () => {
	it('gives each section its drinks, with the price in the Event’s currency when set', () => {
		const view = drinksViewOf(STORED, 'EUR', 'fr');
		expect(view?.sections).toHaveLength(1);
		expect(view?.sections[0].label).toBe('Cocktails');
		expect(view?.sections[0].drinks[0]).toMatchObject({ name: 'Spritz', description: 'Apérol, prosecco' });
		expect(view?.sections[0].drinks[0].price).toMatch(/^12\s€$/);
		expect(view?.sections[0].drinks[1]).toEqual({ name: 'Citronnade', description: '', price: '' });
		expect(view?.note).toBe('Réglées sur place');
	});

	it('reads English, falling back to the French', () => {
		const view = drinksViewOf(STORED, 'GBP', 'en');
		expect(view?.sections[0].drinks[0]).toMatchObject({ name: 'Spritz', description: 'Aperol, prosecco', price: '£12' });
		expect(view?.sections[0].drinks[1].name).toBe('Citronnade');
		expect(view?.note).toBe('Réglées sur place');
	});

	it('gives nothing for no card, or a card without a drink', () => {
		expect(drinksViewOf(null, 'EUR', 'fr')).toBeNull();
		expect(drinksViewOf({ sections: [{ labelEn: '', labelFr: 'Vide', drinks: [] }], noteEn: null, noteFr: 'Note' }, 'EUR', 'fr')).toBeNull();
	});
});

describe('translatePricing — the Drinks card', () => {
	it('generates the English of labels, names, descriptions and the note, keeping the saved one where the French is unchanged', async () => {
		const translator = vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
		const posted = {
			sections: [
				{
					labelEn: 'Cocktails',
					labelFr: 'Cocktails',
					drinks: [
						{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: null, descriptionFr: 'Apérol', priceAmount: 1200 },
						{ nameEn: '', nameFr: 'Citronnade', descriptionEn: null, descriptionFr: null, priceAmount: null },
					],
				},
			],
			noteEn: null,
			noteFr: 'Réglées sur place',
		};
		const stored = {
			menus: [],
			refundPolicy: { textEn: null, textFr: null },
			drinkCard: {
				sections: [{ labelEn: 'Cocktails', labelFr: 'Cocktails', drinks: [{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: null, descriptionFr: null }] }],
				noteEn: null,
				noteFr: null,
			},
		};
		const { value } = await translatePricing({ menus: [], services: [], drinkCard: posted }, stored, translator);
		expect(value.drinkCard).toEqual({
			sections: [
				{
					labelEn: 'Cocktails',
					labelFr: 'Cocktails',
					drinks: [
						{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: 'EN(Apérol)', descriptionFr: 'Apérol', priceAmount: 1200 },
						{ nameEn: 'EN(Citronnade)', nameFr: 'Citronnade', descriptionEn: null, descriptionFr: null, priceAmount: null },
					],
				},
			],
			noteEn: 'EN(Réglées sur place)',
			noteFr: 'Réglées sur place',
		});
		expect(translator.mock.calls.flatMap(([texts]) => texts)).not.toContain('Spritz');
	});

	it('leaves the card out when it is not posted', async () => {
		const { value } = await translatePricing({ menus: [], services: [] }, null, vi.fn<Translator>(async (texts) => texts));
		expect(value.drinkCard).toBeUndefined();
	});
});

describe('adoptSavedDrinkCard', () => {
	const draftDrink = (key: number, nameFr: string, nameEn = '', descriptionEn = '') => ({ key, nameFr, nameEn, descriptionEn });

	it('takes the English generated on save where not edited since', () => {
		const sent = {
			sections: [{ key: 1, labelEn: '', drinks: [draftDrink(2, 'Spritz'), draftDrink(3, ''), draftDrink(4, 'Citronnade')] }],
			noteEn: '',
		};
		const card = structuredClone(sent);
		card.sections[0].drinks[2].nameEn = 'Lemonade (typed)';
		const saved = {
			sections: [{ labelEn: 'EN(Cocktails)', drinks: [draftDrink(0, 'Spritz', 'EN(Spritz)'), draftDrink(0, 'Citronnade', 'EN(Citronnade)')] }],
			noteEn: 'EN(note)',
		};
		adoptSavedDrinkCard(card, sent, saved);
		expect(card.noteEn).toBe('EN(note)');
		expect(card.sections[0].labelEn).toBe('EN(Cocktails)');
		expect(card.sections[0].drinks.map((d) => d.nameEn)).toEqual(['EN(Spritz)', '', 'Lemonade (typed)']);
	});

	it('takes nothing for sections that no longer line up', () => {
		const sent = { sections: [{ key: 1, labelEn: '', drinks: [draftDrink(2, 'Spritz')] }], noteEn: '' };
		const card = structuredClone(sent);
		adoptSavedDrinkCard(card, sent, { sections: [], noteEn: '' });
		expect(card.sections[0].drinks[0].nameEn).toBe('');
	});
});
