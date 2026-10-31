import { describe, expect, it } from 'vitest';
import {
	swipeDirection,
	swipeStartIgnored,
	tabAfterSwipe,
	visibleTabs
} from '$lib/components/staff/swipe';

describe('swipeDirection', () => {
	it('needs at least 60 px of horizontal travel', () => {
		expect(swipeDirection(-59, 0)).toBeNull();
		expect(swipeDirection(59, 0)).toBeNull();
		expect(swipeDirection(-60, 0)).toBe('left');
		expect(swipeDirection(60, 0)).toBe('right');
	});

	it('ignores mostly-vertical drags', () => {
		expect(swipeDirection(-100, 70)).toBeNull(); // 100 <= 1.5 × 70
		expect(swipeDirection(-100, 68)).toBeNull(); // 100 <= 1.5 × 68
		expect(swipeDirection(-100, 60)).toBe('left'); // 100 > 1.5 × 60
	});

	it('returns the direction the finger moved', () => {
		expect(swipeDirection(-120, 0)).toBe('left');
		expect(swipeDirection(120, 0)).toBe('right');
	});
});

const all = { canArrivees: true, canCuisine: true, canScan: true };

describe('visibleTabs', () => {
	it('lists the tabs in order, filtered by access', () => {
		expect(visibleTabs(all)).toEqual(['arrivees', 'cuisine', 'scanner']);
		expect(visibleTabs({ canArrivees: false, canCuisine: true, canScan: true })).toEqual([
			'cuisine',
			'scanner'
		]);
		expect(visibleTabs({ canArrivees: true, canCuisine: false, canScan: false })).toEqual([
			'arrivees'
		]);
	});
});

describe('tabAfterSwipe', () => {
	it('moves to the next tab on a left swipe and the previous on a right one', () => {
		expect(tabAfterSwipe('left', 'arrivees', all)).toBe('cuisine');
		expect(tabAfterSwipe('right', 'scanner', all)).toBe('cuisine');
	});

	it('does not wrap around at either end', () => {
		expect(tabAfterSwipe('right', 'arrivees', all)).toBeNull();
		expect(tabAfterSwipe('left', 'scanner', all)).toBeNull();
	});

	it('skips tabs the viewer cannot see', () => {
		const access = { canArrivees: true, canCuisine: false, canScan: true };
		expect(tabAfterSwipe('left', 'arrivees', access)).toBe('scanner');
		expect(tabAfterSwipe('right', 'scanner', access)).toBe('arrivees');
	});
});

describe('swipeStartIgnored', () => {
	function setup(targetSetup?: (el: HTMLElement) => void) {
		const container = document.createElement('div');
		const target = document.createElement('span');
		targetSetup?.(target);
		container.appendChild(target);
		document.body.appendChild(container);
		return { container, target };
	}

	it('accepts a plain element', () => {
		const { container, target } = setup();
		expect(swipeStartIgnored(target, container)).toBe(false);
	});

	it('ignores form fields and buttons', () => {
		for (const tag of ['input', 'textarea', 'select', 'button']) {
			const { container } = setup(() => {});
			const field = document.createElement(tag);
			container.appendChild(field);
			expect(swipeStartIgnored(field, container), tag).toBe(true);
		}
	});

	it('ignores anything under a data-no-swipe element', () => {
		const { container, target } = setup();
		target.parentElement!.setAttribute('data-no-swipe', '');
		expect(swipeStartIgnored(target, container)).toBe(true);
	});

	it('ignores horizontally scrollable elements', () => {
		const { container } = setup();
		const scroller = document.createElement('nav');
		scroller.style.overflowX = 'auto';
		Object.defineProperty(scroller, 'scrollWidth', { value: 400 });
		Object.defineProperty(scroller, 'clientWidth', { value: 200 });
		container.appendChild(scroller);
		expect(swipeStartIgnored(scroller, container)).toBe(true);
	});
});
