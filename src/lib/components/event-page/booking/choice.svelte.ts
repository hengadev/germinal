// What the guest has picked so far in the booking on the Event's page:
// kept whole while the party size, day, meal or time change.
import type { DayView, EventPage, SeatingView, ServiceView } from '$lib/utils/event-page';
import { dayFits, dayOver, firstFit, fits, serviceFor, type AppliedGiftCard, type AppliedPromo, type Kind } from '$lib/utils/inline-booking';

export class Choice {
	guests = $state(2);
	dayDate = $state('');
	kind = $state<Kind | ''>('');
	seatingId = $state('');
	/** Extras taken: per-person ones 1 (the whole table) or 0, per-unit ones counted. */
	extras: Record<string, number> = $state({});
	/** A code applied from the single field (issue 080): a Promo Code, a
	 * gift card, or both. Changing the party or the Seating clears the
	 * Promo Code (its discount may no longer hold); the card stays. */
	promo = $state<AppliedPromo | null>(null);
	giftCard = $state<AppliedGiftCard | null>(null);

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
		this.promo = null;
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
		this.pickDaySeatings(d);
	}

	pickService(s: ServiceView) {
		this.kind = s.kind;
		this.pickDaySeatings(this.day!);
	}

	pickSeating(s: SeatingView) {
		this.seatingId = s.id;
		this.promo = null;
	}

	/** A new meal or Day picks the first Seating that fits: a different
	 * Seating, so an applied Promo Code goes. */
	private pickDaySeatings(d: DayView | undefined) {
		if (!d) return;
		const s = serviceFor(d, this.guests, this.kind);
		this.kind = s?.kind ?? '';
		const id = firstFit(s, this.guests)?.id ?? '';
		if (id !== this.seatingId) this.promo = null;
		this.seatingId = id;
	}

	get ready() {
		return Boolean(this.seating && fits(this.seating, this.guests));
	}
}
