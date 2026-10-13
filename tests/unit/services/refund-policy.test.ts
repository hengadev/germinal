import { describe, it, expect } from 'vitest';
import {
	ALWAYS_REFUNDABLE_TIERS,
	DEFAULT_REFUND_POLICY,
	EMPTY_MANUAL_REFUND_POLICY,
	MAX_HOURS_BEFORE,
	MAX_TIERS,
	NEVER_REFUNDABLE_TIERS,
	describeRefundPolicy,
	describeRefundTiers,
	formatRefundWindow,
	isValidRefundPolicy,
	presetOf,
	refundFor,
	refundPolicyOf,
	refundableUntilTiers,
	validateTiers,
	type RefundPolicy,
	type RefundTier,
} from '../../../src/lib/utils/refund-policy';

const NBSP = ' ';
const HOUR = 3_600_000;
const SEATING = new Date('2026-11-20T19:30:00Z');

/** A cancellation `hours` before the Seating (negative: after it started). */
const before = (hours: number) => new Date(SEATING.getTime() - hours * HOUR);

function rules(tiers: readonly RefundTier[]): RefundPolicy {
	return { type: 'rules', textEn: null, textFr: null, tiers: [...tiers] };
}

function refund(policy: RefundPolicy, cancelledAt: Date, deposit = 4000, cancelledBy?: 'guest' | 'germinal') {
	return refundFor({ policy, seatingStart: SEATING, cancelledAt, deposit, cancelledBy });
}

const TWO_TIERS = rules([
	{ hoursBefore: 48, percent: 100 },
	{ hoursBefore: 24, percent: 50 },
]);

describe('refundFor — presets', () => {
	it('"refundable until 48 h before": everything at 48 h or more, nothing after', () => {
		const policy = rules(refundableUntilTiers(48));
		expect(refund(policy, before(72))).toEqual({
			kind: 'refund', amount: 4000, percent: 100, basis: { type: 'tier', tier: { hoursBefore: 48, percent: 100 } },
		});
		expect(refund(policy, before(47))).toEqual({ kind: 'refund', amount: 0, percent: 0, basis: { type: 'too-late' } });
	});

	it('"always refundable": everything until the Seating starts, exactly at the start included', () => {
		const policy = rules(ALWAYS_REFUNDABLE_TIERS);
		expect(refund(policy, before(500))).toMatchObject({ amount: 4000, percent: 100 });
		expect(refund(policy, before(0.01))).toMatchObject({ amount: 4000, percent: 100 });
		expect(refund(policy, SEATING)).toMatchObject({ amount: 4000, percent: 100 });
	});

	it('"never refundable": nothing, however early', () => {
		const policy = rules(NEVER_REFUNDABLE_TIERS);
		expect(refund(policy, before(1000))).toEqual({
			kind: 'refund', amount: 0, percent: 0, basis: { type: 'tier', tier: { hoursBefore: 0, percent: 0 } },
		});
	});

	it('recognises each preset from its tiers', () => {
		expect(presetOf(ALWAYS_REFUNDABLE_TIERS)).toBe('always');
		expect(presetOf(NEVER_REFUNDABLE_TIERS)).toBe('never');
		expect(presetOf(refundableUntilTiers(72))).toBe('until');
		expect(presetOf(TWO_TIERS.tiers)).toBe('custom');
		expect(presetOf([{ hoursBefore: 24, percent: 50 }])).toBe('custom');
	});
});

