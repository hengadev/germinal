import type { EventTextField, EventTextFields } from './event-draft';
import type { Translator } from './translator';

/**
 * English generated from French on save: the Admin writes in French, and
 * each English text follows its French one unless the Admin edits the
 * English in the same save.
 */

/** A French text and its English, as posted and as saved. */
export interface FrenchEnglishPair {
	/** The French being saved; null when blank. */
	fr: string | null;
	/** The English being saved: as posted, or as saved when not posted. */
	en: string | null;
	storedFr: string | null;
	storedEn: string | null;
	/** Proper nouns and addresses are copied, not translated. */
	copy?: boolean;
	/** The English can never be blank (a NOT NULL column): it falls back to
	 * the French, and an English identical to the French counts as not
	 * translated yet. */
	required?: boolean;
	/** Column length: a longer translation is cut. */
	maxLength?: number;
}

export interface EnglishResult<T> {
	value: T;
	/** Some English could not be translated: it is left blank (or, when
	 * required, the French), and the next save tries again. */
	translationFailed: boolean;
	error?: unknown;
}

/**
 * The English each pair calls for:
 * - English edited in this save (it differs from the saved one) is kept;
 * - otherwise it follows the French: generated when the French changed or
 *   the English is missing, cleared when the French is.
 * With no translator, translated English stays as posted. All the texts
 * to translate go in one call.
 */
export async function followFrench(
	pairs: readonly FrenchEnglishPair[],
	translator: Translator | null
): Promise<EnglishResult<(string | null)[]>> {
	const english = pairs.map((pair) => pair.en);
	const pending: number[] = [];

	pairs.forEach((pair, i) => {
		if (pair.en !== pair.storedEn) return;
		if (pair.fr === null) {
			english[i] = null;
			return;
		}
		const untranslated = pair.storedEn === null || (pair.required && pair.storedEn === pair.storedFr);
		if (pair.fr === pair.storedFr && !untranslated) return;
		if (pair.copy) english[i] = pair.fr;
		else if (translator) pending.push(i);
		else if (pair.required) english[i] = pair.en ?? pair.fr;
	});

	const fallBack = () => pending.forEach((i) => (english[i] = pairs[i].required ? pairs[i].fr : null));
	if (pending.length === 0 || !translator) {
		return { value: english, translationFailed: false };
	}
	try {
		const translations = await translator(pending.map((i) => pairs[i].fr as string));
		pending.forEach((i, n) => {
			const max = pairs[i].maxLength;
			english[i] = max ? translations[n].slice(0, max) : translations[n];
		});
		return { value: english, translationFailed: false };
	} catch (error) {
		// Never keep English that no longer matches the French.
		fallBack();
		return { value: english, translationFailed: true, error };
	}
}

type Pair = readonly [fr: EventTextField, en: EventTextField, maxLength?: number];

/** The Event's prose and place names, machine-translated. */
export const TRANSLATED_PAIRS: readonly Pair[] = [
	['titleFr', 'titleEn', 255],
	['subtitleFr', 'subtitleEn'],
	['descriptionFr', 'descriptionEn'],
	['locationFr', 'locationEn', 500],
	['cityFr', 'cityEn', 100],
	['countryFr', 'countryEn', 100],
	['admissionInfoFr', 'admissionInfoEn', 150],
	['practicalInfoFr', 'practicalInfoEn'],
	['recapFr', 'recapEn'],
];

/** The Event's proper nouns and addresses, the same in both languages. */
export const COPIED_PAIRS: readonly Pair[] = [
	['venueNameFr', 'venueNameEn'],
	['streetAddressFr', 'streetAddressEn'],
	['districtFr', 'districtEn'],
	['curatorFr', 'curatorEn'],
];

const norm = (value: string | null | undefined) => value ?? null;

/**
 * The Event's text fields with the English each posted French field calls
 * for, given what is saved (`stored`; empty for a new Event). Pairs whose
 * French the tab does not post are left alone.
 */
export async function fillEnglish(
	fields: EventTextFields,
	stored: EventTextFields,
	translator: Translator | null
): Promise<EnglishResult<EventTextFields> & { fields: EventTextFields }> {
	const posted = [
		...COPIED_PAIRS.map((pair) => ({ pair, copy: true })),
		...TRANSLATED_PAIRS.map((pair) => ({ pair, copy: false })),
	].filter(({ pair: [fr] }) => fr in fields);

	const english = await followFrench(
		posted.map(({ pair: [fr, en, maxLength], copy }) => ({
			fr: norm(fields[fr]),
			en: en in fields ? norm(fields[en]) : norm(stored[en]),
			storedFr: norm(stored[fr]),
			storedEn: norm(stored[en]),
			copy,
			maxLength,
		})),
		translator
	);

	const result: EventTextFields = { ...fields };
	posted.forEach(({ pair: [, en] }, i) => {
		const value = english.value[i];
		// A pair left as it was is not posted back unless the tab posted it.
		if (en in fields || value !== norm(stored[en])) result[en] = value;
	});
	return { ...english, value: result, fields: result };
}
