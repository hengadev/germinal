import { describe, it, expect, vi } from 'vitest';
import { translatePricing, type StoredPricingText } from '../../../src/lib/server/services/pricing-translation';
import type { Translator } from '../../../src/lib/server/services/translator';
import type { MenuPayload, PricingPayload } from '../../../src/lib/types/pricing-editor';

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

	it('translates each Course’s label and dish, keeping an English typed for the same French', async () => {
		const course = (labelFr: string, dishFr: string, labelEn = '', dishEn = '') => ({ labelFr, dishFr, labelEn, dishEn });
		const stored: StoredPricingText = {
			menus: [
				{
					id: MENU_ID,
					nameEn: 'Tasting menu',
					nameFr: 'Menu dégustation',
					courses: [course('Entrée', 'Huîtres', 'Starter', 'Oysters, as we like them')],
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
						courses: [course('Entrée', 'Huîtres', 'Starter', 'Oysters, as we like them'), course('Plat', 'Agneau')],
					}),
				],
			}),
			stored,
			fakeTranslator()
		);
		expect(value.menus[0].courses).toEqual([
			course('Entrée', 'Huîtres', 'Starter', 'Oysters, as we like them'),
			course('Plat', 'Agneau', 'EN(Plat)', 'EN(Agneau)'),
		]);
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