describe('refundFor — custom tiers and their boundaries', () => {
	it('applies the tier whose window contains the cancellation', () => {
		expect(refund(TWO_TIERS, before(100))).toMatchObject({ amount: 4000, percent: 100 });
		expect(refund(TWO_TIERS, before(30))).toMatchObject({
			amount: 2000, percent: 50, basis: { type: 'tier', tier: { hoursBefore: 24, percent: 50 } },
		});
		expect(refund(TWO_TIERS, before(2))).toMatchObject({ amount: 0, percent: 0, basis: { type: 'too-late' } });
	});

	it('counts a cancellation exactly at a tier edge in that tier', () => {
		expect(refund(TWO_TIERS, before(48))).toMatchObject({ percent: 100 });
		expect(refund(TWO_TIERS, before(24))).toMatchObject({ percent: 50 });
	});

	it('drops to the next tier one millisecond past an edge', () => {
		const justAfter48 = new Date(before(48).getTime() + 1);
		const justAfter24 = new Date(before(24).getTime() + 1);
		expect(refund(TWO_TIERS, justAfter48)).toMatchObject({ percent: 50 });
		expect(refund(TWO_TIERS, justAfter24)).toMatchObject({ percent: 0, basis: { type: 'too-late' } });
	});

	it('accepts tiers in any order', () => {
		const reversed = rules([...TWO_TIERS.tiers].reverse());
		expect(refund(reversed, before(30))).toMatchObject({ percent: 50 });
		expect(refund(reversed, before(60))).toMatchObject({ percent: 100 });
	});
});

describe('refundFor — after the Seating started, manual policy, Germinal', () => {
	it('refunds nothing once the Seating has started, whatever the tiers', () => {
		for (const tiers of [ALWAYS_REFUNDABLE_TIERS, TWO_TIERS.tiers]) {
			expect(refund(rules(tiers), new Date(SEATING.getTime() + 1))).toEqual({
				kind: 'refund', amount: 0, percent: 0, basis: { type: 'started' },
			});
		}
	});

	it('leaves a manual policy to the Admin', () => {
		const manual: RefundPolicy = { type: 'manual', textEn: 'Ask us', textFr: 'Contactez-nous', tiers: [] };
		expect(refund(manual, before(100))).toEqual({ kind: 'manual' });
		expect(refund(manual, before(-5))).toEqual({ kind: 'manual' });
		// Tiers kept from an earlier rule-based setting do not apply.
		expect(refund({ ...manual, tiers: refundableUntilTiers(24) }, before(100))).toEqual({ kind: 'manual' });
	});

	it('treats a rule-based policy without valid tiers as manual', () => {
		expect(refund(rules([]), before(100))).toEqual({ kind: 'manual' });
	});

	it('refunds the whole Deposit when Germinal cancels, bypassing any policy', () => {
		const expected = { kind: 'refund', amount: 4000, percent: 100, basis: { type: 'germinal' } };
		expect(refund(rules(NEVER_REFUNDABLE_TIERS), before(1), 4000, 'germinal')).toEqual(expected);
		expect(refund(EMPTY_MANUAL_REFUND_POLICY, before(1), 4000, 'germinal')).toEqual(expected);
		expect(refund(TWO_TIERS, before(-3), 4000, 'germinal')).toEqual(expected);
	});

	it('refunds nothing on a zero Deposit', () => {
		expect(refund(TWO_TIERS, before(100), 0)).toMatchObject({ amount: 0, percent: 100 });
		expect(refund(TWO_TIERS, before(100), 0, 'germinal')).toMatchObject({ amount: 0 });
	});
});

describe('refundFor — rounding', () => {
	it('rounds a percentage refund to the cent, half-up', () => {
		const half = rules([{ hoursBefore: 24, percent: 50 }]);
		expect(refund(half, before(30), 105)).toMatchObject({ amount: 53 });
		expect(refund(half, before(30), 101)).toMatchObject({ amount: 51 });
		const third = rules([{ hoursBefore: 24, percent: 33 }]);
		expect(refund(third, before(30), 1000)).toMatchObject({ amount: 330 });
		expect(refund(third, before(30), 1001)).toMatchObject({ amount: 330 }); // 330.33
		expect(refund(third, before(30), 1015)).toMatchObject({ amount: 335 }); // 334.95
	});
});

