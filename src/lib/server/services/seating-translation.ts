import type { EditorService } from '$lib/types/seatings-editor';
import { followFrench, type EnglishResult, type FrenchEnglishPair } from './event-translation';
import type { ParsedServiceSeatings } from './event-schedule';
import type { Translator } from './translator';

/**
 * The English of « Dates & séances » — each Seating's optional title and
 * description — generated from the French on save, by the same rule as the
 * Event's fields (event-translation.ts).
 */

export async function translateSeatings(
	services: ParsedServiceSeatings[],
	stored: readonly EditorService[] | null,
	translator: Translator | null
): Promise<EnglishResult<ParsedServiceSeatings[]>> {
	const saved = new Map((stored ?? []).flatMap((service) => service.seatings.map((s) => [s.id, s] as const)));

	const pairs: FrenchEnglishPair[] = [];
	for (const service of services) {
		for (const { seating } of service.seatings) {
			const before = seating.id ? saved.get(seating.id) : undefined;
			pairs.push(
				{
					fr: seating.titleFr,
					en: seating.titleEn,
					storedFr: before?.titleFr ?? null,
					storedEn: before?.titleEn ?? null,
					maxLength: 255,
				},
				{
					fr: seating.descriptionFr,
					en: seating.descriptionEn,
					storedFr: before?.descriptionFr ?? null,
					storedEn: before?.descriptionEn ?? null,
				}
			);
		}
	}

	const english = await followFrench(pairs, translator);
	let next = 0;
	const value = services.map((service) => ({
		...service,
		seatings: service.seatings.map((parsed) => ({
			...parsed,
			seating: { ...parsed.seating, titleEn: english.value[next++], descriptionEn: english.value[next++] },
		})),
	}));
	return { ...english, value };
}
