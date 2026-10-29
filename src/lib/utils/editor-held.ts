/**
 * A published Event's held edits (ADR 0010, issue 020) — pure, no DOM.
 *
 * On a Private or Public Event the editor holds every edit until the Admin
 * confirms: a bar counts the modified tabs, a dialog names them, and a
 * save of them all is reported in one go. The save controller counts units
 * (a form each); these helpers speak in tabs, as the Admin sees them — a
 * tab with several forms (« Portfolio ») is one tab.
 */
import type { TabSaveResult, TabSaveState } from './editor-save';

/** A tab of the editor, as its labels name it. */
export interface HeldTab {
	id: string;
	title: string;
}

/** States that hold changes not yet stored. */
const UNSAVED: ReadonlySet<TabSaveState> = new Set(['dirty', 'saving', 'invalid', 'failed']);

/** The tab a unit of the save controller belongs to (`portfolio:recap`). */
export function tabOfUnit(unitId: string): string {
	return unitId.split(':')[0];
}

/** The tabs holding changes not yet stored, in the editor's order. */
export function modifiedTabs(units: Readonly<Record<string, TabSaveState>>, tabs: readonly HeldTab[]): HeldTab[] {
	const modified = new Set(
		Object.entries(units)
			.filter(([, state]) => UNSAVED.has(state))
			.map(([unitId]) => tabOfUnit(unitId))
	);
	return tabs.filter((tab) => modified.has(tab.id));
}

/** « 1 onglet modifié », « 3 onglets modifiés ». */
export function modifiedTabsLabel(count: number): string {
	return count === 1 ? '1 onglet modifié' : `${count} onglets modifiés`;
}

/** « « Lieu » », « « Lieu » et « Visuels » », « « A », « B » et « C » ». */
export function quoteList(titles: readonly string[]): string {
	const quoted = titles.map((title) => `« ${title} »`);
	if (quoted.length <= 1) return quoted.join('');
	return `${quoted.slice(0, -1).join(', ')} et ${quoted[quoted.length - 1]}`;
}

/** A tab whose save did not go through, and why when known. */
export interface UnsavedTab extends HeldTab {
	message?: string;
}

export interface SaveAllReport {
	/** Tabs whose every unit saved. */
	saved: HeldTab[];
	/** Tabs with a unit that did not save; their edits are kept. */
	unsaved: UnsavedTab[];
}

/**
 * What a save of every held tab did, per tab, in the editor's order: a tab
 * is saved only if each of its units is. A unit not sent (`cancelled`)
 * counts as not saved, without a message.
 */
export function saveAllReport(results: readonly TabSaveResult[], tabs: readonly HeldTab[]): SaveAllReport {
	const outcomes = new Map<string, { ok: boolean; messages: string[] }>();
	for (const { id, outcome } of results) {
		const tabId = tabOfUnit(id);
		const entry = outcomes.get(tabId) ?? { ok: true, messages: [] };
		if (!outcome.ok) {
			entry.ok = false;
			if (outcome.message) entry.messages.push(outcome.message);
		}
		outcomes.set(tabId, entry);
	}
	const saved: HeldTab[] = [];
	const unsaved: UnsavedTab[] = [];
	for (const tab of tabs) {
		const entry = outcomes.get(tab.id);
		if (!entry) continue;
		if (entry.ok) saved.push(tab);
		else unsaved.push(entry.messages.length > 0 ? { ...tab, message: entry.messages.join(' ') } : { ...tab });
	}
	return { saved, unsaved };
}

/** The one toast reporting a save of every held tab. */
export function saveAllToast(report: SaveAllReport): { level: 'success' | 'error'; title: string; message: string } {
	if (report.unsaved.length === 0) {
		return { level: 'success', title: 'Succès', message: 'Modifications enregistrées et visibles en ligne.' };
	}
	const which = quoteList(report.unsaved.map((tab) => tab.title));
	const kept = report.unsaved.length === 1 ? 'Ses modifications sont conservées.' : 'Leurs modifications sont conservées.';
	const savedToo = report.saved.length > 0 ? ` Enregistré : ${quoteList(report.saved.map((tab) => tab.title))}.` : '';
	return { level: 'error', title: 'Erreur', message: `Non enregistré : ${which}. ${kept}${savedToo}` };
}
