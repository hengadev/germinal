import type { EventTextField, EventTextFields } from './event-draft';
import type { Translator } from './translator';

/**
 * The Event's English, generated from its French when a tab is saved: the
 * Admin writes in French, and each English field follows its French one
 * unless the Admin edits the English in the same save.
 */

type Pair = readonly [fr: EventTextField, en: EventTextField];

/** Prose and place names, machine-translated. */
export const TRANSLATED_PAIRS: readonly Pair[] = [
	['titleFr', 'titleEn'],
	['subtitleFr', 'subtitleEn'],
	['descriptionFr', 'descriptionEn'],
	['locationFr', 'locationEn'],
	['cityFr', 'cityEn'],
	['countryFr', 'countryEn'],
	['admissionInfoFr', 'admissionInfoEn'],
	['practicalInfoFr', 'practicalInfoEn'],
	['recapFr', 'recapEn'],
];

/** Proper nouns and addresses, the same in both languages: copied. */
export const COPIED_PAIRS: readonly Pair[] = [
	['venueNameFr', 'venueNameEn'],
	['streetAddressFr', 'streetAddressEn'],
	['districtFr', 'districtEn'],
	['curatorFr', 'curatorEn'],
];

export interface EnglishFillResult {
	fields: EventTextFields;
	/** Some English could not be translated: it is left blank, and the next
	 * save of its tab tries again. */
	translationFailed: boolean;
	error?: unknown;
}

const norm = (value: string | null | undefined) => value ?? null;

/**
 * The English each posted French field calls for, given what is saved
 * (`stored`; empty for a new Event):
 * - English edited in this save (it differs from the saved one) is kept;
 * - otherwise it follows the French: generated when the French changed or
 *   the English is missing, cleared when the French is.
 * With no translator, translated pairs keep the English as posted.
 */
export async function fillEnglish(
	fields: EventTextFields,
	stored: EventTextFields,
	translator: Translator | null
): Promise<EnglishFillResult> {
	const result: EventTextFields = { ...fields };
	const pending: { en: EventTextField; fr: string }[] = [];

	const follow = ([fr, en]: Pair, translated: boolean) => {
		if (!(fr in fields)) return;
		const frNew = norm(fields[fr]);
		const enStored = norm(stored[en]);
		const enPosted = en in fields ? norm(fields[en]) : enStored;
		if (enPosted !== enStored) return;
		if (frNew === null) {
			result[en] = null;
		} else if (frNew !== norm(stored[fr]) || enStored === null) {
			if (!translated) result[en] = frNew;
			else if (translator) pending.push({ en, fr: frNew });
		}
	};
	COPIED_PAIRS.forEach((pair) => follow(pair, false));
	TRANSLATED_PAIRS.forEach((pair) => follow(pair, true));

	if (pending.length === 0 || !translator) {
		return { fields: result, translationFailed: false };
	}
	try {
		const translations = await translator(pending.map((p) => p.fr));
		pending.forEach((p, i) => (result[p.en] = translations[i]));
		return { fields: result, translationFailed: false };
	} catch (error) {
		// Never keep English that no longer matches the French.
		pending.forEach((p) => (result[p.en] = null));
		return { fields: result, translationFailed: true, error };
	}
}
