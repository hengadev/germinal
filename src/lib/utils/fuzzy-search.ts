/**
 * Search-as-you-type over a list already on the page (the admin's Events
 * and Talents). Forgiving: accents, case and punctuation are ignored, the
 * words typed may come in any order, and each may be the start of a word,
 * inside one, its letters in order (« chf » finds « chef »), or one typo
 * away. An item matches when every word typed does; the closest matches
 * come first, the list's own order otherwise.
 */

/** How closely a typed word matches, best first. */
const EXACT_START = 3;
const INSIDE = 2;
const LOOSE = 1;

/** Lowercase, without accents, words separated by single spaces. */
export function normalizeSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
		.trim();
}

/** The typed words, normalized; none for a blank query. */
export function searchTerms(query: string): string[] {
	const normalized = normalizeSearch(query);
	return normalized ? normalized.split(' ') : [];
}

/** True when `term`'s letters appear in `word` in order, starting with its first. */
function inOrder(term: string, word: string): boolean {
	if (term[0] !== word[0]) return false;
	let i = 1;
	for (let j = 1; j < word.length && i < term.length; j++) if (word[j] === term[i]) i++;
	return i === term.length;
}

/** True when `a` and `b` are at most one typo apart: a letter added,
 * dropped, changed, or two neighbours swapped. */
function oneEditApart(a: string, b: string): boolean {
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	let j = 0;
	let edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++edits > 1) return false;
		if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
			i += 2;
			j += 2;
		} else if (a.length > b.length) i++;
		else if (b.length > a.length) j++;
		else {
			i++;
			j++;
		}
	}
	return edits + (a.length - i) + (b.length - j) <= 1;
}

/** How closely one typed word matches the text's words; 0 when it doesn't. */
function termScore(term: string, text: string, words: string[]): number {
	if (words.some((word) => word.startsWith(term))) return EXACT_START;
	if (text.includes(term)) return INSIDE;
	if (term.length < 3) return 0;
	const loose = words.some(
		(word) =>
			inOrder(term, word) ||
			(term.length >= 4 && [term.length - 1, term.length, term.length + 1].some((n) => oneEditApart(term, word.slice(0, n))))
	);
	return loose ? LOOSE : 0;
}

/** How closely `fields` match the typed words: the weakest word's score,
 * 0 when one doesn't match. */
export function searchScore(terms: readonly string[], fields: readonly (string | null | undefined)[]): number {
	const text = normalizeSearch(fields.filter(Boolean).join(' '));
	const words = text.split(' ');
	let score = EXACT_START;
	for (const term of terms) {
		score = Math.min(score, termScore(term, text, words));
		if (score === 0) return 0;
	}
	return score;
}

/** The `items` matching `query`, closest first, in their order otherwise;
 * all of them for a blank query. */
export function fuzzyFilter<T>(items: readonly T[], query: string, fields: (item: T) => (string | null | undefined)[]): T[] {
	const terms = searchTerms(query);
	if (terms.length === 0) return [...items];
	return items
		.map((item) => ({ item, score: searchScore(terms, fields(item)) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)
		.map(({ item }) => item);
}
