/**
 * The Event editor's open tab in the page address (issue 011, ADR 0010).
 *
 * The tab lives in the URL hash — '#tarifs' — so that reloading or coming
 * back from a link lands the Admin on the tab they left. Only the hash
 * ever changes: opening a tab replaces it without a navigation and
 * without a history entry, and a move that changes nothing but the hash
 * is not a page change — the leave guard lets it through.
 */

/**
 * The index of the tab the address `hash` opens. An unknown or missing
 * hash opens the first tab (Essentiel); so does a tab this editor does
 * not hold, such as an operational tab on a new Event.
 */
export function tabIndexFromHash(hash: string, tabs: readonly { id: string }[]): number {
	const id = hash.replace(/^#/, '');
	const index = tabs.findIndex((tab) => tab.id === id);
	return index === -1 ? 0 : index;
}

/**
 * Whether moving from `from` to `to` changes nothing but the hash — the
 * open tab moving in the address, not a page change. Without both
 * addresses there is nothing to compare, and the move is treated as a
 * page change.
 */
export function differsOnlyByHash(
	from: URL | null | undefined,
	to: URL | null | undefined
): boolean {
	if (!from || !to) return false;
	return from.href.split('#')[0] === to.href.split('#')[0];
}
