import { describe, it, expect } from 'vitest';
import { dietaryAnswerOf, needsDietaryConsent } from '../../../src/lib/utils/dietary-requirements';

const NOW = new Date('2030-06-01T12:00:00Z');

describe('dietaryAnswerOf', () => {
	it('stores the trimmed answer with the consent instant', () => {
		expect(dietaryAnswerOf({ asked: true, answer: '  Sans gluten  ', consent: true, now: NOW })).toEqual({
			dietaryRequirements: 'Sans gluten',
			dietaryConsentAt: NOW,
		});
	});

	it('stores nothing when the Guest leaves the field blank, consent or not', () => {
		const none = { dietaryRequirements: null, dietaryConsentAt: null };
		expect(dietaryAnswerOf({ asked: true, now: NOW })).toEqual(none);
		expect(dietaryAnswerOf({ asked: true, answer: '   ', consent: true, now: NOW })).toEqual(none);
		expect(dietaryAnswerOf({ asked: true, answer: '', consent: false, now: NOW })).toEqual(none);
	});

	it('refuses a filled answer without consent', () => {
		expect(dietaryAnswerOf({ asked: true, answer: 'Vegan', now: NOW })).toBe('consent-required');
		expect(dietaryAnswerOf({ asked: true, answer: 'Vegan', consent: false, now: NOW })).toBe('consent-required');
	});

	it('ignores any answer when the Event does not ask', () => {
		expect(dietaryAnswerOf({ asked: false, answer: 'Vegan', consent: true, now: NOW })).toEqual({
			dietaryRequirements: null,
			dietaryConsentAt: null,
		});
		expect(dietaryAnswerOf({ asked: false, answer: 'Vegan', now: NOW })).toEqual({
			dietaryRequirements: null,
			dietaryConsentAt: null,
		});
	});
});

describe('needsDietaryConsent', () => {
	it('is true only for a filled answer without consent', () => {
		expect(needsDietaryConsent('Vegan', false)).toBe(true);
		expect(needsDietaryConsent('Vegan', undefined)).toBe(true);
		expect(needsDietaryConsent('Vegan', true)).toBe(false);
		expect(needsDietaryConsent('  ', false)).toBe(false);
		expect(needsDietaryConsent(undefined, undefined)).toBe(false);
	});
});
