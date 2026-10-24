import type { EditorMenu, PricingPayload } from '$lib/types/pricing-editor';
import { MAX_REFUND_POLICY_TEXT } from '$lib/utils/refund-policy';
import { followFrench, type EnglishResult, type FrenchEnglishPair } from './event-translation';
import type { Translator } from './translator';

/**
 * The English of « Menus & tarifs » — Menu names and descriptions, the
 * manual Refund Policy text — generated from the French on save, by the
 * same rule as the Event's own fields (event-translation.ts). A Menu's
 * English name is required: without a translation it takes the French.
 */

/** What is saved of the Event's pricing texts; null for a new Event. */
export interface StoredPricingText {
	menus: readonly Pick<EditorMenu, 'id' | 'nameEn' | 'nameFr' | 'descriptionEn' | 'descriptionFr'>[];
	refundPolicy: { textEn: string | null; textFr: string | null };
}

const norm = (value: string | null | undefined) => (value?.trim() ? value : null);

export async function translatePricing(
	payload: PricingPayload,
	stored: StoredPricingText | null,
	translator: Translator | null
): Promise<EnglishResult<PricingPayload>> {
	const pairs: FrenchEnglishPair[] = [];
	for (const menu of payload.menus) {
		const saved = menu.id ? stored?.menus.find((m) => m.id === menu.id) : undefined;
		pairs.push(
			{
				fr: norm(menu.nameFr),
				en: norm(menu.nameEn),
				storedFr: norm(saved?.nameFr),
				storedEn: norm(saved?.nameEn),
				required: true,
				maxLength: 255,
			},
			{
				fr: norm(menu.descriptionFr),
				en: norm(menu.descriptionEn),
				storedFr: norm(saved?.descriptionFr),
				storedEn: norm(saved?.descriptionEn),
				maxLength: 10000,
			}
		);
	}
	const refund = payload.refundPolicy;
	if (refund) {
		pairs.push({
			fr: norm(refund.textFr),
			en: norm(refund.textEn),
			storedFr: norm(stored?.refundPolicy.textFr),
			storedEn: norm(stored?.refundPolicy.textEn),
			maxLength: MAX_REFUND_POLICY_TEXT,
		});
	}

	const english = await followFrench(pairs, translator);
	const at = (i: number) => english.value[i];
	const value: PricingPayload = {
		...payload,
		menus: payload.menus.map((menu, i) => ({
			...menu,
			nameEn: at(2 * i) ?? menu.nameFr,
			descriptionEn: at(2 * i + 1),
		})),
	};
	if (refund) {
		value.refundPolicy = { ...refund, textEn: at(2 * payload.menus.length) };
	}
	return { ...english, value };
}
