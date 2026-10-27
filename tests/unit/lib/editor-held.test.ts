// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	modifiedTabs,
	modifiedTabsLabel,
	quoteList,
	saveAllReport,
	saveAllToast,
	tabOfUnit,
} from '$lib/utils/editor-held';

const TABS = [
	{ id: 'essentiel', title: 'Essentiel' },
	{ id: 'lieu', title: 'Lieu' },
	{ id: 'dates-seances', title: 'Dates & séances' },
	{ id: 'tarifs', title: 'Menus & tarifs' },
	{ id: 'portfolio', title: 'Portfolio' },
];

describe('tabOfUnit', () => {
	it('a unit is its tab, or the tab before the colon', () => {
		expect(tabOfUnit('lieu')).toBe('lieu');
		expect(tabOfUnit('portfolio:recap')).toBe('portfolio');
	});
});

describe('modifiedTabs', () => {
	it('lists the tabs holding unsaved changes, in the editor order', () => {
		const units = { tarifs: 'dirty', essentiel: 'failed', lieu: 'clean', 'dates-seances': 'saved' } as const;
		expect(modifiedTabs(units, TABS).map((tab) => tab.id)).toEqual(['essentiel', 'tarifs']);
	});

	it('counts a tab with several modified forms once', () => {
		const units = { 'portfolio:recap': 'dirty', 'portfolio:event-photos': 'invalid' } as const;
		expect(modifiedTabs(units, TABS)).toEqual([{ id: 'portfolio', title: 'Portfolio' }]);
	});

	it('counts a tab being saved as still modified', () => {
		expect(modifiedTabs({ lieu: 'saving' }, TABS).map((tab) => tab.id)).toEqual(['lieu']);
	});

	it('is empty when nothing is held', () => {
		expect(modifiedTabs({ lieu: 'clean', essentiel: 'saved' }, TABS)).toEqual([]);
	});
});

describe('modifiedTabsLabel', () => {
	it('agrees with the count', () => {
		expect(modifiedTabsLabel(1)).toBe('1 onglet modifié');
		expect(modifiedTabsLabel(3)).toBe('3 onglets modifiés');
	});
});

describe('quoteList', () => {
	it('quotes and joins titles the French way', () => {
		expect(quoteList([])).toBe('');
		expect(quoteList(['Lieu'])).toBe('« Lieu »');
		expect(quoteList(['Lieu', 'Visuels'])).toBe('« Lieu » et « Visuels »');
		expect(quoteList(['A', 'B', 'C'])).toBe('« A », « B » et « C »');
	});
});

describe('saveAllReport', () => {
	it('splits saved and unsaved tabs, in the editor order, keeping the reasons', () => {
		const report = saveAllReport(
			[
				{ id: 'essentiel', outcome: { ok: true } },
				{ id: 'dates-seances', outcome: { ok: false, reason: 'invalid', message: 'Une séance chevauche la suivante.' } },
				{ id: 'tarifs', outcome: { ok: true } },
			],
			TABS
		);
		expect(report.saved.map((tab) => tab.id)).toEqual(['essentiel', 'tarifs']);
		expect(report.unsaved).toEqual([
			{ id: 'dates-seances', title: 'Dates & séances', message: 'Une séance chevauche la suivante.' },
		]);
	});

	it('a tab is saved only if every form of it is', () => {
		const report = saveAllReport(
			[
				{ id: 'portfolio:recap', outcome: { ok: true } },
				{ id: 'portfolio:event-photos', outcome: { ok: false, reason: 'failed' } },
			],
			TABS
		);
		expect(report.saved).toEqual([]);
		expect(report.unsaved).toEqual([{ id: 'portfolio', title: 'Portfolio' }]);
	});

	it('a unit not sent counts as not saved', () => {
		const report = saveAllReport([{ id: 'lieu', outcome: { ok: false, reason: 'cancelled' } }], TABS);
		expect(report.unsaved.map((tab) => tab.id)).toEqual(['lieu']);
	});
});

describe('saveAllToast', () => {
	it('one success when every tab saved', () => {
		const toast = saveAllToast({ saved: [TABS[0], TABS[1]], unsaved: [] });
		expect(toast.level).toBe('success');
	});

	it('one error naming the tabs not saved, and those that were', () => {
		const toast = saveAllToast({ saved: [TABS[0]], unsaved: [TABS[2], TABS[3]] });
		expect(toast.level).toBe('error');
		expect(toast.message).toBe(
			'Non enregistré : « Dates & séances » et « Menus & tarifs ». Leurs modifications sont conservées. Enregistré : « Essentiel ».'
		);
	});

	it('speaks of one tab in the singular', () => {
		expect(saveAllToast({ saved: [], unsaved: [TABS[1]] }).message).toBe(
			'Non enregistré : « Lieu ». Ses modifications sont conservées.'
		);
	});
});
