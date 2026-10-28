/**
 * The « programme type » of an Event's schedule: what lunch and dinner
 * are on every Day, with the Days that differ shown as exceptions.
 *
 * The programme is not stored. It is read from the Days when the tab
 * opens — for each meal and field, the value most Days share — and the
 * drafts the tab saves stay the only truth: a Day is an exception where
 * its own value differs from the programme's. Editing the programme
 * writes the new value to every Day that still had the old one (the Days
 * that follow it); editing selected Days writes to those Days only.
 *
 * A tab plugs its drafts in through a `ScheduleSource`: « Dates &
 * séances » edits whether a meal is served, its Seating start times,
 * duration and capacity; « Menus & tarifs » its Menu and price.
 */
import type { ServiceKind } from '$lib/utils/seating-times';
import type { SeatingBadge } from '$lib/types/seatings-editor';

export type Kind = ServiceKind;
export const KINDS: Kind[] = ['lunch', 'dinner'];
export const MEAL: Record<Kind, string> = { lunch: 'Déjeuner', dinner: 'Dîner' };

/** What a Seating says of itself on the site, by start time. */
export interface SeatingInfo {
	titleFr: string;
	titleEn: string;
	descriptionFr: string;
	descriptionEn: string;
	badge: SeatingBadge;
}

export const BLANK_INFO: SeatingInfo = { titleFr: '', titleEn: '', descriptionFr: '', descriptionEn: '', badge: 'none' };

export const BADGES: { value: SeatingBadge; label: string }[] = [
	{ value: 'none', label: 'Aucun' },
	{ value: 'featured', label: 'En vedette' },
	{ value: 'vip', label: 'VIP' },
	{ value: 'popular', label: 'Populaire' },
	{ value: 'best_value', label: 'Meilleur rapport' },
	{ value: 'limited', label: 'Places limitées' },
];

/** A start time's info; none written is blank. */
export const infoAt = (meal: MealPlan, start: string): SeatingInfo => ({ ...BLANK_INFO, ...meal.seatings[start] });

export const sameInfo = (a: SeatingInfo, b: SeatingInfo) =>
	a.titleFr === b.titleFr && a.titleEn === b.titleEn && a.descriptionFr === b.descriptionFr && a.descriptionEn === b.descriptionEn && a.badge === b.badge;

export const isBlankInfo = (info: SeatingInfo) => sameInfo(info, BLANK_INFO);

/** One meal of one Day, or of the programme. */
export interface MealPlan {
	served: boolean;
	/** `HH:MM` Seating start times, sorted. */
	starts: string[];
	/** Default Seating duration in minutes. */
	duration: number | null;
	/** The Seatings' own capacity; null: they inherit the Venue Capacity. */
	capacity: number | null;
	/** Menu key, '' for no Menu. */
	menu: string;
	/** Price per guest in major units; null while not set. */
	price: number | null;
	/** Its Seatings are on the site and bookable. */
	published: boolean;
	/** A full Seating takes a waitlist. */
	waitlist: boolean;
	/** Each Seating's title, description and badge, by start time. */
	seatings: Record<string, SeatingInfo>;
}
export type Field = keyof MealPlan;
export type Facet = 'seances' | 'tarifs';

/** The fields each tab edits. */
export const FACET_FIELDS: Record<Facet, Field[]> = {
	seances: ['served', 'starts', 'duration', 'capacity', 'published', 'waitlist', 'seatings'],
	tarifs: ['menu', 'price'],
};

/** The tab's drafts, read and written one Day's meal at a time. */
export interface ScheduleSource {
	/** The Event's Days, sorted. */
	readonly days: string[];
	meal(date: string, kind: Kind): MealPlan;
	write<F extends Field>(date: string, kind: Kind, field: F, value: MealPlan[F]): void;
	/** A Seating start time changed in place (keeps the Seating). */
	renameStart?(date: string, kind: Kind, from: string, to: string): void;
	/** New Days, each taking the programme's meals. */
	addDays?(dates: string[], programme: Record<Kind, MealPlan>): void;
	removeDays?(dates: string[]): void;
}

// Start times compare as a set.
const norm = (v: unknown) => (Array.isArray(v) ? [...v].sort() : v);
export const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const copy = <T>(value: T): T =>
	Array.isArray(value) ? ([...value] as T) : value && typeof value === 'object' ? structuredClone(value) : value;

