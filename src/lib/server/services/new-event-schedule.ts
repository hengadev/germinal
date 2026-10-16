import type { PickedServiceDay } from './event-schedule';
import type { ServiceKind } from '$lib/utils/seating-times';

/**
 * The new-event form edits Seatings and « Menus & tarifs » for Services
 * that do not exist yet: they are the Days and meals just picked. The form
 * gives each one a placeholder id (a UUID, so the Seatings and pricing
 * payloads pass their usual parsers) and posts `serviceRefs`, telling
 * which Day and meal each placeholder stands for. Once the Event and its
 * Services are created, the placeholders are swapped for the real ids and
 * the payloads saved by the same functions as the event page's tabs.
 */

export interface ServiceRef {
	ref: string;
	date: string;
	kind: ServiceKind;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serviceKey(date: string, kind: ServiceKind): string {
	return `${date}:${kind}`;
}

/**
 * Parse `serviceRefs`: a JSON array of `{ ref, date, kind }`, one per
 * picked Day and meal at most, each naming a picked Day and meal. Missing
 * means no placeholder (nothing to save beyond the Days). Returns null
 * when invalid.
 */
export function parseServiceRefs(raw: string | null, days: PickedServiceDay[]): ServiceRef[] | null {
	if (raw === null || raw.trim() === '') return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;

	const picked = new Set(days.flatMap((day) => day.kinds.map((kind) => serviceKey(day.date, kind))));
	const seenRefs = new Set<string>();
	const seenKeys = new Set<string>();
	const refs: ServiceRef[] = [];
	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) return null;
		const { ref, date, kind } = entry as Record<string, unknown>;
		if (typeof ref !== 'string' || !UUID_PATTERN.test(ref) || seenRefs.has(ref)) return null;
		if (typeof date !== 'string' || (kind !== 'lunch' && kind !== 'dinner')) return null;
		const key = serviceKey(date, kind);
		if (!picked.has(key) || seenKeys.has(key)) return null;
		seenRefs.add(ref);
		seenKeys.add(key);
		refs.push({ ref, date, kind });
	}
	return refs;
}

/** Whether every item names a placeholder from `refs`. */
export function refersOnlyTo(items: { serviceId: string }[], refs: ServiceRef[]): boolean {
	const known = new Set(refs.map((ref) => ref.ref));
	return items.every((item) => known.has(item.serviceId));
}

/**
 * Swap each item's placeholder `serviceId` for the real id of the Service
 * it stands for. `realIds` maps `serviceKey(date, kind)` to the id of the
 * created Service. Throws when a placeholder has no Service — the Services
 * are created from the same picked Days, so that is a bug, not bad input.
 */
export function resolveServiceRefs<T extends { serviceId: string }>(
	items: T[],
	refs: ServiceRef[],
	realIds: Map<string, string>
): T[] {
	const byRef = new Map(refs.map((ref) => [ref.ref, realIds.get(serviceKey(ref.date, ref.kind))]));
	return items.map((item) => {
		const serviceId = byRef.get(item.serviceId);
		if (!serviceId) {
			throw new Error(`No Service created for placeholder ${item.serviceId}`);
		}
		return { ...item, serviceId };
	});
}
