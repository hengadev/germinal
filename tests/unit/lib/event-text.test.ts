import { describe, it, expect } from 'vitest';
import { adminEventTitle, localizedText } from '../../../src/lib/utils/event-text';

describe('localizedText', () => {
	it('gives the text in the visitor’s language', () => {
		expect(localizedText('Dinner', 'Dîner', 'en')).toBe('Dinner');
		expect(localizedText('Dinner', 'Dîner', 'fr')).toBe('Dîner');
	});

	it('falls back to the other language when one is missing', () => {
		expect(localizedText(null, 'Dîner', 'en')).toBe('Dîner');
		expect(localizedText('  ', 'Dîner', 'en')).toBe('Dîner');
		expect(localizedText('Dinner', undefined, 'fr')).toBe('Dinner');
	});

	it('is empty when both are missing', () => {
		expect(localizedText(null, null, 'fr')).toBe('');
	});
});

describe('adminEventTitle', () => {
	it('shows « Sans titre » for an untitled Draft', () => {
		expect(adminEventTitle({ titleEn: null, titleFr: null })).toBe('Sans titre');
		expect(adminEventTitle({ titleEn: '', titleFr: ' ' })).toBe('Sans titre');
	});

	it('shows the French title otherwise, the English one when only it is set', () => {
		expect(adminEventTitle({ titleEn: 'Harvest Dinner', titleFr: 'Dîner des Moissons' })).toBe('Dîner des Moissons');
		expect(adminEventTitle({ titleEn: 'Harvest Dinner', titleFr: null })).toBe('Harvest Dinner');
	});
});
