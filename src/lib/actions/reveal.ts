import { ANIMATION_PRESETS, OBSERVER_CONFIG, type AnimationPreset } from '$lib/utils/animation-config';

// Shared observer instance (performance optimization)
let observer: IntersectionObserver | null = null;
const observedElements = new WeakMap<HTMLElement, {
	animate: { opacity?: number; transform?: string };
	duration: number;
	easing: string;
	delay: number;
}>();

export function reveal(
	node: HTMLElement,
	options?: {
		preset?: AnimationPreset;
		delay?: number;
		duration?: number;
		disabled?: boolean;
	}
) {
	// Check for prefers-reduced-motion
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (prefersReducedMotion || options?.disabled) {
		return { destroy: () => {} };
	}

	// Get preset configuration
	const preset = ANIMATION_PRESETS[options?.preset || 'fade-up'];

	// Set initial state (invisible).
	// No will-change here: setting will-change creates a GPU compositing layer,
	// and changing/removing it mid-animation destroys that layer. On iOS Safari
	// this invalidates the touch hit-test tree, causing taps on nearby interactive
	// elements (buttons, links) to miss inconsistently until the next relayout.
	node.style.opacity = '0';
	node.style.transform = ('transform' in preset.initial ? preset.initial.transform : '') || '';

	// Create/reuse observer
	if (!observer) {
		observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const element = entry.target as HTMLElement;
					const data = observedElements.get(element);

					if (data) {
						setTimeout(() => {
							element.style.transition = `opacity ${data.duration}ms ${data.easing}, transform ${data.duration}ms ${data.easing}`;
							element.style.opacity = '1';
							element.style.transform = data.animate.transform || 'none';

							// Clear transform after animation ends to avoid creating a stacking context,
							// which would break position:fixed descendants (e.g. modals).
							setTimeout(() => {
								element.style.transform = '';
								element.style.transition = '';
							}, data.duration);
						}, data.delay || 0);

						// Unobserve after animation
						observer?.unobserve(element);
					}
				}
			});
		}, OBSERVER_CONFIG);
	}

	// Store config and observe
	observedElements.set(node, {
		animate: preset.animate,
		duration: options?.duration || preset.duration,
		easing: preset.easing,
		delay: options?.delay || 0,
	});

	observer.observe(node);

	// Cleanup
	return {
		destroy() {
			observer?.unobserve(node);
			observedElements.delete(node);
		},
	};
}
