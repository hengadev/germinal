import { describe, it, expect } from 'vitest';
import { resolveDemandePeriod } from '../../../src/lib/utils/demande-period';

// 2025-06-15 is summer time (CEST, UTC+2) in Paris.
const summerNoonUtc = new Date('2025-06-15T12:00:00Z');

describe('resolveDemandePeriod (issue 074)', () => {
	it('today covers the whole Paris day', () => {
		const { from, to } = resolveDemandePeriod('today', summerNoonUtc);
		expect(from?.toISOString()).toBe('2025-06-14T22:00:00.000Z');
		expect(to?.toISOString()).toBe('2025-06-15T22:00:00.000Z');
	});

	it('7d starts six Paris days back, 30d twenty-nine', () => {
		const seven = resolveDemandePeriod('7d', summerNoonUtc);
		expect(seven.from?.toISOString()).toBe('2025-06-08T22:00:00.000Z');
		expect(seven.to?.toISOString()).toBe('2025-06-15T22:00:00.000Z');

		const thirty = resolveDemandePeriod('30d', summerNoonUtc);
		expect(thirty.from?.toISOString()).toBe('2025-05-16T22:00:00.000Z');
	});

	it('handles winter time (CET, UTC+1) across a DST boundary', () => {
		// 2025-01-20, Paris on CET; 30 days back lands in early January.
		const { from } = resolveDemandePeriod('30d', new Date('2025-01-20T12:00:00Z'));
		expect(from?.toISOString()).toBe('2024-12-21T23:00:00.000Z');
	});

	it('custom bounds are inclusive whole Paris days', () => {
		const { from, to } = resolveDemandePeriod('custom', summerNoonUtc, '2025-06-01', '2025-06-03');
		expect(from?.toISOString()).toBe('2025-05-31T22:00:00.000Z');
		expect(to?.toISOString()).toBe('2025-06-03T22:00:00.000Z');
	});

	it('custom accepts one bound only and ignores invalid dates', () => {
		expect(resolveDemandePeriod('custom', summerNoonUtc, null, '2025-06-03').from).toBeNull();
		expect(resolveDemandePeriod('custom', summerNoonUtc, 'not-a-date', '2025-06-03').from).toBeNull();
		expect(resolveDemandePeriod('custom', summerNoonUtc, '2025-06-01').to).toBeNull();
	});

	it('unknown or missing presets produce no bounds', () => {
		expect(resolveDemandePeriod('', summerNoonUtc)).toEqual({ from: null, to: null });
		expect(resolveDemandePeriod('nonsense', summerNoonUtc)).toEqual({ from: null, to: null });
		expect(resolveDemandePeriod(null, summerNoonUtc)).toEqual({ from: null, to: null });
	});
});
