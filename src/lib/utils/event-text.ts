/**
 * An Event's texts may be missing (ADR 0008, issue 036): a Draft is saved
 * with nothing required, and publishing is never refused. These helpers keep
 * every page rendering whatever is missing.
 */

/** Shown in the admin for an Event without a title. */
export const UNTITLED_EVENT = 'Sans titre';

/**
 * A bilingual text in the visitor's language, falling back to the other
 * language, then to an empty string.
 */
export function localizedText(
	en: string | null | undefined,
	fr: string | null | undefined,
	locale: string | null | undefined
): string {
	const [preferred, other] = locale === 'fr' ? [fr, en] : [en, fr];
	return (preferred?.trim() ? preferred : other?.trim() ? other : '') ?? '';
}

/** The admin's name for an Event: its title, or « Sans titre ». */
export function adminEventTitle(event: { titleEn?: string | null; titleFr?: string | null }): string {
	return event.titleEn?.trim() || event.titleFr?.trim() || UNTITLED_EVENT;
}
