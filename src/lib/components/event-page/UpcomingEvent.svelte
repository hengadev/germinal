<script lang="ts">
	// An upcoming Event's page, « Plein cadre » (issue 079): the first
	// screen is the announcement — a landscape video or the cover edge to
	// edge under a shade, a vertical video at the right over its own
	// blurred poster, a key visual shown whole with the words under it.
	// Then the text and the facts side by side, and the booking with the
	// Menu of the meal picked beside it.
	import { t } from 'svelte-i18n';
	import type { EventPage, MenuView, PageDay } from '$lib/utils/event-page';
	import HeroMedia from './HeroMedia.svelte';
	import Facts from './Facts.svelte';
	import InlineBooking from './booking/InlineBooking.svelte';
	import type { BookingExtra } from '$lib/utils/inline-booking';

	let {
		view,
		schedule,
		extras = [],
		asksDietary = false,
		/** The Admin preview of a Draft: a quiet banner, never a submit. */
		preview = false,
	}: {
		view: EventPage;
		schedule: PageDay[];
		extras?: BookingExtra[];
		asksDietary?: boolean;
		preview?: boolean;
	} = $props();

	const medium = $derived(view.hero);
	const menus: MenuView[] = $derived(view.menus);
	const canBook = $derived(view.summary === 'open' || view.summary === 'waitlist');
	const label = 'text-xxs font-medium uppercase tracking-[0.15em]';
	const keyVisual = $derived(Boolean(medium?.hasName));
</script>

{#snippet words(onDark: boolean)}
	{#if preview}<p class="{label} mb-4">{$t('events.page.previewDraft')}</p>{/if}
	<p class="{label} {onDark ? 'text-white/70' : 'text-muted-foreground'}">{$t('events.page.soon')}</p>
	{#if keyVisual}
		<h1 class="sr-only">{view.title}</h1>
	{:else}
		<h1 class="mt-2 font-serif text-[clamp(3.25rem,8vw,7rem)] leading-[0.92] text-balance">{view.title}</h1>
	{/if}
	<p class="mt-4 font-serif text-2xl first-letter:uppercase">{view.dates}</p>
	<p class={onDark ? 'text-white/80' : 'text-foreground-alt'}>{[view.venueName, view.place].filter(Boolean).join(', ')}</p>
	{#if canBook}
		<div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
			<a
				href="#reserver"
				data-hero-book
				class="px-6 py-3 text-sm font-medium transition-colors {onDark ? 'bg-white text-foreground hover:bg-surface' : 'bg-foreground text-white hover:bg-foreground-alt'}"
			>
				{$t('events.page.book')} ↓
			</a>
			<p class="text-sm">{view.priceLine}</p>
		</div>
	{:else}
		<p class="mt-6 text-sm italic {onDark ? 'text-white/80' : 'text-foreground-alt'}">{view.summaryLabel}</p>
	{/if}
{/snippet}

<article>
	{#if medium && keyVisual}
		<!-- The key visual whole, under the bar; the words below it. -->
		<div class="bg-foreground pt-[4.75rem]">
			<HeroMedia {medium} title={view.title} class="mx-auto max-h-[82svh] w-full" fit="contain" />
		</div>
		<header class="mx-auto max-w-7xl px-6 pt-10 pb-6 lg:px-12">{@render words(false)}</header>
	{:else if medium}
		<header class="relative h-svh min-h-[36rem] overflow-hidden bg-foreground text-white">
			{#if medium.shape === 'portrait'}
				{#if medium.poster}
					<img src={medium.poster} alt="" class="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50" />
				{/if}
				<HeroMedia {medium} title={view.title} class="absolute inset-0 md:inset-auto md:top-24 md:right-[6%] md:bottom-10 md:aspect-[9/16]" />
			{:else}
				<HeroMedia {medium} title={view.title} class="absolute inset-0" />
			{/if}
			<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/80"></div>
			<!-- Clicks pass through to the video's controls, except on the button. -->
			<div class="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-14 lg:px-12 [&_a]:pointer-events-auto">
				<div class="max-w-2xl">{@render words(true)}</div>
			</div>
		</header>
	{:else}
		<header class="mx-auto max-w-7xl px-6 pt-36 pb-6 lg:px-12">{@render words(false)}</header>
	{/if}

	<section class="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[3fr_2fr] lg:gap-20 lg:px-12">
		<div class="flex max-w-2xl flex-col gap-4">
			{#each view.description as paragraph, i (i)}
				<p class="text-lg leading-relaxed text-pretty">{paragraph}</p>
			{/each}
			{#if view.admission}<p class="italic text-foreground-alt">{view.admission}</p>{/if}
		</div>
		<div class="lg:pt-1.5"><Facts {view} /></div>
	</section>

	{#if view.days.length && view.summary !== 'past'}
		<section id="reserver" class="mx-auto max-w-7xl scroll-mt-24 px-6 pt-12 pb-28 lg:px-12">
			<h2 class="mb-10 font-serif text-4xl">{$t('events.page.book')}</h2>
			<InlineBooking {view} {schedule} {menus} {extras} {asksDietary} {preview} />
		</section>
	{/if}
</article>
