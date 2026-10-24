import { env } from '$lib/server/env';

/**
 * French → English machine translation for the admin's bilingual fields:
 * the Admin writes in French, the English is generated (DeepL API). With no
 * DEEPL_API_KEY there is no translator, and the English is left to the
 * Admin, as before.
 */

/** Translates French texts into English, in order. Throws on any failure. */
export type Translator = (texts: string[]) => Promise<string[]>;

export class TranslationError extends Error {}

const TIMEOUT_MS = 15_000;

/** DeepL Free keys end in `:fx` and have their own endpoint. */
export function deeplEndpoint(apiKey: string): string {
	return apiKey.endsWith(':fx')
		? 'https://api-free.deepl.com/v2/translate'
		: 'https://api.deepl.com/v2/translate';
}

export function createDeepLTranslator(apiKey: string, fetchFn: typeof fetch = fetch): Translator {
	const endpoint = deeplEndpoint(apiKey);
	return async (texts) => {
		if (texts.length === 0) return [];
		let response: Response;
		try {
			response = await fetchFn(endpoint, {
				method: 'POST',
				headers: {
					Authorization: `DeepL-Auth-Key ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					text: texts,
					source_lang: 'FR',
					target_lang: 'EN-GB',
					preserve_formatting: true,
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (err) {
			throw new TranslationError(`DeepL unreachable: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (!response.ok) {
			throw new TranslationError(`DeepL answered ${response.status}`);
		}
		const body = (await response.json()) as { translations?: { text: string }[] };
		const translations = body.translations?.map((t) => t.text);
		if (!translations || translations.length !== texts.length) {
			throw new TranslationError('DeepL answered with a different number of texts');
		}
		return translations;
	};
}

/** Whether the English is generated (DEEPL_API_KEY is set). */
export function isTranslationEnabled(): boolean {
	return !!env.DEEPL_API_KEY;
}

/** The configured translator, or null when DEEPL_API_KEY is unset. */
export function getTranslator(): Translator | null {
	return env.DEEPL_API_KEY ? createDeepLTranslator(env.DEEPL_API_KEY) : null;
}
