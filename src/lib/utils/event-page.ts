/**
 * What the public Event page shows, in the reader's language: the
 * announcement (Days → Services → Seatings, prices, Menus, what can be
 * booked) and the Portfolio project. Layout lives in the components; every
 * word comes through `t` (svelte-i18n's `$t`).
 */
import { localizedText } from './event-text';
import { formatCurrency } from './currency';
import { formatDayKey, formatSeatingDateTime, formatSeatingTime, type EventTimeLocale } from './event-time';
import { depositRuleOf, isFullPayment, priceReservation, type DepositRule } from './pricing';
import { describeRefundPolicy, refundPolicyOf, type RefundPolicy } from './refund-policy';
import { formatProjectDates } from './project-dates';
import { derivedSeatingTitle } from './seating-title';
import type { BookingRefusal } from './event-access';
import type { MenuCourse } from '$lib/types/pricing-editor';

export type Translate = (id: string, options?: { values?: Record<string, string | number> }) => string;

export interface Credit {
	name: string;
	role: string;
	/** The Talent's profile, when the Collaborator is one. */
	href: string | null;
}

export interface PageMedium {
	id: string;
	type: string;
	url: string;
	altEn?: string | null;
	altFr?: string | null;
}

/** What a visitor can do with a Seating. */
export type SeatingState = 'open' | 'limited' | 'waitlist' | 'full' | 'not-open' | 'closed' | 'unpriced' | 'past' | 'unavailable';

/** A Seating as the page loads it. */
export interface PageSeating {
	id: string;
	titleEn?: string;
	titleFr?: string;
	descriptionEn?: string | null;
	descriptionFr?: string | null;
	startTime: string;
	endTime: string;
	priceAmount: number | null;
	currency: string;
	/** Both null on a Seating without a limit (ADR 0009). */
	availableCapacity: number | null;
	totalCapacity: number | null;
	allowWaitlist: boolean;
	soldOut: boolean;
	isPast: boolean;
	badgeType?: string | null;
	bookingRefusal?: BookingRefusal | null;
	bookingOpensAt?: Date | string | null;
	waitlistOpen?: boolean;
}

export interface PageService {
	kind: 'lunch' | 'dinner';
	menu: {
		nameEn: string;
		nameFr: string;
		courses: MenuCourse[];
		descriptionEn: string | null;
		descriptionFr: string | null;
	} | null;
	priceAmount: number | null;
	currency: string;
	sessions: PageSeating[];
}

export interface PageDay {
	date: string;
	services: PageService[];
}

export interface SeatingView {
	seating: PageSeating;
	id: string;
	start: string;
	end: string;
	/** Its own title, or null when it only has the one derived from its time. */
	title: string | null;
	description: string;
	/** A VIP Seating sits behind a threshold (DESIGN.md, the Threshold Rule). */
	vip: boolean;
	state: SeatingState;
	/** « Il reste 3 places », « Complet », « Réservations à partir du… ». */
	status: string;
	bookable: boolean;
}

export interface ServiceView {
	kind: 'lunch' | 'dinner';
	label: string;
	/** « 85 € », « Gratuit », « Tarif à venir ». */
	price: string;
	priced: boolean;
	/** What is paid online and what at the venue, or empty. */
	depositNote: string;
	seatings: SeatingView[];
}

export interface DayView {
	date: string;
	label: string;
	services: ServiceView[];
}

export interface MenuView {
	name: string;
	/** Its Courses in order, in the page's language. */
	courses: { label: string; dish: string }[];
	/** The note under the Courses (wine pairing, allergens…); empty when none. */
	note: string;
	/** Where it is served (« Dîner · ven. 12 mars »), when the Event has several Menus. */
	services: string[];
}

export type BookingSummary = 'open' | 'not-open' | 'waitlist' | 'full' | 'closed' | 'past' | 'unpriced';

const LIMITED_SHARE = 0.2;
const LIMITED_MIN = 3;

