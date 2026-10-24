import { describe, it, expect, vi } from 'vitest';
import { translateSeatings } from '../../../src/lib/server/services/seating-translation';
import type { ParsedServiceSeatings, PlannedSeating } from '../../../src/lib/server/services/event-schedule';
import type { Translator } from '../../../src/lib/server/services/translator';
import type { EditorService } from '../../../src/lib/types/seatings-editor';

const SEATING_ID = '22222222-2222-4222-8222-222222222222';

function fakeTranslator() {
	return vi.fn<Translator>(async (texts) => texts.map((text) => `EN(${text})`));
}

function services(...seatings: Partial<PlannedSeating>[]): ParsedServiceSeatings[] {
	return [
		{
			serviceId: 'svc',
			defaultDurationMinutes: 120,
			seatings: seatings.map((over) => ({
				seating: {
					id: null,
					start: '19:00',
					end: null,
					titleEn: null,
					titleFr: null,
					descriptionEn: null,
					descriptionFr: null,
					capacityOverride: null,
					published: true,
					allowWaitlist: false,
					badgeType: 'none',
					...over,
				} as PlannedSeating,
				startMinutes: 1140,
				endMinutes: 1260,
			})),
		},
	];
}

describe('translateSeatings', () => {
	it('translates a new Seating’s title and description, leaving blank ones blank', async () => {
		const translator = fakeTranslator();
		const { value } = await translateSeatings(
			services({ titleFr: 'Dîner du soir', descriptionFr: 'Sept plats' }, {}),
			null,
			translator
		);
		expect(value[0].seatings[0].seating).toMatchObject({ titleEn: 'EN(Dîner du soir)', descriptionEn: 'EN(Sept plats)' });
		expect(value[0].seatings[1].seating).toMatchObject({ titleEn: null, descriptionEn: null });
		expect(translator).toHaveBeenCalledTimes(1);
	});

	it('keeps English edited in the same save, and leaves unchanged French alone', async () => {
		const stored = [
			{
				serviceId: 'svc',
				seatings: [{ id: SEATING_ID, titleFr: 'Dîner', titleEn: 'Dinner', descriptionFr: 'Court', descriptionEn: 'Short' }],
			},
		] as unknown as EditorService[];
		const translator = fakeTranslator();
		const { value } = await translateSeatings(
			services({ id: SEATING_ID, titleFr: 'Souper', titleEn: 'Supper', descriptionFr: 'Court', descriptionEn: 'Short' }),
			stored,
			translator
		);
		expect(value[0].seatings[0].seating).toMatchObject({ titleEn: 'Supper', descriptionEn: 'Short' });
		expect(translator).not.toHaveBeenCalled();
	});
});
