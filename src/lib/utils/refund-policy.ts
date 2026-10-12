/**
 * Refund Policy (issue 027) — pure and client-safe: the server (the admin
 * cancel pre-fill of issue 028), the admin preview and the public pages
 * (booking step, Ticket) all read it.
 *
 * An Event's Refund Policy is either
 * - **manual**: a free-text statement (EN/FR); every refund is decided by
 *   an Admin, so the module answers "manual";
 * - **rules**: one or more tiers `{ hoursBefore, percent }` — "cancel at
 *   least `hoursBefore` hours before the Seating starts and get `percent` %
 *   of the Deposit back".
 *
 * Tier semantics (exact):
 * - Let `left` be the time from the cancellation to the Seating's start.
 *   The applicable tier is the one with the **largest** `hoursBefore` such
 *   that `left >= hoursBefore` hours — a window's edge belongs to it:
 *   cancelling exactly 48 h before falls in a "≥ 48 h → 100 %" tier.
 * - Closer to the Seating than the smallest `hoursBefore`: 0 %.
 * - A tier at `hoursBefore` 0 runs until the Seating starts (a
 *   cancellation at the very start time still gets it).
 * - Once the Seating has started (cancellation strictly after its start):
 *   0 %, whatever the tiers.
 * - Tiers are kept sorted by `hoursBefore`, largest first, with distinct
 *   windows and strictly decreasing percentages (a refund never grows as
 *   the Seating approaches), 1 to {@link MAX_TIERS} of them.
 *
 * Presets are plain tiers: "refundable until N hours before" is
 * `[{ N, 100 }]`, "always refundable" `[{ 0, 100 }]` (until the Seating
 * starts) and "never refundable" `[{ 0, 0 }]`.
 *
 * When Germinal cancels (a Seating or an Event), the policy is bypassed and
 * the whole Deposit is refunded — manual policy included.
 *
 * Percentage refunds are rounded to the cent half-up, exactly as the
 * Pricing module rounds Deposits ({@link percentOf}).
 */

import { percentOf } from './pricing';

export const REFUND_POLICY_TYPES = ['manual', 'rules'] as const;
export type RefundPolicyType = (typeof REFUND_POLICY_TYPES)[number];

/** Refund `percent` % (whole, 0..100) of the Deposit when cancelling at
 * least `hoursBefore` (whole hours, ≥ 0) before the Seating starts. */
export interface RefundTier {
	hoursBefore: number;
	percent: number;
}

/**
 * An Event's Refund Policy. Both the manual texts and the tiers are kept
 * whatever the type, so switching type in the admin loses nothing; only the
 * ones matching `type` apply.
 */
export interface RefundPolicy {
	type: RefundPolicyType;
	/** Manual policy statement, shown to English-speaking guests. */
	textEn: string | null;
	/** Manual policy statement, shown to French-speaking guests. */
	textFr: string | null;
	/** Rule-based tiers, largest window first (see the module comment). */
	tiers: RefundTier[];
}

/** At most this many tiers per policy. */
export const MAX_TIERS = 10;
/** Longest window a tier may have: one year, in hours. */
export const MAX_HOURS_BEFORE = 24 * 365;
/** Longest manual statement, per language. */
export const MAX_REFUND_POLICY_TEXT = 2000;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Full refund until `hours` before the Seating, nothing afterwards. */
export function refundableUntilTiers(hours: number): RefundTier[] {
	return [{ hoursBefore: hours, percent: 100 }];
}

/** Full refund until the Seating starts. */
export const ALWAYS_REFUNDABLE_TIERS: readonly RefundTier[] = Object.freeze([{ hoursBefore: 0, percent: 100 }]);

/** No refund, ever (except when Germinal cancels). */
export const NEVER_REFUNDABLE_TIERS: readonly RefundTier[] = Object.freeze([{ hoursBefore: 0, percent: 0 }]);

export type RefundPreset = 'always' | 'never' | 'until' | 'custom';

/** Which preset a set of (valid) tiers is, or `custom`. */
export function presetOf(tiers: readonly RefundTier[]): RefundPreset {
	if (tiers.length !== 1) return 'custom';
	const [tier] = tiers;
	if (tier.percent === 0 && tier.hoursBefore === 0) return 'never';
	if (tier.percent === 100) return tier.hoursBefore === 0 ? 'always' : 'until';
	return 'custom';
}

/**
 * The policy new Events get: full refund until 24 hours before the Seating
 * — the window in which guests can already cancel from their Ticket.
 */
export const DEFAULT_REFUND_POLICY: RefundPolicy = Object.freeze({
	type: 'rules',
	textEn: null,
	textFr: null,
	tiers: refundableUntilTiers(24),
}) as RefundPolicy;

/** A manual policy with no text: what an Event without one (mock data)
 * gets — nothing is shown to the guest. */
