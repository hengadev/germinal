import { describe, it, expect, vi } from 'vitest';
import { createDeepLTranslator, deeplEndpoint, TranslationError } from '../../../src/lib/server/services/translator';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('deeplEndpoint', () => {
	it('sends a Free key (":fx") to the Free API', () => {
		expect(deeplEndpoint('abc:fx')).toBe('https://api-free.deepl.com/v2/translate');
		expect(deeplEndpoint('abc')).toBe('https://api.deepl.com/v2/translate');
	});
});

describe('createDeepLTranslator', () => {
	it('asks DeepL for French to English, all texts in one request', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ translations: [{ text: 'Dinner' }, { text: 'An evening' }] }));
		const translate = createDeepLTranslator('key:fx', fetchFn);

		expect(await translate(['Dîner', 'Un soir'])).toEqual(['Dinner', 'An evening']);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://api-free.deepl.com/v2/translate');
		expect((init?.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key key:fx');
		expect(JSON.parse(init?.body as string)).toMatchObject({ text: ['Dîner', 'Un soir'], source_lang: 'FR', target_lang: 'EN-GB' });
	});

	it('makes no request for nothing to translate', async () => {
		const fetchFn = vi.fn<typeof fetch>();
		expect(await createDeepLTranslator('key', fetchFn)([])).toEqual([]);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('fails on an error status, a network error or a short answer', async () => {
		await expect(createDeepLTranslator('key', async () => jsonResponse({}, 456))(['a'])).rejects.toBeInstanceOf(TranslationError);
		await expect(
			createDeepLTranslator('key', async () => {
				throw new TypeError('fetch failed');
			})(['a'])
		).rejects.toBeInstanceOf(TranslationError);
		await expect(
			createDeepLTranslator('key', async () => jsonResponse({ translations: [{ text: 'A' }] }))(['a', 'b'])
		).rejects.toBeInstanceOf(TranslationError);
	});
});
