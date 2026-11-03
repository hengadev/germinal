/**
 * Bilan across Events (issue 058): pure rates and averages computed from
 * per-Seating rows, so the Admin page, the CSV export and the tests all
 * agree. Rates are ratios (0–1), null when they cannot be computed.
 */

/** One Seating's figures, as summed by the attendance service. */
export interface BilanSeatingRow {
	eventId: string;
	/** The Day's calendar date, 'YYYY-MM-DD'. */
	date: string;
	kind: 'lunch' | 'dinner';
	booked: number;
	arrived: number;
	noShows: number;
	walkInGuests: number;
	compGuests: number;
	totalCapacity: number | null;
}

/** An Event's figures: the sums over its Seatings, with the two rates. */
export interface EventBilanSummary {
	booked: number;
	arrived: number;
	noShows: number;
	walkInGuests: number;
	compGuests: number;
	/** Sum of the Seatings' capacities; null when none has one. */
	capacity: number | null;
	/** Arrived ÷ capacity, over the Seatings that have a capacity only;
	 * null when none has one. */
	fillRate: number | null;
	/** No-shows ÷ booked, weighted by guests; null without bookings. */
	noShowRate: number | null;
}

/** Sum an Event's per-Seating rows and derive its two rates. */
export function summarizeEvent(rows: BilanSeatingRow[]): EventBilanSummary {
	let booked = 0;
	let arrived = 0;
	let noShows = 0;
	let walkInGuests = 0;
	let compGuests = 0;
	let capacity: number | null = null;
	// A Seating without capacity can't fill: its guests stay out of the rate.
	let arrivedWithCapacity = 0;
	for (const row of rows) {
		booked += row.booked;
		arrived += row.arrived;
		noShows += row.noShows;
		walkInGuests += row.walkInGuests;
		compGuests += row.compGuests;
		if (row.totalCapacity !== null) {
			capacity = (capacity ?? 0) + row.totalCapacity;
			arrivedWithCapacity += row.arrived;
		}
	}
	return {
		booked,
		arrived,
		noShows,
		walkInGuests,
		compGuests,
		capacity,
		fillRate: capacity !== null && capacity > 0 ? arrivedWithCapacity / capacity : null,
		noShowRate: booked > 0 ? noShows / booked : null
	};
}

/**
 * The weekday of a Day's 'YYYY-MM-DD' date, without any time-zone shift
 * (the date is a calendar date, not an instant): 0 = Sunday … 6 = Saturday.
 */
export function weekdayFromDayDate(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** One cell of the averages block: a Service kind × weekday. */
export interface AveragesCell {
	kind: 'lunch' | 'dinner';
	weekday: number;
	seatings: number;
	/** No-shows ÷ booked across the cell's Seatings; null without bookings. */
	noShowRate: number | null;
	/** Walk-in guests ÷ Seatings; null without Seatings. */
	walkInsPerSeating: number | null;
}

/** A cell is left blank until it holds at least this many Seatings. */
export const MIN_SEATINGS_FOR_AVERAGE = 3;

/**
 * No-show rate and Walk-ins per Service kind × weekday over the given
 * Seatings, weighted by guests. Cells with fewer than three Seatings keep
 * their count but their values stay null (rendered blank).
 */
export function computeAverages(rows: BilanSeatingRow[]): AveragesCell[] {
	const groups = new Map<string, { kind: 'lunch' | 'dinner'; weekday: number; seatings: number; booked: number; noShows: number; walkInGuests: number }>();
	for (const row of rows) {
		const weekday = weekdayFromDayDate(row.date);
		const key = `${row.kind}:${weekday}`;
		let g = groups.get(key);
		if (!g) {
			g = { kind: row.kind, weekday, seatings: 0, booked: 0, noShows: 0, walkInGuests: 0 };
			groups.set(key, g);
		}
		g.seatings += 1;
		g.booked += row.booked;
		g.noShows += row.noShows;
		g.walkInGuests += row.walkInGuests;
	}
	return [...groups.values()]
		.map((g) => ({
			kind: g.kind,
			weekday: g.weekday,
			seatings: g.seatings,
			noShowRate: g.booked > 0 ? g.noShows / g.booked : null,
			walkInsPerSeating: g.seatings > 0 ? g.walkInGuests / g.seatings : null
		}))
		.sort((a, b) => (a.kind === b.kind ? a.weekday - b.weekday : a.kind === 'lunch' ? -1 : 1))
		.map((cell) =>
			cell.seatings >= MIN_SEATINGS_FOR_AVERAGE
				? cell
				: { ...cell, noShowRate: null, walkInsPerSeating: null }
		);
}