export const EMPTY_MEAL: MealPlan = {
	served: false,
	starts: [],
	duration: null,
	capacity: null,
	menu: '',
	price: null,
	published: true,
	waitlist: false,
	seatings: {},
};

/** What a new Event's Days get until the programme says otherwise. */
export const NEW_PROGRAMME: Record<Kind, MealPlan> = {
	lunch: { ...EMPTY_MEAL, served: true, starts: ['12:00'], duration: 90 },
	dinner: { ...EMPTY_MEAL, served: true, starts: ['19:30'], duration: 120 },
};

/** The value most of `values` share; ties go to the earliest. */
function mostShared<T>(values: T[]): T | undefined {
	const counts = new Map<string, { value: T; count: number }>();
	for (const value of values) {
		const key = JSON.stringify(norm(value));
		const entry = counts.get(key);
		if (entry) entry.count++;
		else counts.set(key, { value, count: 1 });
	}
	let best: { value: T; count: number } | undefined;
	for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
	return best?.value;
}

/** The programme the Days follow most. */
export function inferProgramme(source: ScheduleSource): Record<Kind, MealPlan> {
	const result = {} as Record<Kind, MealPlan>;
	for (const kind of KINDS) {
		const meals = source.days.map((date) => source.meal(date, kind));
		const served = meals.filter((meal) => meal.served);
		if (meals.length === 0) {
			result[kind] = { ...NEW_PROGRAMME[kind] };
			continue;
		}
		const fallback = NEW_PROGRAMME[kind];
		const plan = { served: served.length * 2 >= meals.length && served.length > 0 } as MealPlan;
		for (const field of ['starts', 'duration', 'capacity', 'menu', 'price', 'published', 'waitlist', 'seatings'] as const) {
			const value = mostShared(served.map((meal) => meal[field]));
			(plan as unknown as Record<string, unknown>)[field] = copy(value ?? fallback[field]);
		}
		result[kind] = plan;
	}
	return result;
}

export class Programme {
	plan: Record<Kind, MealPlan> = $state(structuredClone(NEW_PROGRAMME));

	constructor(
		readonly source: ScheduleSource,
		readonly facet: Facet
	) {
		this.plan = inferProgramme(source);
	}

	/** Read the programme again from the Days (after « Annuler »). */
	reinfer() {
		this.plan = inferProgramme(this.source);
	}

	get days(): string[] {
		return this.source.days;
	}

	meal(date: string, kind: Kind): MealPlan {
		return this.source.meal(date, kind);
	}

	/** A meal not served is only compared on being served: its times and
	 * prices are not shown. */
	isOverridden(date: string, kind: Kind, field: Field): boolean {
		const meal = this.meal(date, kind);
		const plan = this.plan[kind];
		if (field === 'served') return meal.served !== plan.served;
		if (!meal.served || !plan.served) return false;
		// A Seating's info counts at the times both have; other times are
		// already a difference of `starts`.
		if (field === 'seatings') return meal.starts.some((start) => plan.starts.includes(start) && !sameInfo(infoAt(meal, start), infoAt(plan, start)));
		return !same(meal[field], plan[field]);
	}

	/** The fields of a Day's meal that differ from the programme, in this tab. */
	differences(date: string, kind: Kind): Field[] {
		if (this.facet === 'tarifs' && !this.meal(date, kind).served) return [];
		return FACET_FIELDS[this.facet].filter((field) => this.isOverridden(date, kind, field));
	}

	isCustom(date: string): boolean {
		return KINDS.some((kind) => this.differences(date, kind).length > 0);
	}

	customDays(): string[] {
		return this.days.filter((date) => this.isCustom(date));
	}

	/** Write a meal's field on these Days. A meal served again takes the
	 * programme's times when it has none. */
	set<F extends Field>(dates: string[], kind: Kind, field: F, value: MealPlan[F]) {
		for (const date of dates) {
			this.source.write(date, kind, field, copy(value));
			if (field === 'served' && value && this.facet === 'seances') {
				const meal = this.meal(date, kind);
				if (meal.starts.length === 0) {
					this.source.write(date, kind, 'starts', [...this.plan[kind].starts]);
					this.source.write(date, kind, 'duration', this.plan[kind].duration);
				}
			}
		}
	}

