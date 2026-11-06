import {
	MAX_COURSE_DISH,
	MAX_COURSE_DISH_DESCRIPTION,
	MAX_COURSE_DISH_NOTE,
	MAX_COURSE_LABEL,
	MAX_DRINK_CARD_NOTE,
	MAX_DRINK_DESCRIPTION,
	MAX_DRINK_NAME,
	MAX_DRINK_SECTION_LABEL,
	type EditorDrinkCard,
	type EditorMenu,
	type PricingPayload,
} from '$lib/types/pricing-editor';
import { MAX_REFUND_POLICY_TEXT } from '$lib/utils/refund-policy';
import { followFrench, type EnglishResult, type FrenchEnglishPair } from './event-translation';
import type { Translator } from './translator';

/**
 * The English of « Menus & tarifs » — Menu names, Courses (label and
 * dishes, each matched to the saved one at the same place) and notes, the
 * manual Refund Policy text — generated from the French on save, by the
 * same rule as the Event's own fields (event-translation.ts). A Menu's
 * English name is required: without a translation it takes the French.
 */

/** What is saved of the Event's pricing texts; null for a new Event. */
export interface StoredPricingText {
	menus: readonly Pick<EditorMenu, 'id' | 'nameEn' | 'nameFr' | 'courses' | 'descriptionEn' | 'descriptionFr'>[];
	refundPolicy: { textEn: string | null; textFr: string | null };
	/** The Event's Drinks cards (issues 086, 087), matched by id like the
	 * Menus. */
	drinkCards?: readonly Pick<EditorDrinkCard, 'id' | 'nameEn' | 'nameFr' | 'sections' | 'noteEn' | 'noteFr'>[];
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
				dishes: course.dishes.map((dish, d) => {
					const savedDish = savedCourse?.dishes[d];
					return {
						name: add({
							fr: norm(dish.nameFr),
							en: norm(dish.nameEn),
							storedFr: norm(savedDish?.nameFr),
							storedEn: norm(savedDish?.nameEn),
							maxLength: MAX_COURSE_DISH,
						}),
						description: add({
							fr: norm(dish.descriptionFr),
							en: norm(dish.descriptionEn),
							storedFr: norm(savedDish?.descriptionFr),
							storedEn: norm(savedDish?.descriptionEn),
							maxLength: MAX_COURSE_DISH_DESCRIPTION,
						}),
						note: add({
							fr: norm(dish.noteFr),
							en: norm(dish.noteEn),
							storedFr: norm(savedDish?.noteFr),
							storedEn: norm(savedDish?.noteEn),
							maxLength: MAX_COURSE_DISH_NOTE,
						}),
					};
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

	// The Drinks cards (issues 086, 087): their names (required), then each
	// text matched to the saved one at the same place — section by section,
	// drink by drink — then the note.
	const drinkCards = payload.drinkCards;
	const drinkCardAt = (drinkCards ?? []).map((card) => {
		const saved = card.id ? stored?.drinkCards?.find((c) => c.id === card.id) : undefined;
		const name = add({
			fr: norm(card.nameFr),
			en: norm(card.nameEn),
			storedFr: norm(saved?.nameFr),
			storedEn: norm(saved?.nameEn),
			required: true,
			maxLength: 255,
		});
		const sections = card.sections.map((section, s) => {
			const savedSection = saved?.sections[s];
			return {
				label: add({
					fr: norm(section.labelFr),
					en: norm(section.labelEn),
					storedFr: norm(savedSection?.labelFr),
					storedEn: norm(savedSection?.labelEn),
					maxLength: MAX_DRINK_SECTION_LABEL,
				}),
				drinks: section.drinks.map((drink, d) => {
					const savedDrink = savedSection?.drinks[d];
					return {
						name: add({
							fr: norm(drink.nameFr),
							en: norm(drink.nameEn),
							storedFr: norm(savedDrink?.nameFr),
							storedEn: norm(savedDrink?.nameEn),
							maxLength: MAX_DRINK_NAME,
						}),
						description: add({
							fr: norm(drink.descriptionFr),
							en: norm(drink.descriptionEn),
							storedFr: norm(savedDrink?.descriptionFr),
							storedEn: norm(savedDrink?.descriptionEn),
							maxLength: MAX_DRINK_DESCRIPTION,
						}),
					};
				}),
			};
		});
		const note = add({
			fr: norm(card.noteFr),
			en: norm(card.noteEn),
			storedFr: norm(saved?.noteFr),
			storedEn: norm(saved?.noteEn),
			maxLength: MAX_DRINK_CARD_NOTE,
		});
		return { name, sections, note };
	});
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
				dishes: course.dishes.map((dish, d) => {
					const english = menuAt[m].courses[c].dishes[d];
					return {
						...dish,
						nameEn: at(english.name) ?? '',
						descriptionEn: at(english.description),
						noteEn: dish.alternative ? at(english.note) : null,
					};
				}),
			})),
			descriptionEn: at(menuAt[m].description),
		})),
	};
	if (refund) {
		value.refundPolicy = { ...refund, textEn: at(refundAt) };
	}
	if (drinkCards) {
		value.drinkCards = drinkCards.map((card, c) => ({
			...card,
			nameEn: at(drinkCardAt[c].name) ?? card.nameFr,
			sections: card.sections.map((section, s) => ({
				...section,
				labelEn: at(drinkCardAt[c].sections[s].label) ?? '',
				drinks: section.drinks.map((drink, d) => ({
					...drink,
					nameEn: at(drinkCardAt[c].sections[s].drinks[d].name) ?? '',
					descriptionEn: at(drinkCardAt[c].sections[s].drinks[d].description),
				})),
			})),
			noteEn: at(drinkCardAt[c].note),
		}));
	}
	return { ...english, value };
}
