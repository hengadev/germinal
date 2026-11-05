/**
 * The inline booking of an upcoming Event's page (issue 079): which
 * Seatings can take a party, the short words under a choice, the bill and
 * the Menu of the meal picked. Every word comes through `t`
 * (svelte-i18n), under `events.booking`.
 */
import type {
	DayView,
	EventPage,
	MenuView,
	SeatingView,
	ServiceView,
	Translate,
} from './event-page';
import { formatDayKey, type EventTimeLocale } from './event-time';
import { formatPrice } from './event-page';
import { priceReservation, type PromoDiscount } from './pricing';
import { GIFT_CARD_CODE_PREFIX, normaliseGiftCardCode, splitDeposit } from './gift-card';

export type Lang = EventTimeLocale;
export type Kind = ServiceView['kind'];

/** The most one online booking takes (the booking API's limit). */
export const MAX_GUESTS = 10;
/** Parties picked in one tap; 7 to 10 use the stepper. */
export const TAP_GUESTS = 6;

/** An Extra the guest can add to the booking (the Admin's « Suppléments »),
 * resolved to the page's language. */
export interface BookingExtra {
	id: string;
	name: string;
	description: string;
	/** Minor units. */
	priceAmount: number;
	unit: 'per_person' | 'per_unit';
}

/** An applied Promo Code (issue 080): what the validation endpoint returned. */
export interface AppliedPromo extends PromoDiscount {
	code: string;
}

/** An applied gift card: its code and remaining balance (minor units). */
export interface AppliedGiftCard {
	code: string;
	balance: number;
}

/** Which kind a typed code is, by its format alone: one that normalises
 * to a gift card code (prefix GERM) is checked as such, anything else as
 * a Promo Code. */
export function codeKind(code: string): 'gift_card' | 'promo' {
	return normaliseGiftCardCode(code).startsWith(GIFT_CARD_CODE_PREFIX) ? 'gift_card' : 'promo';
}

/** What the booking API takes, minus what only the page knows (the
 * Seating, the chosen Extras and codes): built here so a unit test can
 * check it (issue 080). */
export interface BookingForm {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	marketingConsent: boolean;
}

export function bookingPayload(
	sessionId: string,
	quantity: number,
	form: BookingForm,
	opts: {
		extras?: { extraId: string; quantity: number }[];
		promo?: AppliedPromo;
		giftCard?: AppliedGiftCard;
		/** Sent, with its consent, only once the dietary answer is filled. */
		dietary?: { requirements: string };
		locale: string;
		honeypot?: string;
	}
) {
	return {
		sessionId,
		firstName: form.firstName.trim(),
		lastName: form.lastName.trim(),
		email: form.email.trim(),
		phone: form.phone.trim() || undefined,
		quantity,
		notificationPreference: form.phone.trim() ? ('both' as const) : ('email' as const),
		promoCode: opts.promo?.code,
		giftCardCode: opts.giftCard?.code,
		extras: opts.extras?.length ? opts.extras : undefined,
		...(opts.dietary ? { dietaryRequirements: opts.dietary.requirements.trim(), dietaryConsent: true } : {}),
		marketingConsent: form.marketingConsent,
		locale: opts.locale,
		honeypot: opts.honeypot ?? ''
	};
}

/** A Seating the party can book, or whose Waitlist it can join. */
export function fits(s: SeatingView, guests: number): boolean {
	if (s.state === 'waitlist') return true;
	const left = s.seating.availableCapacity;
	return s.bookable && (left === null || left >= guests);
}
export const serviceFits = (s: ServiceView, g: number) => s.seatings.some((x) => fits(x, g));
export const dayFits = (d: DayView, g: number) => d.services.some((s) => serviceFits(s, g));
export const serviceOver = (s: ServiceView) => s.seatings.length > 0 && s.seatings.every((x) => x.state === 'past');
export const dayOver = (d: DayView) => d.services.length > 0 && d.services.every(serviceOver);

/** The first time of a Service the party can take, else none. */
export const firstFit = (s: ServiceView | undefined, g: number) => s?.seatings.find((x) => fits(x, g));

/** The meal kept on a new Day when it still fits, else the Day's first that does. */
export function serviceFor(d: DayView, g: number, keep?: Kind | ''): ServiceView | undefined {
	return d.services.find((s) => s.kind === keep && serviceFits(s, g)) ?? d.services.find((s) => serviceFits(s, g));
}

/** « 1 convive », « 4 convives ». */
export const guestsWord = (t: Translate, n: number) =>
	t(n === 1 ? 'events.booking.guests.one' : 'events.booking.guests.other', { values: { n } });
/** « Complet », « Complet pour 4 ». */
export const fullFor = (t: Translate, n: number) =>
	t(n === 1 ? 'events.booking.fullFor.one' : 'events.booking.fullFor.other', { values: { n } });
/** « Plus qu’une place », « Plus que 3 places ». */
export const seatsLeft = (t: Translate, n: number) =>
	t(n === 1 ? 'events.booking.seatsLeft.one' : 'events.booking.seatsLeft.other', { values: { n } });

