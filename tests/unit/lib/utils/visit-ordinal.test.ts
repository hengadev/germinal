import { describe, it, expect } from 'vitest';
import { visitOrdinalFr } from '../../../../src/lib/utils/visit-ordinal';

describe('visitOrdinalFr', () => {
	it('uses the French first form only for 1', () => {
		expect(visitOrdinalFr(1)).toBe('1re');
	});

	it('uses -e from the second visit on', () => {
		expect(visitOrdinalFr(2)).toBe('2e');
		expect(visitOrdinalFr(3)).toBe('3e');
		expect(visitOrdinalFr(4)).toBe('4e');
		expect(visitOrdinalFr(11)).toBe('11e');
		expect(visitOrdinalFr(21)).toBe('21e');
	});
});
