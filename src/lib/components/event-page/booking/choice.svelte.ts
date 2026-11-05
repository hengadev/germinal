// What the guest has picked so far in the booking on the Event's page:
// kept whole while the party size, day, meal or time change.
import type { DayView, EventPage, SeatingView, ServiceView } from '$lib/utils/event-page';
import { dayFits, dayOver, firstFit, fits, serviceFor, type Kind } from '$lib/utils/inline-booking';

export class Choice {
	guests = $state(2);
	dayDate = $state('');
	kind = $state<Kind | ''>('');
	seatingId = $state('');
	/** Extras taken: per-person ones 1 (the whole table) or 0, per-unit ones counted. */
	extras: Record<string, number> = $state({});

	#view: () => EventPage;

	day = $derived.by(() => this.#view().days.find((d) => d.date === this.dayDate));
	service = $derived.by(() => this.day?.services.find((s) => s.kind === this.kind));
	seating = $derived.by(() => this.service?.seatings.find((s) => s.id === this.seatingId));

	constructor(view: () => EventPage, startDate?: string) {
		this.#view = view;
		const days = view().days.filter((d) => !dayOver(d));
		const start = days.find((d) => d.date === startDate) ?? (days.length === 1 ? days[0] : undefined);
		if (start) this.pickDay(start);
	}

	/** A new party size keeps the later choices that can still take it. */
	setGuests(n: number) {
		this.guests = n;
		if (this.seating && fits(this.seating, n)) return;
		if (this.day && !dayFits(this.day, n)) {
			this.dayDate = this.kind = this.seatingId = '';
			return;
		}
		if (this.day) this.pickDay(this.day);
	}

	/** A new Day: the same meal when it still fits, with its first time that fits. */
	pickDay(d: DayView) {
		this.dayDate = d.date;
		const s = serviceFor(d, this.guests, this.kind);
		this.kind = s?.kind ?? '';
		this.seatingId = firstFit(s, this.guests)?.id ?? '';
	}

	pickService(s: ServiceView) {
		this.kind = s.kind;
		this.seatingId = firstFit(s, this.guests)?.id ?? '';
	}

	pickSeating(s: SeatingView) {
		this.seatingId = s.id;
	}

	get ready() {
		return Boolean(this.seating && fits(this.seating, this.guests));
	}
}
