import { describe, it, expect } from 'vitest';
import { differsOnlyByHash, tabIndexFromHash } from '../../../src/lib/utils/editor-tab';

/**
 * Issue 011 — the open editor tab kept in the page address: the hash
 * names the tab, an unknown or missing hash opens Essentiel, and a move
 * that changes nothing but the hash is not a page change, so the leave
 * guard never asks about one.
 */

// The Event editor's tabs, as EventEditor lists them (a new Event has
// only the first eight; the last is operational).
const TABS = [
	'essentiel',
	'lieu',
	'dates-seances',
	'tarifs',
	'programme',
	'visuels',
	'pratique',
	'portfolio',
	'team',
].map((id) => ({ id }));

describe('tabIndexFromHash', () => {
	it('opens the tab the hash names', () => {
		expect(tabIndexFromHash('#tarifs', TABS)).toBe(3);
		expect(tabIndexFromHash('#team', TABS)).toBe(8);
	});

	it('falls back to Essentiel on a missing hash', () => {
		expect(tabIndexFromHash('', TABS)).toBe(0);
		expect(tabIndexFromHash('#', TABS)).toBe(0);
	});

	it('falls back to Essentiel on an unknown hash', () => {
		expect(tabIndexFromHash('#inconnu', TABS)).toBe(0);
	});

	it('falls back to Essentiel on a tab this editor does not hold', () => {
		// An operational tab, on a new Event.
		const newEventTabs = TABS.filter((tab) => tab.id !== 'team');
		expect(tabIndexFromHash('#team', newEventTabs)).toBe(0);
	});
});

describe('differsOnlyByHash', () => {
	const editor = new URL('https://germinal.test/admin/events/123');

	it('a hash-only move is not a page change', () => {
		expect(differsOnlyByHash(editor, new URL('https://germinal.test/admin/events/123#tarifs'))).toBe(true);
	});

	it('dropping the hash is not a page change either', () => {
		expect(differsOnlyByHash(new URL('https://germinal.test/admin/events/123#tarifs'), editor)).toBe(true);
	});

	it('the same address is not a page change', () => {
		expect(differsOnlyByHash(editor, new URL(editor.href))).toBe(true);
	});

	it('another page is a page change', () => {
		expect(differsOnlyByHash(editor, new URL('https://germinal.test/admin/events'))).toBe(false);
	});

	it('another query is a page change', () => {
		expect(differsOnlyByHash(editor, new URL('https://germinal.test/admin/events/123?onglet=tarifs'))).toBe(false);
	});

	it('without both addresses there is nothing to compare', () => {
		expect(differsOnlyByHash(null, new URL('https://germinal.test/admin/events/123#tarifs'))).toBe(false);
		expect(differsOnlyByHash(editor, null)).toBe(false);
	});
});
