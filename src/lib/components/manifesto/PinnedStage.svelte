<script lang="ts">
	// A stage that holds still under the navigation while the page scrolls
	// past it: each `step` of the viewport's height moves it to the next of
	// `count` items. After the last item it holds for one more step, then
	// scrolls away with the page.
	import type { Snippet } from 'svelte';

	const NAV = 72;

	let {
		count,
		/** How much scrolling, in viewport heights, moves one item on. */
		step = 0.9,
		children,
	}: {
		count: number;
		step?: number;
		children: Snippet<[{ index: number }]>;
	} = $props();

	let section: HTMLElement | undefined = $state();
	let index = $state(0);
	let frame = 0;

	function measure() {
		frame = 0;
		if (!section) return;
		const travelled = NAV - section.getBoundingClientRect().top;
		index = Math.min(Math.max(Math.floor(travelled / (window.innerHeight * step)), 0), count - 1);
	}

	function onscroll() {
		if (!frame) frame = requestAnimationFrame(measure);
	}

	$effect(() => {
		measure();
		return () => cancelAnimationFrame(frame);
	});
</script>

<svelte:window {onscroll} onresize={onscroll} />

<section bind:this={section} class="relative" style="height: calc({count * step * 100}svh + 100svh - {NAV}px)">
	<div class="sticky overflow-hidden" style="top: {NAV}px; height: calc(100svh - {NAV}px)">
		{@render children({ index })}
	</div>
</section>