export const EMPTY_MANUAL_REFUND_POLICY: RefundPolicy = Object.freeze({
	type: 'manual',
	textEn: null,
	textFr: null,
	tiers: [],
}) as RefundPolicy;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The tiers sorted largest window first (a new array). */
export function sortTiers(tiers: readonly RefundTier[]): RefundTier[] {
	return [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
}

/**
 * Validate tiers in any order: 1..{@link MAX_TIERS} of them, whole hours in
 * 0..{@link MAX_HOURS_BEFORE}, whole percentages in 0..100, distinct
 * windows, and percentages strictly decreasing as the Seating approaches.
 * Returns them sorted largest window first, or null when invalid.
 */
export function validateTiers(tiers: unknown): RefundTier[] | null {
	if (!Array.isArray(tiers) || tiers.length === 0 || tiers.length > MAX_TIERS) return null;
	const parsed: RefundTier[] = [];
	for (const entry of tiers) {
		if (typeof entry !== 'object' || entry === null) return null;
		const { hoursBefore, percent } = entry as Record<string, unknown>;
		if (
			!Number.isInteger(hoursBefore) ||
			(hoursBefore as number) < 0 ||
			(hoursBefore as number) > MAX_HOURS_BEFORE ||
			!Number.isInteger(percent) ||
			(percent as number) < 0 ||
			(percent as number) > 100
		) {
			return null;
		}
		parsed.push({ hoursBefore: hoursBefore as number, percent: percent as number });
	}
	const sorted = sortTiers(parsed);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].hoursBefore === sorted[i - 1].hoursBefore) return null;
		if (sorted[i].percent >= sorted[i - 1].percent) return null;
	}
	return sorted;
}

/** Whether a policy is one the database and the admin accept. */
export function isValidRefundPolicy(policy: RefundPolicy): boolean {
	if (!(REFUND_POLICY_TYPES as readonly string[]).includes(policy.type)) return false;
	for (const text of [policy.textEn, policy.textFr]) {
		if (text !== null && (typeof text !== 'string' || text.length > MAX_REFUND_POLICY_TEXT)) return false;
	}
	if (policy.type === 'rules') return validateTiers(policy.tiers) !== null;
	// A manual policy may keep earlier tiers (or none); kept ones stay valid.
	return policy.tiers.length === 0 || validateTiers(policy.tiers) !== null;
}

/**
 * An Event's Refund Policy from its `refundPolicy*` columns. An Event
 * without them (mock data) gets an empty manual policy: nothing shown,
 * every refund decided by hand.
 */
export function refundPolicyOf(event: object): RefundPolicy {
	const { refundPolicyType, refundPolicyTextEn, refundPolicyTextFr, refundPolicyTiers } = event as {
		refundPolicyType?: unknown;
		refundPolicyTextEn?: unknown;
		refundPolicyTextFr?: unknown;
		refundPolicyTiers?: unknown;
	};
	if (typeof refundPolicyType !== 'string' || !(REFUND_POLICY_TYPES as readonly string[]).includes(refundPolicyType)) {
		return EMPTY_MANUAL_REFUND_POLICY;
	}
	const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null);
	return {
		type: refundPolicyType as RefundPolicyType,
		textEn: text(refundPolicyTextEn),
		textFr: text(refundPolicyTextFr),
		tiers: validateTiers(refundPolicyTiers) ?? [],
	};
}

// ---------------------------------------------------------------------------
// The refund for a cancellation
// ---------------------------------------------------------------------------

/** Why a rule-based refund is what it is. */
export type RefundBasis =
	/** Germinal cancelled: the whole Deposit, whatever the policy. */
	| { type: 'germinal' }
	/** The cancellation falls in this tier's window. */
	| { type: 'tier'; tier: RefundTier }
	/** Closer to the Seating than every tier's window: nothing. */
	| { type: 'too-late' }
	/** The Seating had already started: nothing. */
	| { type: 'started' };

export type RefundDecision =
	/** A manual policy: an Admin decides the amount. */
	| { kind: 'manual' }
	/** `amount` in minor units, `percent` of the Deposit it represents. */
	| { kind: 'refund'; amount: number; percent: number; basis: RefundBasis };

const HOUR_MS = 3_600_000;

/**
 * The refund a cancellation gets under a Refund Policy.
 * - `deposit`: the Deposit paid online, minor units (what can be refunded);
 * - `cancelledBy`: `germinal` bypasses the policy and refunds it all.
 * A rule-based policy without valid tiers is treated as manual.
 */