	/** Back to the programme: some fields, a whole meal, or a whole Day. */
	reset(date: string, kind?: Kind, fields?: Field[]) {
		for (const k of kind ? [kind] : KINDS) {
			// Served first: a meal served again then takes the times.
			const first = (field: Field) => (field === 'served' ? 0 : 1);
			const order = [...(fields ?? FACET_FIELDS[this.facet])].sort((a, b) => first(a) - first(b));
			for (const field of order) {
				if (this.isOverridden(date, k, field)) this.set([date], k, field, this.plan[k][field]);
			}
		}
	}

	/** Change the programme: the Days that followed it follow the change. */
	setProgramme<F extends Field>(kind: Kind, field: F, value: MealPlan[F]) {
		const followers = this.days.filter((date) => !this.isOverridden(date, kind, field) && (field === 'served' || this.meal(date, kind).served));
		this.plan[kind][field] = copy(value);
		this.set(followers, kind, field, value);
	}

	/** One Seating start time changed: on these Days, or on the programme
	 * and the Days that follow it. The Seating itself is kept. */
	renameStart(dates: string[] | null, kind: Kind, from: string, to: string) {
		const targets = dates ?? this.days.filter((date) => this.meal(date, kind).served && !this.isOverridden(date, kind, 'starts'));
		if (dates === null) {
			const plan = this.plan[kind];
			plan.starts = [...new Set(plan.starts.map((t) => (t === from ? to : t)))].sort();
			if (plan.seatings[from]) {
				plan.seatings[to] = plan.seatings[from];
				delete plan.seatings[from];
			}
		}
		for (const date of targets) {
			const meal = this.meal(date, kind);
			if (!meal.starts.includes(from)) continue;
			if (this.source.renameStart) this.source.renameStart(date, kind, from, to);
			else this.source.write(date, kind, 'starts', [...new Set(meal.starts.map((t) => (t === from ? to : t)))].sort());
		}
	}

	/** One Seating's title, description and badge: on these Days, or on
	 * the programme and the Days whose Seating at that time still had the
	 * programme's. */
	setSeatingInfo(dates: string[] | null, kind: Kind, start: string, info: SeatingInfo) {
		const plan = this.plan[kind];
		const targets =
			dates ??
			this.days.filter((date) => {
				const meal = this.meal(date, kind);
				return meal.served && meal.starts.includes(start) && sameInfo(infoAt(meal, start), infoAt(plan, start));
			});
		if (dates === null) plan.seatings[start] = { ...info };
		for (const date of targets) {
			const meal = this.meal(date, kind);
			if (meal.starts.includes(start)) this.source.write(date, kind, 'seatings', { ...meal.seatings, [start]: { ...info } });
		}
	}

	/** Several Days' meal edited at once: shown as the first Day's, with
	 * the fields they disagree on and those any of them overrides. */
	selection(dates: string[], kind: Kind) {
		const meals = dates.map((date) => this.meal(date, kind));
		return {
			value: meals[0] ?? this.plan[kind],
			mixed: (field: Field) => meals.some((meal) => !same(meal[field], meals[0][field])),
			overridden: (field: Field) => dates.some((date) => this.isOverridden(date, kind, field)),
			set: <F extends Field>(field: F, value: MealPlan[F]) => this.set(dates, kind, field, value),
			reset: (field: Field) => dates.forEach((date) => this.reset(date, kind, [field])),
			rename: (from: string, to: string) => this.renameStart(dates, kind, from, to),
			setInfo: (start: string, info: SeatingInfo) => this.setSeatingInfo(dates, kind, start, info),
		};
	}

	get canEditDays(): boolean {
		return !!this.source.addDays && !!this.source.removeDays;
	}

	addDays(dates: string[]) {
		const fresh = dates.filter((date) => !this.days.includes(date));
		if (fresh.length) this.source.addDays?.(fresh, this.plan);
	}

	removeDays(dates: string[]) {
		this.source.removeDays?.(dates);
	}
}

// ── Dates ──────────────────────────────────────────────────────────────

