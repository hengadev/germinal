import { describe, it, expect } from 'vitest';
import {
	cancellationPreFill,
	describeCancellationRefundFr,
	formatTimeLeftFr,
	guestCancellationTerms,
	refundableAmount,
	suggestCancellationRefund,
} from '../../../src/lib/utils/cancellation-refund';
import type { RefundPolicy } from '../../../src/lib/utils/refund-policy';

const NBSP = '\u00a0';
const HOUR = 3_600_000;
const seatingStart = new Date('2099-06-01T19:00:00Z');
const hoursBefore = (h: number) => new Date(seatingStart.getTime() - h * HOUR);

const rules = (tiers: RefundPolicy['tiers']): RefundPolicy => ({ type: 'rules', textEn: null, textFr: null, tiers });
const tiered = rules([
	{ hoursBefore: 48, percent: 100 },
	{ hoursBefore: 24, percent: 50 },
]);
const manual: RefundPolicy = {
	type: 'manual',
	textEn: 'Contact us.',
	textFr: 'Contactez-nous.',
	tiers: [],
};

describe('refundableAmount', () => {
	it('is the Deposit paid minus what was already refunded', () => {
		expect(refundableAmount({ amount: 4000, refundedAmount: null, status: 'succeeded' })).toBe(4000);
		expect(refundableAmount({ amount: 4000, refundedAmount: 1500, status: 'partially_refunded' })).toBe(2500);
	});

	it('is nothing without a payment that went through', () => {
		expect(refundableAmount(null)).toBe(0);
		expect(refundableAmount(undefined)).toBe(0);
		expect(refundableAmount({ amount: 4000, refundedAmount: null, status: 'pending' })).toBe(0);
		expect(refundableAmount({ amount: 4000, refundedAmount: 4000, status: 'refunded' })).toBe(0);
	});
});

describe('formatTimeLeftFr', () => {
	it('speaks minutes, hours, then days', () => {
		expect(formatTimeLeftFr(45 * 60_000)).toBe(`45${NBSP}min`);
		expect(formatTimeLeftFr(31 * HOUR + 59 * 60_000)).toBe(`31${NBSP}h`);
		expect(formatTimeLeftFr(71 * HOUR)).toBe(`71${NBSP}h`);
		expect(formatTimeLeftFr(5 * 24 * HOUR + 3 * HOUR)).toBe(`5${NBSP}jours`);
		expect(formatTimeLeftFr(-HOUR)).toBe(`0${NBSP}min`);
	});
});

describe('describeCancellationRefundFr', () => {
	const reason = (policy: RefundPolicy, cancelledAt: Date, cancelledBy: 'guest' | 'germinal' = 'guest') =>
		describeCancellationRefundFr(
			suggestCancellationRefund({ policy, seatingStart, cancelledAt, refundable: 4000, cancelledBy }),
			{ seatingStart, cancelledAt }
		);

	it('names the tier applied and the time left', () => {
		expect(reason(tiered, hoursBefore(31))).toBe(
			`Palier appliqué : 50${NBSP}% jusqu’à 24${NBSP}h avant la séance — il reste 31${NBSP}h`
		);
		expect(reason(tiered, hoursBefore(100))).toBe(
			`Palier appliqué : 100${NBSP}% jusqu’à 48${NBSP}h avant la séance — il reste 4${NBSP}jours`
		);
	});

	it('names a tier running until the Seating starts', () => {
		expect(reason(rules([{ hoursBefore: 0, percent: 100 }]), hoursBefore(2))).toBe(
			`Palier appliqué : 100${NBSP}% jusqu’au début de la séance — il reste 2${NBSP}h`
		);
	});

	it('says when it is too late, or the Seating has started', () => {
		expect(reason(tiered, hoursBefore(3))).toBe(
			`Trop tard pour un remboursement selon la politique — il reste 3${NBSP}h`
		);
		expect(reason(tiered, hoursBefore(-1))).toBe('Séance déjà commencée : aucun remboursement selon la politique');
	});

	it('says a Germinal cancellation refunds the whole Deposit', () => {
		expect(reason(manual, hoursBefore(-1), 'germinal')).toBe(
			'Annulé par Germinal : remboursement intégral de l’acompte'
		);
	});

	it('says a manual policy leaves the amount to the Admin', () => {
		expect(reason(manual, hoursBefore(31))).toBe('Politique manuelle : le montant du remboursement est à décider');
	});
});

describe('cancellationPreFill', () => {
	it('suggests the tier amount for a guest request, everything for Germinal', () => {
		const prefill = cancellationPreFill({ policy: tiered, seatingStart, now: hoursBefore(31), refundable: 4000 });
		expect(prefill).toMatchObject({
			refundable: 4000,
			policyType: 'rules',
			suggestedAmount: 2000,
			germinalAmount: 4000,
		});
		expect(prefill.suggestedReasonFr).toContain('50');
		expect(prefill.germinalReasonFr).toContain('Annulé par Germinal');
		expect(prefill.policyTextFr).toContain('Remboursement intégral');
	});

	it('suggests nothing for a manual policy and shows its text', () => {
		const prefill = cancellationPreFill({ policy: manual, seatingStart, now: hoursBefore(31), refundable: 4000 });
		expect(prefill.suggestedAmount).toBeNull();
		expect(prefill.policyTextFr).toBe('Contactez-nous.');
		expect(prefill.germinalAmount).toBe(4000);
	});

	it('applies the policy to what is left to refund', () => {
		const prefill = cancellationPreFill({ policy: tiered, seatingStart, now: hoursBefore(31), refundable: 1001 });
		expect(prefill.suggestedAmount).toBe(501);
		expect(prefill.germinalAmount).toBe(1001);
	});

	it('suggests nothing to refund when nothing was paid', () => {
		const prefill = cancellationPreFill({ policy: tiered, seatingStart, now: hoursBefore(100), refundable: 0 });
		expect(prefill.suggestedAmount).toBe(0);
		expect(prefill.germinalAmount).toBe(0);
	});
});

describe('guestCancellationTerms', () => {
	const terms = (policy: RefundPolicy, now: Date, status = 'confirmed') =>
		guestCancellationTerms({ status, policy, seatingStart, now, refundable: 4000 });

	it('refuses a Reservation that is not confirmed', () => {
		expect(terms(tiered, hoursBefore(100), 'pending')).toEqual({
			canCancel: false,
			reason: 'Reservation is not confirmed',
		});
	});

	it('manual policy: full refund up to 24 hours before, then no self-service cancellation', () => {
		expect(terms(manual, hoursBefore(24))).toEqual({ canCancel: true, mode: 'full-refund', refundAmount: 4000 });
		const late = terms(manual, hoursBefore(23));
		expect(late.canCancel).toBe(false);
		expect(!late.canCancel && late.reason).toMatch(/24 hours/);
	});

	it('rule-based policy: the policy amount until the Seating starts', () => {
		expect(terms(tiered, hoursBefore(48))).toEqual({ canCancel: true, mode: 'policy', refundAmount: 4000 });
		expect(terms(tiered, hoursBefore(31))).toEqual({ canCancel: true, mode: 'policy', refundAmount: 2000 });
		// Too late for a refund, but cancelling still frees the seats.
		expect(terms(tiered, hoursBefore(2))).toEqual({ canCancel: true, mode: 'policy', refundAmount: 0 });
		expect(terms(tiered, seatingStart)).toEqual({ canCancel: false, reason: 'The seating has already started' });
	});
});
