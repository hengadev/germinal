import { followFrench, type EnglishResult } from './event-translation';
import type { Translator } from './translator';

/**
 * A Talent's English — role, bio, quote, specialisations — generated from
 * the French on save, by the same rule as the Event's fields
 * (event-translation.ts). The role and bio are required: without a
 * translation they take the French.
 */

export interface TalentText {
	roleEn?: string | null;
	roleFr?: string | null;
	bioEn?: string | null;
	bioFr?: string | null;
	quoteEn?: string | null;
	quoteFr?: string | null;
	/** JSON lists of strings. */
	specializationsEn?: string | null;
	specializationsFr?: string | null;
}

export type TalentEnglish = { roleEn: string; bioEn: string; quoteEn: string | null; specializationsEn: string | null };

/** Blank, or an empty JSON list, counts as nothing. */
const norm = (value: string | null | undefined) => (value?.trim() && value.trim() !== '[]' ? value : null);

/** Translates JSON lists of strings item by item, in one call. */
export function listTranslator(translator: Translator): Translator {
	return async (lists) => {
		const parsed = lists.map((list) => JSON.parse(list) as string[]);
		const translated = await translator(parsed.flat());
		let next = 0;
		return parsed.map((items) => JSON.stringify(items.map(() => translated[next++])));
	};
}

export async function translateTalent<F extends TalentText & { roleFr: string; bioFr: string }>(
	fields: F,
	stored: TalentText | null,
	translator: Translator | null
): Promise<EnglishResult<Omit<F, keyof TalentEnglish> & TalentEnglish>> {
	const pair = (fr: keyof TalentText, en: keyof TalentText) => ({
		fr: norm(fields[fr]),
		en: norm(fields[en]),
		storedFr: norm(stored?.[fr]),
		storedEn: norm(stored?.[en]),
	});

	const [text, lists] = await Promise.all([
		followFrench(
			[
				{ ...pair('roleFr', 'roleEn'), required: true, maxLength: 150 },
				{ ...pair('bioFr', 'bioEn'), required: true },
				pair('quoteFr', 'quoteEn'),
			],
			translator
		),
		followFrench([pair('specializationsFr', 'specializationsEn')], translator && listTranslator(translator)),
	]);

	const failed = text.translationFailed ? text : lists.translationFailed ? lists : null;
	return {
		value: {
			...fields,
			roleEn: text.value[0] ?? fields.roleFr,
			bioEn: text.value[1] ?? fields.bioFr,
			quoteEn: text.value[2],
			specializationsEn: lists.value[0],
		},
		translationFailed: failed !== null,
		error: failed?.error,
	};
}