/** The reader's language for the formatters that only know French and English. */
export const pageLang = (locale: string | null | undefined): EventTimeLocale => (locale?.startsWith('en') ? 'en' : 'fr');

/** A price without the cents when there are none: « 85 € », not « 85,00 € ». */
export function formatPrice(amount: number, currency: string, lang: EventTimeLocale): string {
	return formatCurrency(amount, currency, lang === 'fr' ? 'fr-FR' : 'en-GB').replace(/[.,]00(?=\D*$)/, '');
}

/** Text split on blank lines. */
export function paragraphsOf(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
}

/** The Collaborators (stored as JSON), those without a name left out. */
export function creditsOf(json: string | null | undefined): Credit[] {
	try {
		const list = json ? JSON.parse(json) : [];
		return Array.isArray(list)
			? list
					.filter((c) => typeof c?.name === 'string' && c.name.trim())
					.map((c) => ({ name: c.name, role: c.role ?? '', href: c.talentId ? `/talents/${c.talentId}` : null }))
			: [];
	} catch {
		return [];
	}
}

/** The Timings (stored as JSON), e.g. « Accueil 19:45 ». */
export function timingsOf(json: string | null | undefined): { label: string; time: string }[] {
	try {
		const list = json ? JSON.parse(json) : [];
		return Array.isArray(list) ? list.filter((timing) => timing?.label || timing?.time) : [];
	} catch {
		return [];
	}
}

type Localized = Record<string, unknown>;
const text = (lang: EventTimeLocale, e: Localized, field: string) =>
	localizedText(e[`${field}En`] as string | null, e[`${field}Fr`] as string | null, lang);

/** The venue's address, one line each: name, street, district and city. */
export function venueLinesOf(e: Localized, lang: EventTimeLocale): string[] {
	const city = [e.postalCode as string | null, text(lang, e, 'city')].filter(Boolean).join(' ');
	return [
		text(lang, e, 'venueName'),
		text(lang, e, 'streetAddress'),
		[text(lang, e, 'district'), city].filter(Boolean).join(', '),
		text(lang, e, 'country'),
	].filter(Boolean);
}

/**
 * What a visitor can do with a Seating. A few seats left (a fifth of it, or
 * three) reads as « limited », as does a Seating badged so.
 */
export function seatingStateOf(s: PageSeating): SeatingState {
	if (s.isPast || s.bookingRefusal === 'started') return 'past';
	// A Seating whose Service has no price yet is neither bookable nor
	// wait-listed, whether or not it is full.
	if (s.bookingRefusal === 'not-priced' || s.priceAmount == null) return 'unpriced';
	if (s.bookingRefusal === 'event-not-published' || s.bookingRefusal === 'seating-unpublished') return 'unavailable';
	// Outside the Booking Window (035): no booking, no Waitlist.
	if (s.bookingRefusal === 'not-open') return 'not-open';
	if (s.bookingRefusal === 'closed') return 'closed';
	if (s.soldOut || s.bookingRefusal === 'full') return (s.waitlistOpen ?? s.allowWaitlist) ? 'waitlist' : 'full';
	if (
		s.badgeType === 'limited' ||
		(s.availableCapacity !== null && s.totalCapacity !== null &&
			s.availableCapacity <= Math.max(LIMITED_MIN, Math.ceil(s.totalCapacity * LIMITED_SHARE)))
	) {
		return 'limited';
	}
	return 'open';
}

