/**
 * How DeepL must translate Germinal's own words (French → English), so the
 * generated English always uses the same terms (CONTEXT.md). Entries are
 * matched as written; give plurals their own line. A proper noun that must
 * stay as it is (a venue, a programme) maps to itself.
 *
 * Changing this list creates a new glossary on DeepL at the next
 * translation; the previous one is deleted.
 */
export const TRANSLATION_GLOSSARY: readonly (readonly [fr: string, en: string])[] = [
	['séance', 'seating'],
	['séances', 'seatings'],
	['Séance', 'Seating'],
	['Séances', 'Seatings'],
	['convive', 'guest'],
	['convives', 'guests'],
	['commissaire', 'curator'],
	['commissaire d’exposition', 'curator'],
	['acompte', 'deposit'],
	['menu dégustation', 'tasting menu'],
	['Germinal', 'Germinal'],
];
