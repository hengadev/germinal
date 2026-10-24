import { describe, it, expect, vi } from 'vitest';
import { fillEnglish } from '../../../src/lib/server/services/event-translation';
import type { Translator } from '../../../src/lib/server/services/translator';

/** Translates by tagging each text, and remembers what it was asked. */
function fakeTranslator() {
	return vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
}

describe('fillEnglish', () => {
	it('translates the French of a new Event, in one call', async () => {
		const translator = fakeTranslator();
		const { fields } = await fillEnglish(
			{ titleFr: 'Dîner', titleEn: null, descriptionFr: 'Un soir', descriptionEn: null },
			{},
			translator
		);
		expect(fields).toEqual({ titleFr: 'Dîner', titleEn: 'EN(Dîner)', descriptionFr: 'Un soir', descriptionEn: 'EN(Un soir)' });
		expect(translator).toHaveBeenCalledTimes(1);
	});

	it('copies proper nouns and addresses instead of translating them', async () => {
		const translator = fakeTranslator();
		const { fields } = await fillEnglish(
			{ venueNameFr: 'Maison Lenoir', venueNameEn: null, streetAddressFr: '12 rue de Rivoli', streetAddressEn: null },
			{},
			translator
		);
		expect(fields.venueNameEn).toBe('Maison Lenoir');
		expect(fields.streetAddressEn).toBe('12 rue de Rivoli');
		expect(translator).not.toHaveBeenCalled();
	});

	it('re-translates when the French changed and the English was left as saved', async () => {
		const { fields } = await fillEnglish(
			{ titleFr: 'Déjeuner', titleEn: 'Dinner' },
			{ titleFr: 'Dîner', titleEn: 'Dinner' },
			fakeTranslator()
		);
		expect(fields.titleEn).toBe('EN(Déjeuner)');
	});

	it('keeps English the Admin edited in the same save', async () => {
		const translator = fakeTranslator();
		const { fields } = await fillEnglish(
			{ titleFr: 'Déjeuner', titleEn: 'Lunch at the Maison' },
			{ titleFr: 'Dîner', titleEn: 'Dinner' },
			translator
		);
		expect(fields.titleEn).toBe('Lunch at the Maison');
		expect(translator).not.toHaveBeenCalled();
	});

	it('leaves the English alone when the French did not change', async () => {
		const translator = fakeTranslator();
		const { fields } = await fillEnglish(
			{ titleFr: 'Dîner', titleEn: 'A corrected dinner' },
			{ titleFr: 'Dîner', titleEn: 'A corrected dinner' },
			translator
		);
		expect(fields.titleEn).toBe('A corrected dinner');
		expect(translator).not.toHaveBeenCalled();
	});

	it('fills English still missing even when the French did not change', async () => {
		const { fields } = await fillEnglish({ titleFr: 'Dîner', titleEn: null }, { titleFr: 'Dîner', titleEn: null }, fakeTranslator());
		expect(fields.titleEn).toBe('EN(Dîner)');
	});

	it('clears the English when the French is cleared', async () => {
		const { fields } = await fillEnglish(
			{ subtitleFr: null, subtitleEn: 'A tagline' },
			{ subtitleFr: 'Une accroche', subtitleEn: 'A tagline' },
			fakeTranslator()
		);
		expect(fields.subtitleEn).toBeNull();
	});

	it('never touches pairs the tab does not post', async () => {
		const { fields } = await fillEnglish({ titleFr: 'Dîner' }, { recapFr: 'Récap', recapEn: null }, fakeTranslator());
		expect('recapEn' in fields).toBe(false);
	});

	it('keeps the English as posted when no translator is configured', async () => {
		const { fields, translationFailed } = await fillEnglish({ titleFr: 'Dîner', titleEn: null }, {}, null);
		expect(fields.titleEn).toBeNull();
		expect(translationFailed).toBe(false);
	});

	it('blanks the English it could not translate, so the next save retries', async () => {
		const failing = vi.fn<Translator>(async () => {
			throw new Error('down');
		});
		const result = await fillEnglish(
			{ titleFr: 'Déjeuner', titleEn: 'Dinner', venueNameFr: 'Maison', venueNameEn: null },
			{ titleFr: 'Dîner', titleEn: 'Dinner' },
			failing
		);
		expect(result.translationFailed).toBe(true);
		expect(result.fields.titleEn).toBeNull();
		expect(result.fields.venueNameEn).toBe('Maison');
	});
});
