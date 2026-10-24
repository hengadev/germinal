import { describe, it, expect, vi } from 'vitest';
import {
	createDeepLTranslator,
	deeplBaseUrl,
	glossaryName,
	TranslationError,
	type Glossary,
} from '../../../src/lib/server/services/translator';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A DeepL stand-in: answers by path, and records every request. */
function fakeDeepL(handlers: Record<string, (init?: RequestInit) => Response>) {
	return vi.fn<typeof fetch>(async (url, init) => {
		const path = String(url).replace(/^https:\/\/api(-free)?\.deepl\.com\/v2/, '');
		const key = `${init?.method ?? 'GET'} ${path}`;
		const handler = handlers[key] ?? handlers[key.replace(/\/glossaries\/[^/]+$/, '/glossaries/:id')];
		if (!handler) throw new Error(`unexpected ${key}`);
		return handler(init);
	});
}

const translated = (...texts: string[]) => () => jsonResponse({ translations: texts.map((text) => ({ text })) });
const bodyOf = (init?: RequestInit) => JSON.parse(init?.body as string);

describe('deeplBaseUrl', () => {
	it('sends a Free key (":fx") to the Free API', () => {
		expect(deeplBaseUrl('abc:fx')).toBe('https://api-free.deepl.com/v2');
		expect(deeplBaseUrl('abc')).toBe('https://api.deepl.com/v2');
	});
});

describe('createDeepLTranslator', () => {
	it('asks DeepL for French to English, all texts in one request', async () => {
		const fetchFn = fakeDeepL({ 'POST /translate': translated('Dinner', 'An evening') });
		const translate = createDeepLTranslator('key:fx', fetchFn, []);

		expect(await translate(['Dîner', 'Un soir'])).toEqual(['Dinner', 'An evening']);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://api-free.deepl.com/v2/translate');
		expect((init?.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key key:fx');
		expect(bodyOf(init)).toMatchObject({ text: ['Dîner', 'Un soir'], source_lang: 'FR', target_lang: 'EN-GB' });
		expect(bodyOf(init)).not.toHaveProperty('glossary_id');
	});

	it('makes no request for nothing to translate', async () => {
		const fetchFn = vi.fn<typeof fetch>();
		expect(await createDeepLTranslator('key', fetchFn, [])([])).toEqual([]);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('fails on an error status, a network error or a short answer', async () => {
		await expect(createDeepLTranslator('key', async () => jsonResponse({}, 456), [])(['a'])).rejects.toBeInstanceOf(
			TranslationError
		);
		await expect(
			createDeepLTranslator('key', async () => {
				throw new TypeError('fetch failed');
			}, [])(['a'])
		).rejects.toBeInstanceOf(TranslationError);
		await expect(
			createDeepLTranslator('key', async () => jsonResponse({ translations: [{ text: 'A' }] }), [])(['a', 'b'])
		).rejects.toBeInstanceOf(TranslationError);
	});
});

describe('createDeepLTranslator — glossary', () => {
	const glossary: Glossary = [['séance', 'seating']];

	it('creates the glossary once, then translates with it', async () => {
		const fetchFn = fakeDeepL({
			'GET /glossaries': () => jsonResponse({ glossaries: [] }),
			'POST /glossaries': () => jsonResponse({ glossary_id: 'g-1' }),
			'POST /translate': translated('Seating'),
		});
		const translate = createDeepLTranslator('create-key', fetchFn, glossary);

		await translate(['Séance']);
		await translate(['Séance']);

		const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).split('/v2')[1]}`);
		expect(calls).toEqual(['GET /glossaries', 'POST /glossaries', 'POST /translate', 'POST /translate']);
		const creation = bodyOf(fetchFn.mock.calls[1][1]);
		expect(creation).toMatchObject({ name: glossaryName(glossary), source_lang: 'fr', target_lang: 'en', entries: 'séance\tseating' });
		expect(bodyOf(fetchFn.mock.calls[3][1]).glossary_id).toBe('g-1');
	});

	it('reuses the glossary already on DeepL and deletes stale ones of this app', async () => {
		const deleted: string[] = [];
		const fetchFn = fakeDeepL({
			'GET /glossaries': () =>
				jsonResponse({
					glossaries: [
						{ glossary_id: 'current', name: glossaryName(glossary) },
						{ glossary_id: 'old', name: 'germinal-fr-en-000000000000' },
						{ glossary_id: 'other', name: 'someone-elses' },
					],
				}),
			'DELETE /glossaries/:id': () => {
				deleted.push('old');
				return new Response(null, { status: 204 });
			},
			'POST /translate': translated('Seating'),
		});

		await createDeepLTranslator('reuse-key', fetchFn, glossary)(['Séance']);

		expect(deleted).toEqual(['old']);
		expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/glossaries/other'))).toBe(false);
		expect(bodyOf(fetchFn.mock.calls.at(-1)?.[1]).glossary_id).toBe('current');
	});

	it('translates without the glossary when DeepL refuses it', async () => {
		const fetchFn = fakeDeepL({
			'GET /glossaries': () => jsonResponse({}, 403),
			'POST /translate': translated('Session'),
		});
		expect(await createDeepLTranslator('refused-key', fetchFn, glossary)(['Séance'])).toEqual(['Session']);
		expect(bodyOf(fetchFn.mock.calls.at(-1)?.[1])).not.toHaveProperty('glossary_id');
	});
});
