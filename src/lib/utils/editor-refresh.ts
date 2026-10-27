/**
 * Refreshing a tab from saved data without overwriting the Admin (ADR
 * 0010, issue 018).
 *
 * A Draft saves while the Admin keeps typing, then the page data is
 * reloaded. A tab takes back from it what the server made of the save
 * (the English generated from the French), but only for the fields still
 * holding what was sent: a field changed since the save started keeps
 * what the Admin typed, and is saved by the next save.
 */

/**
 * `current`, with each field still as it was `sent` taking its `saved`
 * value instead.
 */
export function keepEdits<T extends Record<string, unknown>>(
	sent: Readonly<T>,
	current: Readonly<T>,
	saved: Readonly<T>
): T {
	const next: T = { ...current };
	for (const key of Object.keys(current) as (keyof T)[]) {
		if (Object.is(current[key], sent[key])) next[key] = saved[key];
	}
	return next;
}

/** Set `target[key]` only when it differs, so a bound field the Admin is
 * typing in is never rewritten with the same value. */
function assign<T extends object>(target: T, values: Partial<T>): void {
	for (const key of Object.keys(values) as (keyof T)[]) {
		if (!Object.is(target[key], values[key])) target[key] = values[key] as T[keyof T];
	}
}

// ---- « Dates & séances » (issue 019) -----------------------------------------

/** A Seating draft, as the Seatings editor holds it. */
export interface SeatingDraftLike {
	key: number;
	id: string | null;
	titleEn: string;
	descriptionEn: string;
	reservationCount: number;
	soldSeats: number;
}

/** A Service draft, as the Seatings editor holds it. */
export interface SeatingServiceDraftLike<S extends SeatingDraftLike = SeatingDraftLike> {
	serviceId: string;
	date: string;
	kind: string;
	seatings: S[];
}

const mealOf = (service: { date: string; kind: string }) => `${service.date}:${service.kind}`;

/**
 * After a Seatings save, give the `drafts` the Admin is still editing what
 * the save made — in place, keeping everything typed: a meal saved takes
 * its Service's id, a Seating sent takes its id (`seatingIds`: per saved
 * Service, the ids of the Seatings `sent`, in order), its Reservation
 * counts and, where not edited since, its generated English. A meal or
 * Seating that is not on the server (picked or added since the save
 * started, or removed by it) is new again: `placeholderOf` names its meal.
 */
export function adoptSavedSeatings<S extends SeatingDraftLike>(
	drafts: SeatingServiceDraftLike<S>[],
	sent: readonly SeatingServiceDraftLike<SeatingDraftLike>[],
	saved: readonly SeatingServiceDraftLike<SeatingDraftLike>[],
	seatingIds: Readonly<Record<string, readonly string[]>> | undefined,
	placeholderOf: (date: string, kind: string) => string
): void {
	const savedByMeal = new Map(saved.map((service) => [mealOf(service), service]));
	// What each Seating sent became, by its draft key.
	const idByKey = new Map<number, string>();
	const sentByKey = new Map<number, SeatingDraftLike>();
	for (const service of sent) {
		const savedService = savedByMeal.get(mealOf(service));
		const ids = savedService ? seatingIds?.[savedService.serviceId] : undefined;
		service.seatings.forEach((seating, index) => {
			sentByKey.set(seating.key, seating);
			const id = ids?.[index] ?? seating.id;
			if (id) idByKey.set(seating.key, id);
		});
	}

	for (const draft of drafts) {
		const savedService = savedByMeal.get(mealOf(draft));
		if (!savedService) {
			assign<SeatingServiceDraftLike<S>>(draft, { serviceId: placeholderOf(draft.date, draft.kind) });
			for (const seating of draft.seatings) assign<SeatingDraftLike>(seating, { id: null, reservationCount: 0, soldSeats: 0 });
			continue;
		}
		assign<SeatingServiceDraftLike<S>>(draft, { serviceId: savedService.serviceId });
		const savedById = new Map(savedService.seatings.map((seating) => [seating.id, seating]));
		for (const seating of draft.seatings) {
			const id = seating.id ?? idByKey.get(seating.key) ?? null;
			const savedSeating = id === null ? undefined : savedById.get(id);
			if (!savedSeating) {
				assign<SeatingDraftLike>(seating, { id: null, reservationCount: 0, soldSeats: 0 });
				continue;
			}
			assign<SeatingDraftLike>(seating, { id, reservationCount: savedSeating.reservationCount, soldSeats: savedSeating.soldSeats });
			const sentSeating = sentByKey.get(seating.key);
			if (sentSeating) {
				const english = (from: SeatingDraftLike) => ({ titleEn: from.titleEn, descriptionEn: from.descriptionEn });
				assign<SeatingDraftLike>(seating, keepEdits(english(sentSeating), english(seating), english(savedSeating)));
			}
		}
	}
}

