import { describe, it, expect, vi } from 'vitest';
import { parsePricingPayload } from '../../../src/lib/server/services/service-pricing';
import { translatePricing } from '../../../src/lib/server/services/pricing-translation';
import type { Translator } from '../../../src/lib/server/services/translator';
import { drinksViewOf, projectDrinksOf, type StoredDrinkCard } from '$lib/utils/event-page';
import { adoptSavedDrinkCards } from '$lib/utils/editor-refresh';
import { MAX_DRINK_NAME, MAX_DRINK_SECTIONS, MAX_DRINKS_PER_SECTION } from '$lib/types/pricing-editor';

// The Event's Drinks cards (issues 086, 087): posted with the Menus tab
// like its Menus, picked per meal, shown after the Menus, their English
// generated from the French on save.

function drink(over: Record<string, unknown> = {}) {
	return { nameEn: '', nameFr: 'Spritz', descriptionEn: null, descriptionFr: null, priceAmount: null, ...over };
}

function card(sections: unknown[], over: Record<string, unknown> = {}) {
	return JSON.stringify({
		menus: [],
		drinkCards: [{ key: 'c', id: null, nameEn: '', nameFr: 'Carte', sections, noteEn: null, noteFr: null, ...over }],
		services: [],
	});
}

function parsedCards(raw: string) {
	const parsed = parsePricingPayload(raw);
	return parsed.ok ? parsed.payload.drinkCards : null;
}

describe('parsePricingPayload — the Drinks cards', () => {
	it('keeps sections and drinks in order, with optional prices', () => {
		const cards = parsedCards(
			card(
				[
					{ labelEn: '', labelFr: 'Cocktails', drinks: [drink({ priceAmount: 1200, descriptionFr: 'Apérol' }), drink({ nameFr: 'Negroni' })] },
					{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: 'Citronnade', priceAmount: 0 })] },
				],
				{ noteFr: '  Réglées sur place  ' }
			)
		);
		expect(cards).toEqual([
			{
				key: 'c',
				id: null,
				nameEn: '',
				nameFr: 'Carte',
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
			},
		]);
	});

	it('drops drinks without a French name, then sections left empty', () => {
		const cards = parsedCards(
			card([
				{ labelEn: '', labelFr: 'Vins', drinks: [drink({ nameFr: '  ' })] },
				{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: '' }), drink({ nameFr: 'Eau' })] },
			])
		);
		expect(cards?.[0].sections).toEqual([{ labelEn: '', labelFr: 'Soft', drinks: [drink({ nameFr: 'Eau' })] }]);
		// No drink at all: no section, which removes the card on save.
		expect(parsedCards(card([{ labelEn: '', labelFr: 'Vins', drinks: [] }], { noteFr: 'Seule' }))?.[0].sections).toEqual([]);
	});

	it('refuses negative or fractional prices, malformed payloads and too many or too long texts', () => {
		const section = (drinks: unknown[]) => [{ labelEn: '', labelFr: 'S', drinks }];
		expect(parsedCards(card(section([drink({ priceAmount: -1 })])))).toBeNull();
		expect(parsedCards(card(section([drink({ priceAmount: 12.5 })])))).toBeNull();
		expect(parsedCards(card(section([drink({ nameFr: 'x'.repeat(MAX_DRINK_NAME + 1) })])))).toBeNull();
		expect(parsedCards(card(section(Array.from({ length: MAX_DRINKS_PER_SECTION + 1 }, () => drink()))))).toBeNull();
		expect(
			parsedCards(card(Array.from({ length: MAX_DRINK_SECTIONS + 1 }, () => ({ labelEn: '', labelFr: 'S', drinks: [drink()] }))))
		).toBeNull();
		expect(parsePricingPayload('{')).toEqual({ ok: false, reason: 'malformed' });
		expect(parsedCards(JSON.stringify({ menus: [], drinkCards: [{ sections: 'x' }], services: [] }))).toBeNull();
		// A card needs a French name, and keys must be unique.
		expect(parsedCards(card([{ labelEn: '', labelFr: 'S', drinks: [drink()] }], { nameFr: '  ' }))).toBeNull();
		expect(parsedCards(card([{ labelEn: '', labelFr: 'S', drinks: [drink()] }], { key: '' }))).toBeNull();
		expect(parsedCards(card([{ labelEn: '', labelFr: 'S', drinks: [drink()] }], { id: 'not-a-uuid' }))).toBeNull();
	});

	it('takes each Service’s Drinks card, and only a listed one', () => {
		const ok = parsePricingPayload(
			JSON.stringify({
				menus: [],
				drinkCards: [{ key: 'c', id: null, nameEn: '', nameFr: 'Carte', sections: [{ labelEn: '', labelFr: 'S', drinks: [drink()] }], noteEn: null, noteFr: null }],
				services: [{ serviceId: '00000000-0000-4000-8000-000000000001', menuKey: null, drinkCardKey: 'c', priceAmount: null, clearLegacyPrices: false }],
			})
		);
		expect(ok).toMatchObject({ ok: true });
		const unknown = parsePricingPayload(
			JSON.stringify({
				menus: [],
				services: [{ serviceId: '00000000-0000-4000-8000-000000000001', menuKey: null, drinkCardKey: 'nope', priceAmount: null, clearLegacyPrices: false }],
			})
		);
		expect(unknown).toEqual({ ok: false, reason: 'drink-card' });
	});
});

