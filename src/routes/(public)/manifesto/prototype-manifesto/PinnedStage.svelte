<script lang="ts">
	// PROTOTYPE — a stage that holds still under the navigation while the
	// page scrolls past it: each `step` of the viewport's height moves it
	// to the next of `count` items. It hands its children the current item
	// and how far through the whole run the reader is (0 to 1), and lets
	// them jump to an item.
	import type { Snippet } from 'svelte';

	const NAV = 72;

	let {
		count,
		/** How much scrolling, in viewport heights, moves one item on. */
		step = 0.9,
		label,
		labelledby,
		anchors = [],
		children,
	}: {
		count: number;
		step?: number;
		label?: string;
		labelledby?: string;
		/** Ids that land on each item when linked to (`#id`). */
		anchors?: string[];
		children: Snippet<[{ index: number; progress: number; goto: (i: number) => void }]>;
	} = $props();

	let section: HTMLElement | undefined = $state();
	let index = $state(0);
	let progress = $state(0);
	let frame = 0;

	function measure() {
		frame = 0;
		if (!section) return;
		const stepPx = window.innerHeight * step;
		const travelled = NAV - section.getBoundingClientRect().top;
		index = Math.min(Math.max(Math.floor(travelled / stepPx), 0), count - 1);
		progress = count > 1 ? Math.min(Math.max(travelled / (stepPx * (count - 1)), 0), 1) : 1;
	}

	function onscroll() {
		if (!frame) frame = requestAnimationFrame(measure);
	}

	function goto(i: number) {
		if (!section) return;
		const top = window.scrollY + section.getBoundingClientRect().top - NAV + i * window.innerHeight * step + 2;
		const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
	}

	$effect(() => {
		measure();
		return () => cancelAnimationFrame(frame);
	});
</script>

<svelte:window {onscroll} onresize={onscroll} />

<section
	bind:this={section}
	aria-label={label}
	aria-labelledby={labelledby}
	class="relative"
	style="height: calc({count * step * 100}svh + 100svh - {NAV}px)"
>
	{#each anchors as id, i (id)}
		<div {id} class="absolute left-0 h-px w-px" style="top: calc({(i + 0.25) * step * 100}svh); scroll-margin-top: {NAV}px"></div>
	{/each}
	<div class="sticky overflow-hidden" style="top: {NAV}px; height: calc(100svh - {NAV}px)">
		{@render children({ index, progress, goto })}
	</div>
</section>
