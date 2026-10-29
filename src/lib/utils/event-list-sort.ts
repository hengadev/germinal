/**
 * How the admin Events list is ordered, kept in the URL (`?sort=`). The
 * default, « Dernière modification », brings back the Drafts being built.
 */
import { adminEventTitle } from './event-text';

export const EVENT_LIST_SORTS = [
	{ value: 'modified', label: 'Dernière modification' },
	{ value: 'date', label: 'Date de l’événement' },
	{ value: 'created', label: 'Date de création' },
	{ value: 'title', label: 'Titre' },
] as const;

export type EventListSort = (typeof EVENT_LIST_SORTS)[number]['value'];

export const DEFAULT_EVENT_LIST_SORT: EventListSort = 'modified';

export function parseEventListSort(value: string | null): EventListSort {
	return EVENT_LIST_SORTS.find((sort) => sort.value === value)?.value ?? DEFAULT_EVENT_LIST_SORT;
}

interface SortableEvent {
	titleEn?: string | null;
	titleFr?: string | null;
	startDate?: Date | string | null;
	createdAt?: Date | string | null;
	updatedAt?: Date | string | null;
}

const time = (date: Date | string | null | undefined) => (date ? new Date(date).getTime() : null);

/** Latest first; an Event without the date (a Draft with no Day) goes last. */
function latestFirst(a: Date | string | null | undefined, b: Date | string | null | undefined): number {
	const [ta, tb] = [time(a), time(b)];
	if (ta === null || tb === null) return ta === tb ? 0 : ta === null ? 1 : -1;
	return tb - ta;
}

/** A sorted copy of the list. */
export function sortEventList<T extends SortableEvent>(events: readonly T[], sort: EventListSort): T[] {
	const compare: (a: T, b: T) => number =
		sort === 'title'
			? (a, b) => adminEventTitle(a).localeCompare(adminEventTitle(b), 'fr', { sensitivity: 'base' })
			: sort === 'date'
				? (a, b) => latestFirst(a.startDate, b.startDate)
				: sort === 'created'
					? (a, b) => latestFirst(a.createdAt, b.createdAt)
					: (a, b) => latestFirst(a.updatedAt, b.updatedAt);
	return [...events].sort(compare);
}