function seatingStatus(t: Translate, state: SeatingState, s: PageSeating, zone: string, lang: EventTimeLocale): string {
	const left = s.availableCapacity;
	switch (state) {
		case 'past':
			return t('events.page.seating.ended');
		case 'unpriced':
			return t('events.priceToBeAnnounced');
		case 'unavailable':
			return t('events.page.seating.unavailable');
		case 'not-open':
			return s.bookingOpensAt
				? t('booking.bookingOpensOn', { values: { date: formatSeatingDateTime(s.bookingOpensAt, zone, lang) } })
				: t('events.page.seating.opensSoon');
		case 'closed':
			return t('booking.bookingClosed');
		case 'waitlist':
			return t('events.page.seating.waitlist');
		case 'full':
			return t('events.page.seating.full');
		case 'limited':
			if (left === null) return t('events.page.seating.open');
			return left === 1 ? t('events.page.seating.lastSeat') : t('events.page.seating.seatsLeft', { values: { count: left } });
		default:
			return left === null ? t('events.page.seating.open') : t('events.page.seating.seats', { values: { count: left } });
	}
}

/** The announcement: Days → Services → Seatings and what they add up to. */
export function eventPage(event: Localized, schedule: PageDay[], locale: string | null | undefined, t: Translate) {
	const lang = pageLang(locale);
	const zone = event.timeZone as string;
	const deposit: DepositRule = depositRuleOf(event);
	const refundPolicy: RefundPolicy = refundPolicyOf(event);

	const depositNote = (amount: number | null, currency: string) => {
		if (amount === null || amount === 0 || isFullPayment(deposit)) return '';
		const price = priceReservation({ unitPrice: amount, seats: 1, deposit });
		if (price.balance === 0) return '';
		if (price.deposit === 0) return t('events.noDepositNote');
		return t('events.depositPerGuest', { values: { amount: formatPrice(price.deposit, currency, lang) } });
	};
	const servicePrice = (amount: number | null, currency: string) =>
		amount === null ? t('events.priceToBeAnnounced') : amount === 0 ? t('events.free') : formatPrice(amount, currency, lang);

	const days: DayView[] = schedule.map((day) => ({
		date: day.date,
		label: formatDayKey(day.date, lang, { weekday: 'long', day: 'numeric', month: 'long' }),
		services: day.services.map((service) => ({
			kind: service.kind,
			label: t(service.kind === 'lunch' ? 'events.lunch' : 'events.dinner'),
			price: servicePrice(service.priceAmount, service.currency),
			priced: service.priceAmount !== null && service.priceAmount > 0,
			depositNote: depositNote(service.priceAmount, service.currency),
			// Listed in time order: badges other than VIP and Limited are not shown.
			seatings: service.sessions
				.toSorted((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
				.map((s) => {
					const state = seatingStateOf(s);
					const own = localizedText(s.titleEn, s.titleFr, lang);
					return {
						seating: s,
						id: s.id,
						start: formatSeatingTime(s.startTime, zone, lang),
						end: formatSeatingTime(s.endTime, zone, lang),
						title: own && own !== derivedSeatingTitle(s.startTime, { timeZone: zone }, lang) ? own : null,
						description: localizedText(s.descriptionEn, s.descriptionFr, lang),
						vip: s.badgeType === 'vip',
						state,
						status: seatingStatus(t, state, s, zone, lang),
						bookable: state === 'open' || state === 'limited',
					};
				}),
		})),
	}));

	const services = days.flatMap((day) => day.services);
	const seatings = services.flatMap((service) => service.seatings);

	// One Menu served at several Services is shown once.
	const menus: MenuView[] = [];
	for (const [d, day] of schedule.entries()) {
		for (const [s, service] of day.services.entries()) {
			if (!service.menu) continue;
			const name = localizedText(service.menu.nameEn, service.menu.nameFr, lang);
			const courses = service.menu.courses.map((course) => ({
				label: localizedText(course.labelEn, course.labelFr, lang),
				dish: localizedText(course.dishEn, course.dishFr, lang),
			}));
			const note = localizedText(service.menu.descriptionEn, service.menu.descriptionFr, lang);
			const where = `${days[d].services[s].label} · ${formatDayKey(day.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}`;
			const same = menus.find(
				(menu) => menu.name === name && menu.note === note && JSON.stringify(menu.courses) === JSON.stringify(courses)
			);
			if (same) same.services.push(where);
			else menus.push({ name, courses, note, services: [where] });
		}
	}

	const upcoming = seatings.filter((s) => s.state !== 'past');
	const firstNotOpen = upcoming.find((s) => s.state === 'not-open');
	const summary: BookingSummary = seatings.some((s) => s.bookable)
		? 'open'
		: firstNotOpen
			? 'not-open'
			: upcoming.some((s) => s.state === 'waitlist')
				? 'waitlist'
				: upcoming.length === 0
					? 'past'
					: upcoming.every((s) => s.state === 'full')
						? 'full'
						: upcoming.every((s) => s.state === 'closed')
							? 'closed'
							: 'unpriced';
	const summaryLabel = {
		open: t('events.page.book'),
		'not-open': firstNotOpen?.status ?? '',
		waitlist: t('events.page.summary.waitlist'),
		full: t('events.page.seating.full'),
		closed: t('booking.bookingClosed'),
		past: t('events.page.summary.past'),
		unpriced: t('events.priceToBeAnnounced'),
	}[summary];

	const refund = describeRefundPolicy(refundPolicy, lang, { fullPayment: isFullPayment(deposit) });

	return {
		lang,
		title: text(lang, event, 'title'),
		subtitle: text(lang, event, 'subtitle'),
		description: paragraphsOf(text(lang, event, 'description')),
		venueLines: venueLinesOf(event, lang),
		venueName: text(lang, event, 'venueName') || text(lang, event, 'location'),
		place: [text(lang, event, 'district'), text(lang, event, 'city')].filter(Boolean).join(', '),
		credits: creditsOf(event.collaborators as string | null),
		timings: timingsOf(event.timings as string | null),
		curator: text(lang, event, 'curator'),
		admission: text(lang, event, 'admissionInfo'),
		dates: formatProjectDates(
			days.map((day) => day.date),
			lang
		),
		priceLine: priceLineOf(schedule, lang, t),
		days,
		menus,
		summary,
		summaryLabel,
		/** Under the Seatings: what is paid when, the Refund Policy, the dietary question. */
		conditions: [
			services.find((service) => service.depositNote)?.depositNote ?? '',
			refund ?? '',
			event.askDietaryRequirements ? t('events.page.dietaryNote') : '',
		].filter(Boolean),
		deposit,
		refundPolicy,
	};
}

export type EventPage = ReturnType<typeof eventPage>;

/** The Event's price in one line: « 85 € par convive », « À partir de 45 € », « Gratuit, sur réservation ». */
export function priceLineOf(schedule: PageDay[], lang: EventTimeLocale, t: Translate): string {
	const priced = schedule.flatMap((day) => day.services).filter((service) => service.priceAmount !== null);
	if (priced.length === 0) return t('events.priceToBeAnnounced');
	const amounts = new Set(priced.map((service) => service.priceAmount as number));
	const lowest = Math.min(...amounts);
	if (lowest === 0 && amounts.size === 1) return t('events.page.price.freeBooking');
	const amount = formatPrice(lowest, priced[0].currency, lang);
	return t(amounts.size === 1 ? 'events.page.price.each' : 'events.page.price.from', { values: { amount } });
}

/** The Portfolio project: the Recap and the Event Photos, credits, dates and venue. */
export function projectPage(project: Localized & { days?: string[] | null }, locale: string | null | undefined) {
	const lang = pageLang(locale);
	return {
		lang,
		title: text(lang, project, 'title'),
		recap: paragraphsOf(text(lang, project, 'recap')),
		dates: formatProjectDates(project.days ?? [], lang),
		city: text(lang, project, 'city') || text(lang, project, 'location'),
		venueLines: venueLinesOf(project, lang),
		curator: text(lang, project, 'curator'),
		credits: creditsOf(project.collaborators as string | null),
	};
}
