/**
 * Motion in the Staff portal (issue 033): every animation goes through
 * these helpers so that `prefers-reduced-motion: reduce` turns them all
 * off at once — a duration of 0 makes Svelte transitions and
 * `animate:flip` no-ops.
 */
import { cubicOut } from 'svelte/easing';

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** The duration to use, 0 when reduced motion is on. At most 250 ms. */
export function motion(duration = 200): number {
	return prefersReducedMotion() ? 0 : Math.min(duration, 250);
}

/**
 * The delay before item `index` of a list fades in, so the list reveals
 * with a short stagger. Only the first `max` items are staggered.
 */
export function stagger(index: number, step = 40, max = 6): number {
	return prefersReducedMotion() ? 0 : Math.min(index, max - 1) * step;
}

/**
 * A list item's fade-in on the page's first load. A CSS animation, not a
 * Svelte transition: local intros don't play when the page first mounts.
 * Reduced motion skips it (motion-safe).
 */
export const REVEAL = 'motion-safe:animate-fade-in [animation-fill-mode:both]';

export { cubicOut };