describe('validateTiers', () => {
	it('sorts valid tiers largest window first', () => {
		expect(validateTiers([{ hoursBefore: 24, percent: 50 }, { hoursBefore: 168, percent: 100 }, { hoursBefore: 2, percent: 0 }]))
			.toEqual([{ hoursBefore: 168, percent: 100 }, { hoursBefore: 24, percent: 50 }, { hoursBefore: 2, percent: 0 }]);
	});

	it('refuses malformed tiers', () => {
		const tooMany = Array.from({ length: MAX_TIERS + 1 }, (_, i) => ({ hoursBefore: (MAX_TIERS - i) * 10, percent: 100 - i }));
		for (const tiers of [
			[],
			null,
			'48',
			tooMany,
			[{ hoursBefore: -1, percent: 100 }],
			[{ hoursBefore: 1.5, percent: 100 }],
			[{ hoursBefore: MAX_HOURS_BEFORE + 1, percent: 100 }],
			[{ hoursBefore: 24, percent: 101 }],
			[{ hoursBefore: 24, percent: 12.5 }],
			[{ hoursBefore: '24', percent: 100 }],
			[{ hoursBefore: 24, percent: 100 }, { hoursBefore: 24, percent: 50 }],
			// A refund never grows (nor stays equal) as the Seating approaches.
			[{ hoursBefore: 48, percent: 50 }, { hoursBefore: 24, percent: 100 }],
			[{ hoursBefore: 48, percent: 50 }, { hoursBefore: 24, percent: 50 }],
		]) {
			expect(validateTiers(tiers)).toBeNull();
		}
	});

	it('validates whole policies', () => {
		expect(isValidRefundPolicy(DEFAULT_REFUND_POLICY)).toBe(true);
		expect(isValidRefundPolicy(EMPTY_MANUAL_REFUND_POLICY)).toBe(true);
		expect(isValidRefundPolicy(rules([]))).toBe(false);
		expect(isValidRefundPolicy({ ...EMPTY_MANUAL_REFUND_POLICY, textFr: 'x'.repeat(2001) })).toBe(false);
		expect(isValidRefundPolicy({ ...EMPTY_MANUAL_REFUND_POLICY, type: 'other' as 'manual' })).toBe(false);
	});
});

describe('refundPolicyOf', () => {
	it('reads an Event’s columns', () => {
		expect(refundPolicyOf({
			refundPolicyType: 'rules',
			refundPolicyTextEn: '  ',
			refundPolicyTextFr: 'Texte',
			refundPolicyTiers: [{ hoursBefore: 24, percent: 50 }, { hoursBefore: 48, percent: 100 }],
		})).toEqual({
			type: 'rules',
			textEn: null,
			textFr: 'Texte',
			tiers: [{ hoursBefore: 48, percent: 100 }, { hoursBefore: 24, percent: 50 }],
		});
	});

	it('gives an Event without a policy (mock data) an empty manual policy', () => {
		expect(refundPolicyOf({})).toEqual(EMPTY_MANUAL_REFUND_POLICY);
	});

	it('defaults new Events to a full refund until 24 hours before', () => {
		expect(DEFAULT_REFUND_POLICY).toMatchObject({ type: 'rules', tiers: [{ hoursBefore: 24, percent: 100 }] });
	});
});

