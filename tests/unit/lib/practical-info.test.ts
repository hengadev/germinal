import { describe, it, expect } from 'vitest';
import { localizedPracticalInfo, withoutPracticalInfo } from '../../../src/lib/utils/practical-info';

describe('localizedPracticalInfo', () => {
	it('reads the Guest’s language, falling back to the other one', () => {
		const event = { practicalInfoEn: 'Door code 4512B.', practicalInfoFr: 'Code 4512B.' };
		expect(localizedPracticalInfo(event, 'en')).toBe('Door code 4512B.');
		expect(localizedPracticalInfo(event, 'fr')).toBe('Code 4512B.');
		expect(localizedPracticalInfo({ practicalInfoEn: null, practicalInfoFr: 'Code 4512B.' }, 'en')).toBe('Code 4512B.');
		expect(localizedPracticalInfo({ practicalInfoEn: 'Door code 4512B.', practicalInfoFr: null }, 'fr')).toBe('Door code 4512B.');
	});

	it('is empty when both languages are missing or blank, so nothing renders', () => {
		expect(localizedPracticalInfo({ practicalInfoEn: null, practicalInfoFr: null }, 'en')).toBe('');
		expect(localizedPracticalInfo({ practicalInfoEn: '', practicalInfoFr: '   ' }, 'fr')).toBe('');
		expect(localizedPracticalInfo({ practicalInfoEn: undefined, practicalInfoFr: undefined }, 'en')).toBe('');
	});
});

describe('withoutPracticalInfo', () => {
	it('leaves every other field of the Event alone', () => {
		const event = { id: 'e1', titleEn: 'Dinner', practicalInfoEn: 'Door code 4512B.', practicalInfoFr: 'Code 4512B.' };
		expect(withoutPracticalInfo(event)).toEqual({ id: 'e1', titleEn: 'Dinner' });
	});

	it('keeps nested relations and is a copy, not the Event itself', () => {
		const event = { id: 'e1', sessions: [{ id: 's1' }], practicalInfoEn: null, practicalInfoFr: null };
		const stripped = withoutPracticalInfo(event);
		expect(stripped.sessions).toEqual([{ id: 's1' }]);
		expect(stripped).not.toBe(event);
		expect(event.practicalInfoEn).toBeNull();
	});
});
