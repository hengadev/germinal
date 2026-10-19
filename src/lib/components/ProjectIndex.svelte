<script lang="ts">
	// « Projets »: a typographic index, one row per Event — those to come
	// first, then the projects. On desktop the cover of the row under the
	// pointer floats in the right column at the pointer's height, easing
	// after it as the pointer moves or the page scrolls; keyboard focus
	// brings it to the focused row. On phones each row carries its image.
	import { t, locale } from 'svelte-i18n';
	import { localizedText } from '$lib/utils/event-text';
	import { mediaAlt } from '$lib/utils/media-alt';
	import { formatSeatingDate } from '$lib/utils/event-time';
	import { pageLang } from '$lib/utils/event-page';
	import type { EventWithMedia } from '$lib/types/events';

	let { events }: { events: EventWithMedia[] } = $props();

	interface Row {
		id: string;
		title: string;
		/** When it is coming up, or where it took place. */
		detail: string;
		year: string;
		upcoming: boolean;
		cover: EventWithMedia['coverMedia'];
	}

	const rows: Row[] = $derived.by(() => {
		const lang = pageLang($locale);
		const now = Date.now();
		return events.map((e) => {
			const start = e.startDate ? new Date(e.startDate) : null;
			const end = e.endDate ? new Date(e.endDate) : start;
			const upcoming = end !== null && end.getTime() > now;
			return {
				id: e.id,
				title: localizedText(e.titleEn, e.titleFr, lang),
				detail: upcoming && start
					? formatSeatingDate(start, e.timeZone, lang, { day: 'numeric', month: 'long', year: 'numeric' })
					: [localizedText(e.venueNameEn, e.venueNameFr, lang), localizedText(e.cityEn, e.cityFr, lang)].filter(Boolean).join(', '),
				year: start ? String(start.getUTCFullYear()) : '',
				upcoming,
				cover: e.coverMedia ?? null,
			};
		});
	});
	// The soonest first among those to come; the projects stay newest first.
	const upcoming = $derived(rows.filter((row) => row.upcoming).reverse());
	const past = $derived(rows.filter((row) => !row.upcoming));

	const label = 'text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground';
	// Only an image cover is shown; a video cover leaves its row without one.
	const coverOf = (row: Row) => (row.cover?.type === 'image' ? row.cover : null);

	let column: HTMLElement | undefined = $state();
	let frame: HTMLElement | undefined = $state();
	let active: string | null = $state(null);
	let y = $state(0);
	let target = 0;
	let pointer: { x: number; y: number } | null = null;
	let raf = 0;

	// The frame's top, so that its middle sits at `clientY`, kept inside the column.
	function aim(clientY: number) {
		if (!column || !frame) return;
		const rect = column.getBoundingClientRect();
		target = Math.min(Math.max(clientY - rect.top - frame.offsetHeight / 2, 0), rect.height - frame.offsetHeight);
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			y = target;
			return;
		}
		if (!raf) raf = requestAnimationFrame(glide);
	}

	function glide() {
		y += (target - y) * 0.16;
		if (Math.abs(target - y) < 0.5) {
			y = target;
			raf = 0;
			return;
		}
		raf = requestAnimationFrame(glide);
	}

	// The row under the pointer, which changes on scroll as much as on move.
	function track() {
		if (!pointer) return;
		const row = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-project]');
		active = row?.dataset.project ?? null;
		if (active) aim(pointer.y);
	}

	function onfocus(row: Row, event: FocusEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		active = row.id;
		aim(rect.top + rect.height / 2);
	}

	$effect(() => () => cancelAnimationFrame(raf));
</script>

<svelte:window onscroll={track} />

{#snippet item(row: Row)}
	{@const cover = coverOf(row)}
	<li data-project={row.id}>
		<a
			href="/events/{row.id}"
			onfocus={(event) => onfocus(row, event)}
			onblur={() => (active = null)}
			class="grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 gap-y-3 border-t border-border-card py-6 lg:grid-cols-[4rem_1fr_auto] lg:py-7"
		>
			<span class="font-mono text-sm text-muted-foreground">{row.upcoming ? '' : row.year}</span>
			<span
				class="font-serif text-3xl leading-tight transition-colors duration-300 lg:text-5xl {active && active !== row.id
					? 'lg:text-muted-foreground'
					: ''}">{row.title}</span
			>
			<span class="col-start-2 text-sm text-foreground-alt lg:col-start-3 lg:text-right">{row.detail}</span>
			{#if cover}
				<img
					src={cover.url}
					alt={mediaAlt(cover, $locale, row.title)}
					loading="lazy"
					class="col-span-2 aspect-[16/10] w-full object-cover grayscale lg:hidden"
				/>
			{/if}
		</a>
	</li>
{/snippet}

<div class="lg:grid lg:grid-cols-12 lg:gap-12">
	<div
		class="lg:col-span-7"
		role="presentation"
		onpointermove={(event) => {
			if (event.pointerType !== 'mouse') return;
			pointer = { x: event.clientX, y: event.clientY };
			track();
		}}
		onpointerleave={() => {
			pointer = null;
			active = null;
		}}
	>
		{#if upcoming.length}
			<h2 class="{label} mb-4">{$t('events.page.comingUp')}</h2>
			<ul class="mb-16 border-b border-border-card">
				{#each upcoming as row (row.id)}{@render item(row)}{/each}
			</ul>
		{/if}
		{#if past.length}
			<h2 class="{label} mb-4">{$t('events.title')}</h2>
			<ul class="border-b border-border-card">
				{#each past as row (row.id)}{@render item(row)}{/each}
			</ul>
		{/if}
	</div>

	<!-- The floating cover: every cover stacked, the active one shown. -->
	<div bind:this={column} class="relative hidden lg:col-span-5 lg:block" aria-hidden="true">
		<div
			bind:this={frame}
			class="absolute inset-x-0 mx-auto aspect-[4/5] w-full max-w-[26rem] transition-opacity duration-300 {active
				? 'opacity-100'
				: 'opacity-0'}"
			style="transform: translateY({y}px)"
		>
			{#each rows as row (row.id)}
				{@const cover = coverOf(row)}
				{#if cover}
					<img
						src={cover.url}
						alt=""
						loading="lazy"
						class="absolute inset-0 h-full w-full object-cover transition-opacity duration-500 {active === row.id
							? 'opacity-100'
							: 'opacity-0'}"
					/>
				{/if}
			{/each}
		</div>
	</div>
</div>