describe('the policy in plain words', () => {
	it('formats windows in hours, or days when divisible by 24', () => {
		expect(formatRefundWindow(1, 'en')).toBe('1 hour');
		expect(formatRefundWindow(36, 'en')).toBe('36 hours');
		expect(formatRefundWindow(24, 'en')).toBe('1 day');
		expect(formatRefundWindow(168, 'en')).toBe('7 days');
		expect(formatRefundWindow(48, 'fr')).toBe(`2${NBSP}jours`);
		expect(formatRefundWindow(24, 'fr')).toBe(`1${NBSP}jour`);
		expect(formatRefundWindow(36, 'fr')).toBe(`36${NBSP}h`);
	});

	it('describes several tiers', () => {
		const tiers = [{ hoursBefore: 36, percent: 100 }, { hoursBefore: 12, percent: 50 }];
		expect(describeRefundTiers(tiers, 'fr')).toBe(
			`Remboursement intégral de l’acompte jusqu’à 36${NBSP}h avant la séance, 50${NBSP}% jusqu’à 12${NBSP}h, aucun remboursement ensuite.`
		);
		expect(describeRefundTiers(tiers, 'en')).toBe(
			'Full refund of the deposit up to 36 hours before the seating, 50% up to 12 hours, no refund after that.'
		);
		expect(describeRefundTiers(TWO_TIERS.tiers, 'en')).toBe(
			'Full refund of the deposit up to 2 days before the seating, 50% up to 1 day, no refund after that.'
		);
	});

	it('describes each preset', () => {
		expect(describeRefundTiers(refundableUntilTiers(168), 'fr')).toBe(
			`Remboursement intégral de l’acompte jusqu’à 7${NBSP}jours avant la séance, aucun remboursement ensuite.`
		);
		expect(describeRefundTiers(refundableUntilTiers(168), 'en')).toBe(
			'Full refund of the deposit up to 7 days before the seating, no refund after that.'
		);
		expect(describeRefundTiers(ALWAYS_REFUNDABLE_TIERS, 'en')).toBe('Full refund of the deposit until the seating starts.');
		expect(describeRefundTiers(ALWAYS_REFUNDABLE_TIERS, 'fr')).toBe('Remboursement intégral de l’acompte jusqu’au début de la séance.');
		expect(describeRefundTiers(NEVER_REFUNDABLE_TIERS, 'en')).toBe('The deposit is non-refundable.');
		expect(describeRefundTiers(NEVER_REFUNDABLE_TIERS, 'fr')).toBe('L’acompte n’est pas remboursable.');
	});

	it('describes a partial first tier, a tier running until the start and an explicit 0 % tier', () => {
		expect(describeRefundTiers([{ hoursBefore: 72, percent: 80 }, { hoursBefore: 0, percent: 30 }], 'en')).toBe(
			'80% of the deposit refunded up to 3 days before the seating, 30% until the seating starts.'
		);
		expect(describeRefundTiers([{ hoursBefore: 72, percent: 80 }, { hoursBefore: 6, percent: 0 }], 'fr')).toBe(
			`Remboursement de 80${NBSP}% de l’acompte jusqu’à 3${NBSP}jours avant la séance, aucun remboursement ensuite.`
		);
	});

	it('speaks of the payment rather than a deposit when the whole price is paid online', () => {
		expect(describeRefundTiers(refundableUntilTiers(24), 'en', { fullPayment: true })).toBe(
			'Full refund of your payment up to 1 day before the seating, no refund after that.'
		);
		expect(describeRefundTiers(NEVER_REFUNDABLE_TIERS, 'fr', { fullPayment: true })).toBe('Votre paiement n’est pas remboursable.');
	});

	it('shows a manual statement in the guest’s language, falling back to the other one', () => {
		const manual: RefundPolicy = { type: 'manual', textEn: 'Refunds on request.', textFr: 'Remboursement sur demande.', tiers: [] };
		expect(describeRefundPolicy(manual, 'en')).toBe('Refunds on request.');
		expect(describeRefundPolicy(manual, 'fr')).toBe('Remboursement sur demande.');
		expect(describeRefundPolicy({ ...manual, textFr: null }, 'fr')).toBe('Refunds on request.');
		expect(describeRefundPolicy({ ...manual, textEn: '   ' }, 'en')).toBe('Remboursement sur demande.');
		expect(describeRefundPolicy(EMPTY_MANUAL_REFUND_POLICY, 'en')).toBeNull();
	});

	it('describes a rule-based policy through its tiers', () => {
		expect(describeRefundPolicy(DEFAULT_REFUND_POLICY, 'fr')).toBe(
			`Remboursement intégral de l’acompte jusqu’à 1${NBSP}jour avant la séance, aucun remboursement ensuite.`
		);
		expect(describeRefundPolicy(rules([]), 'en')).toBeNull();
	});
});
