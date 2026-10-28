import { MAX_COURSE_DISH, MAX_COURSE_LABEL, type EditorMenu, type PricingPayload } from '$lib/types/pricing-editor';
import { MAX_REFUND_POLICY_TEXT } from '$lib/utils/refund-policy';
import { followFrench, type EnglishResult, type FrenchEnglishPair } from './event-translation';
import type { Translator } from './translator';

/**
 * The English of « Menus & tarifs » — Menu names, Courses (label and
 * dish, each matched to the saved Course at the same place) and notes, the
 * manual Refund Policy text — generated from the French on save, by the
 * same rule as the Event's own fields (event-translation.ts). A Menu's
 * English name is required: without a translation it takes the French.
 */

/** What is saved of the Event's pricing texts; null for a new Event. */
export interface StoredPricingText {
	menus: readonly Pick<EditorMenu, 'id' | 'nameEn' | 'nameFr' | 'courses' | 'descriptionEn' | 'descriptionFr'>[];
	refundPolicy: { textEn: string | null; textFr: string | null };
}

const norm = (value: string | null | undefined) => (value?.trim() ? value : null);

export async function translatePricing(
	payload: PricingPayload,
	stored: StoredPricingText | null,
	translator: Translator | null
): Promise<EnglishResult<PricingPayload>> {
	const pairs: FrenchEnglishPair[] = [];
	/** Each pair's place in `pairs` is its English's place in the result. */
	const add = (pair: FrenchEnglishPair) => pairs.push(pair) - 1;
	const menuAt = payload.menus.map((menu) => {
		const saved = menu.id ? stored?.menus.find((m) => m.id === menu.id) : undefined;
		const name = add({
			fr: norm(menu.nameFr),
			en: norm(menu.nameEn),
			storedFr: norm(saved?.nameFr),
			storedEn: norm(saved?.nameEn),
			required: true,
			maxLength: 255,
		});
		const courses = menu.courses.map((course, i) => {
			const savedCourse = saved?.courses[i];
			return {
				label: add({
					fr: norm(course.labelFr),
					en: norm(course.labelEn),
					storedFr: norm(savedCourse?.labelFr),
					storedEn: norm(savedCourse?.labelEn),
					maxLength: MAX_COURSE_LABEL,
				}),
				dish: add({
					fr: norm(course.dishFr),
					en: norm(course.dishEn),
					storedFr: norm(savedCourse?.dishFr),
					storedEn: norm(savedCourse?.dishEn),
					maxLength: MAX_COURSE_DISH,
				}),
			};
		});
		const description = add({
			fr: norm(menu.descriptionFr),
			en: norm(menu.descriptionEn),
			storedFr: norm(saved?.descriptionFr),
			storedEn: norm(saved?.descriptionEn),
			maxLength: 10000,
		});
		return { name, courses, description };
	});
	const refund = payload.refundPolicy;
	const refundAt = refund
		? add({
			fr: norm(refund.textFr),
			en: norm(refund.textEn),
			storedFr: norm(stored?.refundPolicy.textFr),
			storedEn: norm(stored?.refundPolicy.textEn),
			maxLength: MAX_REFUND_POLICY_TEXT,
		})
		: -1;

	const english = await followFrench(pairs, translator);
	const at = (i: number) => english.value[i];
	const value: PricingPayload = {
		...payload,
		menus: payload.menus.map((menu, m) => ({
			...menu,
			nameEn: at(menuAt[m].name) ?? menu.nameFr,
			courses: menu.courses.map((course, c) => ({
				...course,
				labelEn: at(menuAt[m].courses[c].label) ?? '',
				dishEn: at(menuAt[m].courses[c].dish) ?? '',
			})),
			descriptionEn: at(menuAt[m].description),
		})),
	};
	if (refund) {
		value.refundPolicy = { ...refund, textEn: at(refundAt) };
	}
	return { ...english, value };
}
