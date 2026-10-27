// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { keepEdits } from '$lib/utils/editor-refresh';

describe('keepEdits', () => {
	it('a field left as it was sent takes the saved value (generated English)', () => {
		const sent = { titleEn: '', descriptionEn: '' };
		const saved = { titleEn: 'Garden dinner', descriptionEn: 'A dinner.' };
		expect(keepEdits(sent, { ...sent }, saved)).toEqual(saved);
	});

	it('a field changed since the save started keeps what the Admin typed', () => {
		const sent = { titleEn: '', descriptionEn: '' };
		const current = { titleEn: 'Dinner in the gar', descriptionEn: '' };
		const saved = { titleEn: 'Garden dinner', descriptionEn: 'A dinner.' };
		expect(keepEdits(sent, current, saved)).toEqual({ titleEn: 'Dinner in the gar', descriptionEn: 'A dinner.' });
	});

	it('a field typed back to what was sent counts as untouched', () => {
		const sent = { titleEn: 'Dinner' };
		expect(keepEdits(sent, { titleEn: 'Dinner' }, { titleEn: 'Dinner' })).toEqual({ titleEn: 'Dinner' });
	});

	it('leaves its arguments alone', () => {
		const sent = { titleEn: '' };
		const current = { titleEn: '' };
		keepEdits(sent, current, { titleEn: 'Dinner' });
		expect(current).toEqual({ titleEn: '' });
	});
});
