/**
 * Swipe between the Staff Event tabs (issue 029).
 *
 * Pure helpers: the gesture decision, the ordered list of visible tabs and
 * the target check that tells a swipe from a scroll or a form interaction.
 */

export type StaffEventTab = 'arrivees' | 'cuisine' | 'scanner';

export type SwipeDirection = 'left' | 'right';

/** Order on the tab bar, regardless of what the viewer can see. */
const TAB_ORDER: StaffEventTab[] = ['arrivees', 'cuisine', 'scanner'];

export type TabAccess = {
	canArrivees: boolean;
	canCuisine: boolean;
	canScan: boolean;
};

/** The tabs this viewer can see, in tab-bar order. */
export function visibleTabs(access: TabAccess): StaffEventTab[] {
	return TAB_ORDER.filter((tab) =>
		tab === 'arrivees'
			? access.canArrivees
			: tab === 'cuisine'
				? access.canCuisine
				: access.canScan
	);
}

/**
 * Does this drag count as a swipe? It needs at least 60 px of horizontal
 * travel, clearly more than the vertical one (|dx| > 1.5 × |dy|), so
 * scrolling the guest list never changes tab. Returns the direction the
 * finger moved, or null.
 */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
	if (Math.abs(dx) < 60) return null;
	if (Math.abs(dx) <= 1.5 * Math.abs(dy)) return null;
	return dx < 0 ? 'left' : 'right';
}

/** The tab a swipe leads to, or null at either end (no wrap-around). */
export function tabAfterSwipe(
	direction: SwipeDirection,
	current: StaffEventTab,
	access: TabAccess
): StaffEventTab | null {
	const tabs = visibleTabs(access);
	const index = tabs.indexOf(current);
	if (index === -1) return null;
	const next = direction === 'left' ? index + 1 : index - 1;
	return tabs[next] ?? null;
}

const SWIPE_IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function isHorizontallyScrollable(el: Element): boolean {
	const style = window.getComputedStyle(el);
	const overflowX = style.overflowX;
	if (overflowX !== 'auto' && overflowX !== 'scroll') return false;
	return el.scrollWidth > el.clientWidth + 1;
}

/**
 * Should a swipe starting on `target` (inside `container`) be ignored?
 * Yes when it starts in a form field or button, inside anything marked
 * `data-no-swipe`, or inside a horizontally scrollable element such as
 * the Seating time chips.
 */
export function swipeStartIgnored(target: Element | null, container: Element): boolean {
	for (let el: Element | null = target; el && el !== container.parentElement; el = el.parentElement) {
		if (el.hasAttribute('data-no-swipe')) return true;
		if (SWIPE_IGNORED_TAGS.has(el.tagName)) return true;
		if (el !== container && isHorizontallyScrollable(el)) return true;
		if (el === container) break;
	}
	return false;
}
