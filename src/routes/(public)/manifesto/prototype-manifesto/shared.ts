// PROTOTYPE — wipe me once a Manifesto variant is chosen.
// What the variants share: the theses, the three disciplines, and a
// photograph's caption.
import { localizedText } from '$lib/utils/event-text';
import type { ManifestoPhoto } from '../+page.server';

export type ThesisKey = 'table' | 'authors' | 'place' | 'backstage' | 'guests' | 'once';

/** The manifesto, strongest first. */
export const THESES: ThesisKey[] = ['table', 'authors', 'place', 'guests', 'backstage', 'once'];

/** The disciplines, with the anchors the home page links to. */
export const DISCIPLINES = [
	{ key: 'artDirection', anchor: 'art-direction' },
	{ key: 'scenography', anchor: 'scenography' },
	{ key: 'production', anchor: 'production' },
] as const;

export const POINTS = [1, 2, 3, 4] as const;

export function photoTitle(photo: ManifestoPhoto, locale: string | null | undefined): string {
	return localizedText(photo.titleEn, photo.titleFr, locale);
}

/** The photograph for the n-th item, cycling when there are fewer photographs. */
export function photoAt(photos: ManifestoPhoto[], n: number): ManifestoPhoto | null {
	return photos.length ? photos[n % photos.length] : null;
}
