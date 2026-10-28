import { describe, expect, it } from 'vitest';
import {
	EMPTY_MEAL,
	Programme,
	type Kind,
	type MealPlan,
	type ScheduleSource,
} from '$lib/components/admin/schedule/programme.svelte';

/** A source over plain meals, keyed `date:kind`. */
function sourceOf(meals: Record<string, Partial<MealPlan>>): ScheduleSource & { meals: Record<string, MealPlan> } {
	const all: Record<string, MealPlan> = {};
	for (const [key, meal] of Object.entries(meals)) all[key] = { ...EMPTY_MEAL, ...meal };
	return {
		meals: all,
		get days() {
			return [...new Set(Object.keys(all).map((key) => key.split(':')[0]))].sort();
		},
		meal(date: string, kind: Kind) {
			return all[`${date}:${kind}`] ?? { ...EMPTY_MEAL };
		},
		write(date, kind, field, value) {
			const key = `${date}:${kind}`;
			all[key] = { ...(all[key] ?? EMPTY_MEAL), [field]: value };
		},
	};
}

const dinner = (starts: string[], extra: Partial<MealPlan> = {}): Partial<MealPlan> => ({ served: true, starts, duration: 120, ...extra });

describe('Programme', () => {
	it('reads the programme from what most Days share, and the rest as exceptions', () => {
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00', '21:30']),
			'2027-03-12:dinner': dinner(['19:00', '21:30']),
			'2027-03-13:dinner': dinner(['18:30']),
		});
		const programme = new Programme(source, 'seances');

		expect(programme.plan.dinner.starts).toEqual(['19:00', '21:30']);
		expect(programme.plan.lunch.served).toBe(false);
		expect(programme.customDays()).toEqual(['2027-03-13']);
		expect(programme.differences('2027-03-13', 'dinner')).toEqual(['starts']);
	});

	it('changes the Days that follow the programme, not the exceptions', () => {
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00']),
			'2027-03-12:dinner': dinner(['19:00']),
			'2027-03-13:dinner': dinner(['18:30']),
		});
		const programme = new Programme(source, 'seances');

		programme.setProgramme('dinner', 'duration', 150);
		programme.setProgramme('dinner', 'starts', ['19:00', '21:30']);

		expect(source.meals['2027-03-11:dinner'].starts).toEqual(['19:00', '21:30']);
		expect(source.meals['2027-03-12:dinner'].duration).toBe(150);
		expect(source.meals['2027-03-13:dinner'].starts).toEqual(['18:30']);
		// The duration was not an exception there: it follows.
		expect(source.meals['2027-03-13:dinner'].duration).toBe(150);
	});

	it('renames a start time on the Days that follow, keeping the Seating', () => {
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00']),
			'2027-03-12:dinner': dinner(['19:00']),
		});
		const renames: string[] = [];
		source.renameStart = (date, _kind, from, to) => {
			renames.push(`${date} ${from}→${to}`);
			source.write(date, 'dinner', 'starts', [to]);
		};
		const programme = new Programme(source, 'seances');

		programme.renameStart(null, 'dinner', '19:00', '19:30');

		expect(programme.plan.dinner.starts).toEqual(['19:30']);
		expect(renames).toEqual(['2027-03-11 19:00→19:30', '2027-03-12 19:00→19:30']);
	});

	it('makes an exception of selected Days, and resets it to the programme', () => {
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00'], { capacity: null }),
			'2027-03-12:dinner': dinner(['19:00'], { capacity: null }),
		});
		const programme = new Programme(source, 'seances');

		programme.selection(['2027-03-12'], 'dinner').set('capacity', 40);
		expect(programme.customDays()).toEqual(['2027-03-12']);

		programme.reset('2027-03-12');
		expect(source.meals['2027-03-12:dinner'].capacity).toBeNull();
		expect(programme.customDays()).toEqual([]);
	});

	it('gives a meal served again the programme’s times', () => {
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00']),
			'2027-03-12:dinner': dinner(['19:00']),
			'2027-03-13:dinner': { served: false },
		});
		const programme = new Programme(source, 'seances');
		expect(programme.differences('2027-03-13', 'dinner')).toEqual(['served']);

		programme.reset('2027-03-13', 'dinner');

		expect(source.meals['2027-03-13:dinner']).toMatchObject({ served: true, starts: ['19:00'], duration: 120 });
	});

	it('prices: a meal not served is no exception', () => {
		const source = sourceOf({
			'2027-03-11:lunch': { served: true, menu: 'm1', price: 65 },
			'2027-03-12:lunch': { served: true, menu: 'm1', price: 65 },
			'2027-03-13:lunch': { served: true, menu: 'm2', price: 55 },
		});
		const programme = new Programme(source, 'tarifs');

		expect(programme.plan.lunch).toMatchObject({ menu: 'm1', price: 65 });
		expect(programme.differences('2027-03-13', 'lunch')).toEqual(['menu', 'price']);
		expect(programme.differences('2027-03-11', 'dinner')).toEqual([]);
	});

	it('badges a Seating time once for every Day that follows, not for an exception', () => {
		const vip = { titleFr: '', titleEn: '', descriptionFr: '', descriptionEn: '', badge: 'vip' as const };
		const custom = { ...vip, badge: 'none' as const, titleFr: 'Soirée jazz' };
		const source = sourceOf({
			'2027-03-11:dinner': dinner(['19:00', '21:30']),
			'2027-03-12:dinner': dinner(['19:00', '21:30']),
			'2027-03-13:dinner': dinner(['19:00', '21:30'], { seatings: { '21:30': custom } }),
		});
		const programme = new Programme(source, 'seances');

		programme.setSeatingInfo(null, 'dinner', '21:30', vip);

		expect(source.meals['2027-03-11:dinner'].seatings['21:30'].badge).toBe('vip');
		expect(source.meals['2027-03-13:dinner'].seatings['21:30']).toEqual(custom);
		expect(programme.customDays()).toEqual(['2027-03-13']);
		expect(programme.differences('2027-03-13', 'dinner')).toEqual(['seatings']);
	});
});
