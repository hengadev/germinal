import { localizedText } from './event-text';

/**
 * Alt text on images (issue 043) — pure, no database.
 *
 * Every uploaded image may carry an alt text in English and in French.
 * Public pages render it in the visitor's language, falling back to the
 * other language, then to a name the page knows (the Event title, the
 * Talent's name).
 */

/** What an image carries for alt text (a media row, or a subset of it). */
export interface MediaAltText {
	altEn?: string | null;
	altFr?: string | null;
}

/**
 * The alt text of an image in the visitor's language: the other language
 * when that one is missing, then `fallback` (the Event title, the Talent's
 * name), then an empty string.
 */
export function mediaAlt(
	medium: MediaAltText | null | undefined,
	locale: string | null | undefined,
	fallback?: string | null
): string {
	return localizedText(medium?.altEn, medium?.altFr, locale) || fallback?.trim() || '';
}

/** Whether an image lacks alt text in English or in French. */
export function lacksAltText(medium: MediaAltText): boolean {
	return !medium.altEn?.trim() || !medium.altFr?.trim();
}

/** Longest alt text accepted, per language. */
export const MAX_ALT_TEXT_LENGTH = 500;

/**
 * Reads the alt texts an Admin typed: trimmed, blank as null. Returns an
 * error (French admin copy) when one is too long. A language left out of
 * `input` is left out of the result, so a caller updates only what it got.
 */
export function parseAltText(input: {
	altEn?: unknown;
	altFr?: unknown;
}): { ok: true; value: { altEn?: string | null; altFr?: string | null } } | { ok: false; error: string } {
	const value: { altEn?: string | null; altFr?: string | null } = {};
	for (const key of ['altEn', 'altFr'] as const) {
		const raw = input[key];
		if (raw === undefined) continue;
		if (raw !== null && typeof raw !== 'string') {
			return { ok: false, error: 'Texte alternatif invalide.' };
		}
		const text = raw?.trim() ?? '';
		if (text.length > MAX_ALT_TEXT_LENGTH) {
			return {
				ok: false,
				error: `Texte alternatif trop long (${MAX_ALT_TEXT_LENGTH} caractères maximum).`,
			};
		}
		value[key] = text === '' ? null : text;
	}
	return { ok: true, value };
}
