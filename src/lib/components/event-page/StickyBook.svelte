<script lang="ts">
	// On a phone, the way to book stays at hand while the page is read:
	// shown once the top's « Réserver ↓ » has scrolled up out of view (not
	// while it is still below the first screen), hidden again when the
	// booking itself is on screen, so there is never two of them in view.
	import { fade } from 'svelte/transition';

	let { label }: { label: string } = $props();

	/** The top's button has scrolled up out of view (not: is still below). */
	let passedTop = $state(false);
	let bookingVisible = $state(false);

	$effect(() => {
		const top = document.querySelector('[data-hero-book]');
		const booking = document.getElementById('reserver');
		const watch = (el: Element | null, set: (e: IntersectionObserverEntry) => void) => {
			if (!el) return null;
			const o = new IntersectionObserver(([e]) => set(e));
			o.observe(el);
			return o;
		};
		const a = watch(top, (e) => (passedTop = !e.isIntersecting && e.boundingClientRect.top < 0));
		const b = watch(booking, (e) => (bookingVisible = e.isIntersecting));
		if (!top) passedTop = true;
		return () => {
			a?.disconnect();
			b?.disconnect();
		};
	});
</script>

{#if passedTop && !bookingVisible}
	<a
		href="#reserver"
		transition:fade={{ duration: 150 }}
		class="fixed inset-x-4 bottom-4 z-40 bg-foreground py-3.5 text-center text-sm font-medium text-white lg:hidden"
	>
		{label}
	</a>
{/if}
