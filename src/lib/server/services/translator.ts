import { createHash } from 'node:crypto';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { TRANSLATION_GLOSSARY } from './translation-glossary';

/**
 * French → English machine translation for the admin's bilingual fields:
 * the Admin writes in French, the English is generated (DeepL API). With no
 * DEEPL_API_KEY there is no translator, and the English is left to the
 * Admin, as before. Germinal's own words go through a DeepL glossary
 * (translation-glossary.ts).
 */

/** Translates French texts into English, in order. Throws on any failure. */
export type Translator = (texts: string[]) => Promise<string[]>;

export type Glossary = readonly (readonly [fr: string, en: string])[];

export class TranslationError extends Error {}

const TIMEOUT_MS = 15_000;

/** Prefix of the glossaries this app owns on the DeepL account. */
const GLOSSARY_PREFIX = 'germinal-fr-en-';

/** DeepL Free keys end in `:fx` and have their own host. */
export function deeplBaseUrl(apiKey: string): string {
	return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2';
}

/** The glossary's name on DeepL: its content's hash, so a change makes a new one. */
export function glossaryName(glossary: Glossary): string {
	const tsv = glossary.map(([fr, en]) => `${fr}\t${en}`).join('\n');
	return GLOSSARY_PREFIX + createHash('sha256').update(tsv).digest('hex').slice(0, 12);
}

/** Glossary ids by API key and glossary name, for the life of the process. */
const glossaryIds = new Map<string, Promise<string | null>>();

export function createDeepLTranslator(
	apiKey: string,
	fetchFn: typeof fetch = fetch,
	glossary: Glossary = TRANSLATION_GLOSSARY
): Translator {
	const base = deeplBaseUrl(apiKey);
	const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
		try {
			return await fetchFn(base + path, {
				...init,
				headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (err) {
			throw new TranslationError(`DeepL unreachable: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	/** The current glossary's id, created on first use; stale ones of this
	 * app are deleted. Null (translate without it) when DeepL refuses. */
	async function ensureGlossary(): Promise<string | null> {
		if (glossary.length === 0) return null;
		const name = glossaryName(glossary);
		const response = await call('/glossaries');
		if (!response.ok) throw new TranslationError(`DeepL glossaries answered ${response.status}`);
		const { glossaries = [] } = (await response.json()) as { glossaries?: { glossary_id: string; name: string }[] };

		for (const stale of glossaries.filter((g) => g.name.startsWith(GLOSSARY_PREFIX) && g.name !== name)) {
			await call(`/glossaries/${stale.glossary_id}`, { method: 'DELETE' });
		}
		const existing = glossaries.find((g) => g.name === name);
		if (existing) return existing.glossary_id;

		const created = await call('/glossaries', {
			method: 'POST',
			body: JSON.stringify({
				name,
				source_lang: 'fr',
				target_lang: 'en',
				entries: glossary.map(([fr, en]) => `${fr}\t${en}`).join('\n'),
				entries_format: 'tsv',
			}),
		});
		if (!created.ok) throw new TranslationError(`DeepL glossary creation answered ${created.status}`);
		return ((await created.json()) as { glossary_id: string }).glossary_id;
	}

	function glossaryId(): Promise<string | null> {
		const key = `${apiKey}:${glossaryName(glossary)}`;
		let id = glossaryIds.get(key);
		if (!id) {
			id = ensureGlossary().catch((err) => {
				logger.warn({ err }, 'DeepL glossary unavailable: translating without it');
				glossaryIds.delete(key);
				return null;
			});
			glossaryIds.set(key, id);
		}
		return id;
	}

	return async (texts) => {
		if (texts.length === 0) return [];
		const glossary_id = await glossaryId();
		const response = await call('/translate', {
			method: 'POST',
			body: JSON.stringify({
				text: texts,
				source_lang: 'FR',
				target_lang: 'EN-GB',
				preserve_formatting: true,
				...(glossary_id ? { glossary_id } : {}),
			}),
		});
		if (!response.ok) {
			// The glossary may have been deleted on DeepL: look it up again next time.
			if (glossary_id) glossaryIds.delete(`${apiKey}:${glossaryName(glossary)}`);
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