export function refundFor(input: {
	policy: RefundPolicy;
	seatingStart: Date;
	cancelledAt: Date;
	deposit: number;
	cancelledBy?: 'guest' | 'germinal';
}): RefundDecision {
	const deposit = Math.max(0, input.deposit);
	if (input.cancelledBy === 'germinal') {
		return { kind: 'refund', amount: deposit, percent: 100, basis: { type: 'germinal' } };
	}
	if (input.policy.type === 'manual') return { kind: 'manual' };
	const tiers = validateTiers(input.policy.tiers);
	if (!tiers) return { kind: 'manual' };

	const leftMs = input.seatingStart.getTime() - input.cancelledAt.getTime();
	if (leftMs < 0) {
		return { kind: 'refund', amount: 0, percent: 0, basis: { type: 'started' } };
	}
	// Largest window first: the first tier whose window contains `left`.
	const tier = tiers.find((candidate) => leftMs >= candidate.hoursBefore * HOUR_MS);
	if (!tier) {
		return { kind: 'refund', amount: 0, percent: 0, basis: { type: 'too-late' } };
	}
	return {
		kind: 'refund',
		amount: percentOf(deposit, tier.percent),
		percent: tier.percent,
		basis: { type: 'tier', tier },
	};
}

// ---------------------------------------------------------------------------
// The policy in plain words
// ---------------------------------------------------------------------------

export type RefundLocale = 'en' | 'fr';

const NBSP = ' ';

/** A window in hours, as days when it is a whole number of days. */
export function formatRefundWindow(hours: number, locale: RefundLocale): string {
	if (hours > 0 && hours % 24 === 0) {
		const days = hours / 24;
		if (locale === 'fr') return `${days}${NBSP}jour${days > 1 ? 's' : ''}`;
		return `${days} day${days > 1 ? 's' : ''}`;
	}
	if (locale === 'fr') return `${hours}${NBSP}h`;
	return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function percentLabel(percent: number, locale: RefundLocale): string {
	return locale === 'fr' ? `${percent}${NBSP}%` : `${percent}%`;
}

/**
 * Describe a rule-based policy's tiers in one sentence, e.g.
 * "Full refund of the deposit up to 48 hours before the seating, 50% up to
 * 24 hours, no refund after that." `fullPayment`: the guest pays the whole
 * price online, so the refund is "of your payment" rather than "of the
 * deposit". Returns null when the tiers are invalid.
 */
export function describeRefundTiers(
	tiers: readonly RefundTier[],
	locale: RefundLocale,
	options: { fullPayment?: boolean } = {}
): string | null {
	const sorted = validateTiers(tiers);
	if (!sorted) return null;
	const fr = locale === 'fr';
	const full = options.fullPayment === true;

	// Percentages strictly decrease, so a 0 % tier can only be the last one.
	const refunding = sorted.filter((tier) => tier.percent > 0);
	if (refunding.length === 0) {
		if (fr) return full ? 'Votre paiement n’est pas remboursable.' : 'L’acompte n’est pas remboursable.';
		return full ? 'Your payment is non-refundable.' : 'The deposit is non-refundable.';
	}

	const noun = fr ? (full ? 'de votre paiement' : 'de l’acompte') : full ? 'your payment' : 'the deposit';
	const untilStart = fr ? 'jusqu’au début de la séance' : 'until the seating starts';

	const parts = refunding.map((tier, index) => {
		const window = formatRefundWindow(tier.hoursBefore, locale);
		if (index === 0) {
			const amount = fr
				? tier.percent === 100 ? `Remboursement intégral ${noun}` : `Remboursement de ${percentLabel(tier.percent, locale)} ${noun}`
				: tier.percent === 100 ? `Full refund of ${noun}` : `${percentLabel(tier.percent, locale)} of ${noun} refunded`;
			const when = tier.hoursBefore === 0
				? untilStart
				: fr ? `jusqu’à ${window} avant la séance` : `up to ${window} before the seating`;
			return `${amount} ${when}`;
		}
		const when = tier.hoursBefore === 0 ? untilStart : fr ? `jusqu’à ${window}` : `up to ${window}`;
		return `${percentLabel(tier.percent, locale)} ${when}`;
	});
	// Past the last refunding window nothing is refunded; a window running
	// until the Seating starts needs no such tail.
	if (refunding[refunding.length - 1].hoursBefore > 0) {
		parts.push(fr ? 'aucun remboursement ensuite' : 'no refund after that');
	}
	return `${parts.join(', ')}.`;
}

/**
 * The policy as the guest reads it, in their locale: the manual statement
 * (falling back to the other language when theirs is empty) or the tiers in
 * plain words. Null when there is nothing to show (a manual policy with no
 * text at all).
 */
export function describeRefundPolicy(
	policy: RefundPolicy,
	locale: RefundLocale,
	options: { fullPayment?: boolean } = {}
): string | null {
	if (policy.type === 'manual') {
		const [own, other] = locale === 'fr' ? [policy.textFr, policy.textEn] : [policy.textEn, policy.textFr];
		const text = own?.trim() || other?.trim();
		return text ? text : null;
	}
	return describeRefundTiers(policy.tiers, locale, options);
}
