/**
 * The Event editor's open tab, kept in the page address (issue 011,
 * ADR 0010): the address hash names the tab, '#tarifs' opening « Menus &
 * tarifs ».
 *
 * The admin layout mounts the editor twice (mobile and desktop), so the
 * hash is shared module state: one address bar, one open tab, both
 * instances in step. It is read from the address when the editor opens,
 * when the page under it changes (the duplicate flow loads another
 * Event's editor over this one) and whenever the hash changes from
 * outside (the address bar, a link); opening a tab writes it, through
 * SvelteKit's replaceState so no history entry is added. Client only —
 * every write happens from an effect or an event handler.
 */
export const openTab = $state({ hash: '' });

/** Follow the address hash into the shared state. */
export function readOpenTabFromAddress(): void {
	openTab.hash = location.hash;
}