const STORED: StoredDrinkCard = {
	nameEn: 'Drinks',
	nameFr: 'Boissons',
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
	it('gives the card its name and each section its drinks, with the price in the Event’s currency when set', () => {
		const view = drinksViewOf(STORED, 'EUR', 'fr');
		expect(view?.name).toBe('Boissons');
		expect(view?.sections).toHaveLength(1);
		expect(view?.sections[0].label).toBe('Cocktails');
		expect(view?.sections[0].drinks[0]).toMatchObject({ name: 'Spritz', description: 'Apérol, prosecco' });
		expect(view?.sections[0].drinks[0].price).toMatch(/^12\s€$/);
		expect(view?.sections[0].drinks[1]).toEqual({ name: 'Citronnade', description: '', price: '' });
		expect(view?.note).toBe('Réglées sur place');
	});

	it('reads English, falling back to the French', () => {
		const view = drinksViewOf(STORED, 'GBP', 'en');
		expect(view?.name).toBe('Drinks');
		expect(view?.sections[0].drinks[0]).toMatchObject({ name: 'Spritz', description: 'Aperol, prosecco', price: '£12' });
		expect(view?.sections[0].drinks[1].name).toBe('Citronnade');
		expect(view?.note).toBe('Réglées sur place');
	});

	it('gives nothing for no card, or a card without a drink', () => {
		expect(drinksViewOf(null, 'EUR', 'fr')).toBeNull();
		expect(drinksViewOf({ nameEn: 'Drinks', nameFr: 'Boissons', sections: [{ labelEn: '', labelFr: 'Vide', drinks: [] }], noteEn: null, noteFr: 'Note' }, 'EUR', 'fr')).toBeNull();
	});
});

describe('projectDrinksOf', () => {
	it('lists the distinct cards offered, in order of their first Service', () => {
		const cards = [
			{ id: 'a', ...STORED },
			{ id: 'b', nameEn: 'Evening drinks', nameFr: 'Boissons du soir', sections: STORED.sections.slice(0, 1), noteEn: null, noteFr: null },
		];
		const services = [
			{ date: '2025-03-13', kind: 'dinner' as const, menuId: null, drinkCardId: 'b' },
			{ date: '2025-03-12', kind: 'dinner' as const, menuId: null, drinkCardId: 'a' },
			{ date: '2025-03-14', kind: 'lunch' as const, menuId: null, drinkCardId: null },
			{ date: '2025-03-14', kind: 'dinner' as const, menuId: null, drinkCardId: 'a' },
		];
		expect(projectDrinksOf(services, cards, 'fr', 'EUR').map((card) => card.name)).toEqual(['Boissons', 'Boissons du soir']);
		expect(projectDrinksOf([], cards, 'fr', 'EUR')).toEqual([]);
	});
});