const toKey = (date: Date) =>
	`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);

/** Every date from `from` to `to` (inclusive) falling on one of `weekdays` (0 = Sunday). */
export function datesBetween(from: string, to: string, weekdays: number[]): string[] {
	const out: string[] = [];
	const end = fromKey(to);
	for (let d = fromKey(from); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		if (weekdays.includes(d.getUTCDay())) out.push(toKey(d));
	}
	return out;
}

export function weekdayOf(key: string): number {
	return fromKey(key).getUTCDay();
}

export function frDay(key: string, style: 'short' | 'long' = 'short'): string {
	return fromKey(key).toLocaleDateString('fr-FR', {
		timeZone: 'UTC',
		weekday: style === 'short' ? 'short' : 'long',
		day: 'numeric',
		month: style === 'short' ? 'short' : 'long',
	});
}

export function frMonth(year: number, month: number): string {
	return new Date(Date.UTC(year, month, 1)).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
}

export const frClock = (time: string) => time.replace(':', 'h');

export function endOf(start: string, duration: number): string {
	const [h, m] = start.split(':').map(Number);
	const total = h * 60 + m + duration;
	return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function durationLabel(minutes: number | null): string {
	if (minutes === null) return 'durée à définir';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export const WEEKDAYS = [
	{ day: 1, short: 'L', long: 'lundi' },
	{ day: 2, short: 'M', long: 'mardi' },
	{ day: 3, short: 'M', long: 'mercredi' },
	{ day: 4, short: 'J', long: 'jeudi' },
	{ day: 5, short: 'V', long: 'vendredi' },
	{ day: 6, short: 'S', long: 'samedi' },
	{ day: 0, short: 'D', long: 'dimanche' },
];

/** « 12 jours, du jeu. 11 mars au dim. 28 mars » */
export function daysSummary(days: string[]): string {
	if (days.length === 0) return 'Aucun jour';
	if (days.length === 1) return `1 jour, le ${frDay(days[0], 'long')}`;
	return `${days.length} jours, du ${frDay(days[0])} au ${frDay(days.at(-1)!)}`;
}

// ── Words ──────────────────────────────────────────────────────────────

/** How a tab names its Menus and prices. */
export interface Wording {
	menuName: (key: string) => string;
	price: (price: number | null) => string;
	/** The Venue Capacity, which Seatings without their own inherit. */
	venueCapacity?: number | null;
}

export function capacityLabel(capacity: number | null, venueCapacity: number | null | undefined): string {
	if (capacity !== null) return `${capacity} places`;
	return venueCapacity == null ? 'sans limite' : `${venueCapacity} places (lieu)`;
}

/** One line: « 12h30 » or « 19h00 · 21h30 », or « Pas de dîner ». */
export function mealLine(meal: MealPlan, kind: Kind, facet: Facet, words: Wording): string {
	if (!meal.served) return `Pas de ${MEAL[kind].toLowerCase()}`;
	if (facet === 'tarifs') return `${words.menuName(meal.menu)} · ${words.price(meal.price)}`;
	return meal.starts.length === 0 ? 'Aucune séance' : meal.starts.map(frClock).join(' · ');
}

/** What sets a Day apart, a few words per meal: « Dîner : 18h30 · 20h45, 40 places ». */
export function describeException(programme: Programme, date: string, words: Wording): string[] {
	return KINDS.flatMap((kind) => {
		const fields = programme.differences(date, kind);
		if (fields.length === 0) return [];
		const meal = programme.meal(date, kind);
		if (!meal.served) return [`pas de ${MEAL[kind].toLowerCase()}`];
		const parts = fields.map((field): string => {
			switch (field) {
				case 'served':
					return 'servi';
				case 'starts':
					return meal.starts.length ? meal.starts.map(frClock).join(' · ') : 'aucune séance';
				case 'duration':
					return durationLabel(meal.duration);
				case 'capacity':
					return capacityLabel(meal.capacity, words.venueCapacity);
				case 'published':
					return meal.published ? 'en vente' : 'hors vente';
				case 'waitlist':
					return meal.waitlist ? 'liste d’attente' : 'sans liste d’attente';
				case 'seatings':
					return 'titre ou badge';
				case 'menu':
					return words.menuName(meal.menu);
				case 'price':
					return words.price(meal.price);
			}
		});
		return [`${MEAL[kind]} : ${parts.join(', ')}`];
	});
}