// ---- « Menus & tarifs » (issue 019) ------------------------------------------

/** A Menu draft, as the pricing editor holds it. */
export interface MenuDraftLike {
	key: string;
	id: string | null;
	nameEn: string;
	descriptionEn: string;
}

/**
 * After a pricing save, give the `menus` the Admin is still editing what
 * the save made — in place, keeping everything typed: a Menu sent takes
 * its id (`menuIds`, by key) and, where not edited since, its generated
 * English. A Menu not on the server is new again.
 */
export function adoptSavedMenus<M extends MenuDraftLike>(
	menus: M[],
	sent: readonly MenuDraftLike[],
	saved: readonly MenuDraftLike[],
	menuIds: Readonly<Record<string, string>> | undefined
): void {
	const sentByKey = new Map(sent.map((menu) => [menu.key, menu]));
	const savedById = new Map(saved.map((menu) => [menu.id, menu]));
	for (const menu of menus) {
		const sentMenu = sentByKey.get(menu.key);
		const id = menu.id ?? (sentMenu ? menuIds?.[menu.key] : undefined) ?? null;
		const savedMenu = id === null ? undefined : savedById.get(id);
		if (!savedMenu) {
			assign<MenuDraftLike>(menu, { id: null });
			continue;
		}
		assign<MenuDraftLike>(menu, { id });
		if (sentMenu) {
			const english = (from: MenuDraftLike) => ({ nameEn: from.nameEn, descriptionEn: from.descriptionEn });
			assign<MenuDraftLike>(menu, keepEdits(english(sentMenu), english(menu), english(savedMenu)));
		}
	}
}

/** A Service as priced in « Menus & tarifs ». */
export interface PricingServiceDraftLike {
	serviceId: string;
	seatingCount: number;
	legacySeatings: unknown[];
}

/**
 * The pricing drafts following the saved Services (a Seatings save adds or
 * removes them): `null` when the same Services are listed — their counts
 * then updated in place — else the new list, where a Service already
 * priced keeps its draft and a new one comes as saved. Pricing thus only
 * ever lists Services that exist.
 */
export function followSavedServices<P extends PricingServiceDraftLike>(current: P[], saved: P[]): P[] | null {
	const draftById = new Map(current.map((service) => [service.serviceId, service]));
	const same = saved.length === current.length && saved.every((service, index) => current[index].serviceId === service.serviceId);
	const next = saved.map((service) => draftById.get(service.serviceId) ?? service);
	for (const service of saved) {
		const draft = draftById.get(service.serviceId);
		if (!draft) continue;
		assign<PricingServiceDraftLike>(draft, { seatingCount: service.seatingCount });
		if (JSON.stringify(draft.legacySeatings) !== JSON.stringify(service.legacySeatings)) {
			assign<PricingServiceDraftLike>(draft, { legacySeatings: service.legacySeatings });
		}
	}
	return same ? null : next;
}
