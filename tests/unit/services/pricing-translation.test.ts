import { describe, it, expect, vi } from 'vitest';
import { translatePricing, type StoredPricingText } from '../../../src/lib/server/services/pricing-translation';
import type { Translator } from '../../../src/lib/server/services/translator';
import type { MenuDish, MenuPayload, PricingPayload } from '../../../src/lib/types/pricing-editor';

const MENU_ID = '11111111-1111-4111-8111-111111111111';

function fakeTranslator() {
	return vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
}

function menu(over: Partial<MenuPayload> = {}): MenuPayload {
	return { key: 'm', id: null, nameEn: '', nameFr: 'Menu dégustation', courses: [], descriptionEn: null, descriptionFr: null, ...over };
}

function payload(over: Partial<PricingPayload> = {}): PricingPayload {
	return { menus: [menu()], services: [], ...over };
}

describe('translatePricing', () => {
	it('translates a new Menu’s name and description and the Refund Policy text', async () => {
		const { value } = await translatePricing(
			payload({
				menus: [menu({ descriptionFr: 'Sept plats' })],
				refundPolicy: { type: 'manual', textEn: null, textFr: 'Au cas par cas.', tiers: [] },
			}),
			null,
			fakeTranslator()
		);
		expect(value.menus[0]).toMatchObject({ nameEn: 'EN(Menu dégustation)', descriptionEn: 'EN(Sept plats)' });
		expect(value.refundPolicy?.textEn).toBe('EN(Au cas par cas.)');
	});

	it('keeps an English name edited in the same save', async () => {
		const stored: StoredPricingText = {
			menus: [{ id: MENU_ID, nameEn: 'Tasting menu', nameFr: 'Menu dégustation', courses: [], descriptionEn: null, descriptionFr: null }],
			refundPolicy: { textEn: null, textFr: null },
		};
		const translator = fakeTranslator();
		const { value } = await translatePricing(
			payload({ menus: [menu({ id: MENU_ID, nameFr: 'Menu du chef', nameEn: 'Chef’s menu' })] }),
			stored,
			translator
		);
		expect(value.menus[0].nameEn).toBe('Chef’s menu');
		expect(translator).not.toHaveBeenCalled();
	});

	it('translates each Course’s label and each dish’s name, description and alternative note, keeping an English typed for the same French', async () => {
		const course = (labelFr: string, dishes: MenuDish[], labelEn = '') => ({ labelFr, labelEn, dishes });
		const dish = (nameFr: string, over: Record<string, unknown> = {}) => ({
			nameFr,
			nameEn: '',
			descriptionFr: null,
			descriptionEn: null,
			alternative: false,
			noteFr: null,
			noteEn: null,
			...over,
		});
		const stored: StoredPricingText = {
			menus: [
				{
					id: MENU_ID,
					nameEn: 'Tasting menu',
					nameFr: 'Menu dégustation',
					courses: [course('Entrée', [dish('Huîtres', { nameEn: 'Oysters, as we like them', descriptionFr: 'De Normandie', descriptionEn: 'From Normandy' })])],
					descriptionEn: null,
					descriptionFr: null,
				},
			],
			refundPolicy: { textEn: null, textFr: null },
		};
		const { value } = await translatePricing(
			payload({
				menus: [
					menu({
						id: MENU_ID,
						nameEn: 'Tasting menu',
						courses: [
							course('Entrée', [
								// Same French name and description: the typed English is kept.
								dish('Huîtres', { nameEn: 'Oysters, as we like them', descriptionFr: 'De Normandie', descriptionEn: 'From Normandy' }),
								dish('Velouté', { descriptionFr: 'Sans gluten', alternative: true, noteFr: 'Options sans lactose' }),
							]),
							course('Plat', [dish('Agneau')]),
						],
					}),
				],
			}),
			stored,
			fakeTranslator()
		);
		expect(value.menus[0].courses).toEqual([
				course('Entrée', [
						dish('Huîtres', { nameEn: 'Oysters, as we like them', descriptionFr: 'De Normandie', descriptionEn: 'From Normandy' }),
						dish('Velouté', {
							nameEn: 'EN(Velouté)',
							descriptionFr: 'Sans gluten',
							descriptionEn: 'EN(Sans gluten)',
							alternative: true,
							noteFr: 'Options sans lactose',
							noteEn: 'EN(Options sans lactose)',
						}),
				], 'EN(Entrée)'),
				course('Plat', [dish('Agneau', { nameEn: 'EN(Agneau)' })], 'EN(Plat)'),
			]);
		// A dish that is not an alternative carries no note, translated or not.
		expect(value.menus[0].courses[1].dishes[0]).toMatchObject({ alternative: false, noteEn: null });
	});

	it('gives a Menu the French name when there is no translator', async () => {
		const { value } = await translatePricing(payload(), null, null);
		expect(value.menus[0].nameEn).toBe('Menu dégustation');
	});

	it('leaves the Refund Policy out when the payload has none', async () => {
		const { value } = await translatePricing(payload(), null, fakeTranslator());
		expect(value.refundPolicy).toBeUndefined();
	});
});
