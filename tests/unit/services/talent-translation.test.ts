import { describe, it, expect, vi } from 'vitest';
import { listTranslator, translateTalent } from '../../../src/lib/server/services/talent-translation';
import type { Translator } from '../../../src/lib/server/services/translator';

function fakeTranslator() {
	return vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
}

const french = { roleFr: 'Cheffe', bioFr: 'Née à Lyon.', quoteFr: null, specializationsFr: null };

describe('translateTalent', () => {
	it('translates a new Talent’s role, bio, quote and each specialisation', async () => {
		const translator = fakeTranslator();
		const { value } = await translateTalent(
			{ ...french, quoteFr: 'Cuisiner, c’est écouter.', specializationsFr: '["Pâtisserie","Fermentation"]' },
			null,
			translator
		);
		expect(value).toMatchObject({
			roleEn: 'EN(Cheffe)',
			bioEn: 'EN(Née à Lyon.)',
			quoteEn: 'EN(Cuisiner, c’est écouter.)',
			specializationsEn: '["EN(Pâtisserie)","EN(Fermentation)"]',
		});
	});

	it('keeps English edited in the same save', async () => {
		const { value } = await translateTalent(
			{ ...french, roleFr: 'Cheffe pâtissière', roleEn: 'Pastry chef', bioEn: 'Born in Lyon.' },
			{ roleFr: 'Cheffe', roleEn: 'Chef', bioFr: 'Née à Lyon.', bioEn: 'Born in Lyon.' },
			fakeTranslator()
		);
		expect(value.roleEn).toBe('Pastry chef');
		expect(value.bioEn).toBe('Born in Lyon.');
	});

	it('gives the role and bio the French when there is no translator', async () => {
		const { value } = await translateTalent(french, null, null);
		expect(value).toMatchObject({ roleEn: 'Cheffe', bioEn: 'Née à Lyon.', quoteEn: null, specializationsEn: null });
	});

	it('treats an empty specialisations list as nothing', async () => {
		const translator = fakeTranslator();
		const { value } = await translateTalent({ ...french, specializationsFr: '[]', roleEn: 'Chef', bioEn: 'Born.' }, null, translator);
		expect(value.specializationsEn).toBeNull();
	});
});

describe('listTranslator', () => {
	it('translates every item of every list in one call', async () => {
		const translator = fakeTranslator();
		expect(await listTranslator(translator)(['["a","b"]', '["c"]'])).toEqual(['["EN(a)","EN(b)"]', '["EN(c)"]']);
		expect(translator).toHaveBeenCalledTimes(1);
	});
});