/** Why a Day or Service cannot take the party, in a word or two. */
export function quietNote(seatings: SeatingView[], g: number, t: Translate): string {
	if (seatings.every((s) => s.state === 'past')) return t('events.booking.ended');
	if (seatings.some((s) => s.bookable)) return fullFor(t, g);
	if (seatings.some((s) => s.state === 'not-open')) return t('events.booking.opensSoon');
	if (seatings.every((s) => s.state === 'full' || s.state === 'past')) return t('events.booking.full');
	return t('events.booking.unavailable');
}

/** The short word under a time, for this party; empty when all is well. */
export function timeNote(s: SeatingView, g: number, t: Translate): string {
	const left = s.seating.availableCapacity;
	if (s.state === 'past') return t('events.booking.ended');
	if (s.state === 'full') return t('events.booking.full');
	if (s.state === 'waitlist') return t('events.booking.waitlist');
	if (s.state === 'not-open') return t('events.booking.opensSoon');
	if (!s.bookable) return t('events.booking.unavailable');
	if (left !== null && left < g) return seatsLeft(t, left);
	if (s.state === 'limited' && left !== null) return seatsLeft(t, left);
	return '';
}

/** The Day's quiet line on the page: the meals, and a word when it is full. */
export function dayLine(d: DayView, t: Translate): { meals: string; note: string } {
	const seatings = d.services.flatMap((s) => s.seatings);
	const open = seatings.some((s) => s.bookable);
	const limited = open && seatings.filter((s) => s.bookable).every((s) => s.state === 'limited');
	const note = open
		? limited
			? t('events.booking.lastSeats')
			: ''
		: seatings.some((s) => s.state === 'waitlist')
			? t('events.booking.waitlist')
			: quietNote(seatings, 1, t);
	return { meals: d.services.map((s) => s.label).join(' · '), note };
}

export const shortDay = (d: DayView, lang: Lang) =>
	formatDayKey(d.date, lang, { weekday: 'short', day: 'numeric', month: 'short' });

/** What the party pays: the total, and what of it is paid now. */
export function quote(view: EventPage, s: SeatingView, g: number) {
	const unit = s.seating.priceAmount ?? 0;
	const price = priceReservation({ unitPrice: unit, seats: g, deposit: view.deposit });
	const money = (n: number) => formatPrice(n, s.seating.currency, view.lang);
	return { price, money, unit };
}

/** The submit button's words: what happens when it is pressed. */
export function submitLabel(view: EventPage, s: SeatingView, g: number, t: Translate): string {
	if (s.state === 'waitlist') return t('events.booking.joinWaitlist');
	const { price, money } = quote(view, s, g);
	if (price.deposit === 0) return t('events.booking.confirm');
	const amount = money(price.deposit);
	return price.balance > 0 ? t('events.booking.payDeposit', { values: { amount } }) : t('events.booking.pay', { values: { amount } });
}

/** The Menu served at one Service, found by its name in the page's language. */
export function menuFor(
	view: EventPage,
	schedule: { date: string; services: { kind: string; menu: { nameFr: string; nameEn: string } | null }[] }[],
	menus: MenuView[],
	date: string,
	kind: string
): MenuView | undefined {
	const menu = schedule.find((d) => d.date === date)?.services.find((s) => s.kind === kind)?.menu;
	if (!menu) return undefined;
	const name = view.lang === 'en' ? menu.nameEn || menu.nameFr : menu.nameFr || menu.nameEn;
	return menus.find((m) => m.name === name);
}

/** The bill so far: one line for the meal, one per Extra taken, then
 * the Promo Code's discount and what a gift card pays of the Deposit. */
export function bill(
	view: EventPage,
	choice: { guests: number; seating?: SeatingView; service?: ServiceView; extras: Record<string, number>; promo?: AppliedPromo | null; giftCard?: AppliedGiftCard | null },
	extras: BookingExtra[],
	mealName: string
) {
	const g = choice.guests;
	const qty = (x: BookingExtra) => (x.unit === 'per_person' ? (choice.extras[x.id] ? g : 0) : (choice.extras[x.id] ?? 0));
	const unit = choice.seating?.seating.priceAmount ?? 0;
	const extrasTotal = extras.reduce((sum, x) => sum + x.priceAmount * qty(x), 0);
	const price = priceReservation({ unitPrice: unit, seats: g, extrasTotal, discount: choice.promo ?? undefined, deposit: view.deposit });
	const card = choice.giftCard ? splitDeposit(price.deposit, choice.giftCard.balance).card : 0;
	const money = (n: number) => formatPrice(n, choice.seating?.seating.currency ?? 'EUR', view.lang);
	const lines = [
		{ label: `${g} × ${mealName || choice.service?.label || ''}`, amount: unit * g },
		...extras
			.filter((x) => qty(x) > 0)
			.map((x) => ({ label: `${x.name} × ${qty(x)}`, amount: x.priceAmount * qty(x) })),
	];
	return { lines, price, money, unit, qty, promo: choice.promo ?? null, giftCard: choice.giftCard ?? null, card, payNow: price.deposit - card };
}
