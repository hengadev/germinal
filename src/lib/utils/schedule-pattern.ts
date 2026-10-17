import { dayOf, minutesOf, wallClockToInstant, type ServiceKind } from './event-time';
import { DEFAULT_SERVICE_DURATION_MINUTES, MINUTES_PER_DAY } from './seating-times';

/**
 * Schedule pattern (issue 046, « Dupliquer »): what a duplicated Event's
 * new Days are served. Every new lunch takes the source's first lunch
 * Service as its pattern — its default Seating duration, its Seatings
 * (wall-clock start and end in the Event's Time Zone, capacity override,
 * titles, descriptions, Badge, published and waitlist switches), its Menu
 * and its price — and every new dinner the first dinner Service's. A meal
 * kind the source never served starts empty: the default duration, no
 * Seating, Menu or price. Pure: the caller loads the source and writes
 * the result.
 */

const ORDERED_KINDS: ServiceKind[] = ['lunch', 'dinner'];

export interface PatternSourceSeating<Badge extends string = string> {
	startTime: Date | string;
	endTime: Date | string;
	totalCapacity: number;
	capacityOverridden: boolean;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	badgeType: Badge;
	published: boolean;
	allowWaitlist: boolean;
}

export interface PatternSourceService<Badge extends string = string> {
	/** The source Service's Day, `YYYY-MM-DD`. */
	date: string;
	kind: ServiceKind;
	defaultSeatingDurationMinutes: number;
	menuId: string | null;
	priceAmount: number | null;
	seatings: PatternSourceSeating<Badge>[];
}

/** A Day picked for the copy, with its meals. */
export interface PatternDay {
	date: string;
	kinds: ServiceKind[];
}

export interface PatternSeating<Badge extends string = string> {
	/** Minutes since midnight of the new Day, in the Event's Time Zone (an
	 * end past midnight runs over 1440). */
	startMinutes: number;
	endMinutes: number;
	startTime: Date;
	endTime: Date;
	/** The Seating's own capacity, or null to inherit the Venue Capacity. */
	capacityOverride: number | null;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	badgeType: Badge;
	published: boolean;
	allowWaitlist: boolean;
}

export interface PatternService<Badge extends string = string> {
	date: string;
	kind: ServiceKind;
	defaultSeatingDurationMinutes: number;
	/** The source's Menu id: the caller maps it to the copy's Menu. */
	menuId: string | null;
	priceAmount: number | null;
	seatings: PatternSeating<Badge>[];
}

function dayNumber(day: string): number {
	const [year, month, date] = day.split('-').map(Number);
	return Date.UTC(year, month - 1, date) / (MINUTES_PER_DAY * 60000);
}

/** Minutes of `instant` since midnight of `day`, on the clock of `zone`. */
function minutesSince(day: string, instant: Date | string, zone: string): number {
	return (dayNumber(dayOf(instant, zone)) - dayNumber(day)) * MINUTES_PER_DAY + minutesOf(instant, zone);
}

/** The source's first Service of each meal kind (by Day). */
function firstServiceByKind<Badge extends string>(
	source: PatternSourceService<Badge>[]
): Map<ServiceKind, PatternSourceService<Badge>> {
	const first = new Map<ServiceKind, PatternSourceService<Badge>>();
	for (const service of [...source].sort((a, b) => a.date.localeCompare(b.date))) {
		if (!first.has(service.kind)) first.set(service.kind, service);
	}
	return first;
}

/** The meal kinds the source serves, lunch first: what « Dupliquer »
 * pre-ticks on the Days picker. */
export function servedKinds(source: { kind: ServiceKind }[]): ServiceKind[] {
	return ORDERED_KINDS.filter((kind) => source.some((service) => service.kind === kind));
}

/**
 * The Services and Seatings to create on the picked Days, in Day then
 * meal order, from the source's pattern.
 */
export function planSchedulePattern<Badge extends string>(
	source: PatternSourceService<Badge>[],
	days: PatternDay[],
	zone: string
): PatternService<Badge>[] {
	const patterns = firstServiceByKind(source);
	const planned: PatternService<Badge>[] = [];
	for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
		for (const kind of ORDERED_KINDS.filter((candidate) => day.kinds.includes(candidate))) {
			const pattern = patterns.get(kind);
			if (!pattern) {
				planned.push({
					date: day.date,
					kind,
					defaultSeatingDurationMinutes: DEFAULT_SERVICE_DURATION_MINUTES[kind],
					menuId: null,
					priceAmount: null,
					seatings: [],
				});
				continue;
			}
			const seatings = pattern.seatings
				.map((seating) => {
					const startMinutes = minutesSince(pattern.date, seating.startTime, zone);
					const endMinutes = minutesSince(pattern.date, seating.endTime, zone);
					return {
						startMinutes,
						endMinutes,
						startTime: wallClockToInstant(day.date, startMinutes, zone),
						endTime: wallClockToInstant(day.date, endMinutes, zone),
						capacityOverride: seating.capacityOverridden ? seating.totalCapacity : null,
						titleEn: seating.titleEn,
						titleFr: seating.titleFr,
						descriptionEn: seating.descriptionEn,
						descriptionFr: seating.descriptionFr,
						badgeType: seating.badgeType,
						published: seating.published,
						allowWaitlist: seating.allowWaitlist,
					};
				})
				.sort((a, b) => a.startMinutes - b.startMinutes);
			planned.push({
				date: day.date,
				kind,
				defaultSeatingDurationMinutes: pattern.defaultSeatingDurationMinutes,
				menuId: pattern.menuId,
				priceAmount: pattern.priceAmount,
				seatings,
			});
		}
	}
	return planned;
}