describe('translatePricing — the Drinks cards', () => {
	it('generates the English of the name, labels, descriptions and the note, keeping the saved one where the French is unchanged', async () => {
		const translator = vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
		const posted = {
			key: 'c',
			id: 'stored-1',
			nameEn: '',
			nameFr: 'Boissons',
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
			drinkCards: [
				{
					id: 'stored-1',
					nameEn: 'Drinks',
					nameFr: 'Boissons',
					sections: [{ labelEn: 'Cocktails', labelFr: 'Cocktails', drinks: [{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: null, descriptionFr: null, priceAmount: null }] }],
					noteEn: null,
					noteFr: null,
				},
			],
		};
		const { value } = await translatePricing({ menus: [], drinkCards: [posted], services: [] }, stored, translator);
		expect(value.drinkCards).toEqual([
			{
				...posted,
				// The posted English name was cleared: the French takes over.
				nameEn: 'Boissons',
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
			},
		]);
		expect(translator.mock.calls.flatMap(([texts]) => texts)).not.toContain('Spritz');
	});

	it('leaves the cards out when none is posted', async () => {
		const { value } = await translatePricing({ menus: [], services: [] }, null, vi.fn<Translator>(async (texts) => texts));
		expect(value.drinkCards).toBeUndefined();
	});
});

describe('adoptSavedDrinkCards', () => {
	const draftDrink = (key: number, nameFr: string, nameEn = '', descriptionEn = '') => ({ key, nameFr, nameEn, descriptionEn });

	it('takes the ids and the English generated on save where not edited since', () => {
		const sent = {
			key: 'c1',
			id: null,
			nameEn: '',
			sections: [{ key: 1, labelEn: '', drinks: [draftDrink(2, 'Spritz'), draftDrink(3, ''), draftDrink(4, 'Citronnade')] }],
			noteEn: '',
		};
		const cards = [structuredClone(sent)];
		cards[0].sections[0].drinks[2].nameEn = 'Lemonade (typed)';
		const saved = [
			{
				key: 'c1',
				id: 'stored-1',
				nameEn: 'EN(Boissons)',
				sections: [{ labelEn: 'EN(Cocktails)', drinks: [draftDrink(0, 'Spritz', 'EN(Spritz)'), draftDrink(0, 'Citronnade', 'EN(Citronnade)')] }],
				noteEn: 'EN(note)',
			},
		];
		adoptSavedDrinkCards(cards, [sent], saved, { c1: 'stored-1' });
		expect(cards[0].id).toBe('stored-1');
		expect(cards[0].nameEn).toBe('EN(Boissons)');
		expect(cards[0].noteEn).toBe('EN(note)');
		expect(cards[0].sections[0].labelEn).toBe('EN(Cocktails)');
		expect(cards[0].sections[0].drinks.map((d) => d.nameEn)).toEqual(['EN(Spritz)', '', 'Lemonade (typed)']);
	});

	it('takes nothing for sections that no longer line up, and keeps a card not on the server new', () => {
		const sent = { key: 'c1', id: null, nameEn: '', sections: [{ key: 1, labelEn: '', drinks: [draftDrink(2, 'Spritz')] }], noteEn: '' };
		const cards = [structuredClone(sent), { key: 'c2', id: 'gone', nameEn: '', sections: [], noteEn: '' }];
		adoptSavedDrinkCards(cards, [sent], [{ key: 'c1', id: 'x', nameEn: '', sections: [], noteEn: '' }], {});
		expect(cards[0].sections[0].drinks[0].nameEn).toBe('');
		expect(cards[1].id).toBeNull();
	});
});
