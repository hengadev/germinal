<script lang="ts">
	// An Event's page before it happens: its photographs stream beside a
	// still column that holds the title, when and where, the price, the text
	// and credits, the Menus and the Seatings to book (PhotoColumnLayout).
	// The cover leads the photographs, the Visuals follow; never the Event
	// Photos, which belong to the project (issue 045).
	import { t, locale } from 'svelte-i18n';
	import { page } from '$app/state';
	import { eventPage, type PageDay, type PageMedium, type SeatingView } from '$lib/utils/event-page';
	import PhotoColumnLayout from './PhotoColumnLayout.svelte';
	import SeatingList from './booking/SeatingList.svelte';
	import BookingModal from './booking/BookingModal.svelte';
	import WaitlistForm from './booking/WaitlistForm.svelte';

	let {
		event,
		schedule,
		/** The Admin preview of a Draft (issue 033): a quiet banner, and
		 * Seatings shown without booking. */
		preview = false,
	}: {
		event: { coverMedia?: PageMedium | null; media?: PageMedium[] | null; [key: string]: any };
		schedule: PageDay[];
		preview?: boolean;
	} = $props();

	const view = $derived(eventPage(event, schedule, $locale, $t));
	const photos = $derived(
		[event.coverMedia ?? null, ...(event.media ?? []).filter((m) => m.id !== event.coverMedia?.id)].filter(
			(m): m is PageMedium => m !== null
		)
	);
	const canBook = $derived(view.summary === 'open' || view.summary === 'waitlist');
	const hasSeatings = $derived(view.summary !== 'past' && view.days.length > 0);

	const ogTitle = $derived(view.title ? `${view.title} | Germinal` : 'Germinal');
	const ogDescription = $derived((view.subtitle || view.description[0] || '').slice(0, 200));
	const ogImage = $derived(event.coverMedia?.type === 'image' ? event.coverMedia.url : undefined);

	const label = 'text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground';

	// The dialogs live outside the still column, whose stacking would keep
	// them under the photographs.
	let bookingOpen = $state(false);
	let waitlistOpen = $state(false);
	let chosen: SeatingView | null = $state(null);

	function choose(seating: SeatingView) {
		if (preview) return;
		chosen = seating;
		if (seating.state === 'waitlist') waitlistOpen = true;
		else if (seating.bookable) bookingOpen = true;
	}
</script>

<svelte:head>
	<title>{ogTitle}</title>
	<meta name="description" content={ogDescription.slice(0, 160)} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Germinal" />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:url" content={page.url.href} />
	{#if ogImage}
		<meta property="og:image" content={ogImage} />
		<meta property="og:image:alt" content={view.title} />
	{/if}
	<meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
	{#if ogImage}
		<meta name="twitter:image" content={ogImage} />
	{/if}
</svelte:head>

{#snippet head()}
	<a href="/events" class="{label} mb-6 inline-block hover:text-foreground">← {$t('events.project.backToProjects')}</a>
	{#if preview}<p class="{label} mb-4">{$t('events.page.previewDraft')}</p>{/if}
	<h1 class="font-serif text-[clamp(2.75rem,5vw,4.5rem)] leading-[0.98] text-balance">{view.title}</h1>
	{#if view.subtitle}<p class="mt-3 text-lg leading-snug text-foreground-alt">{view.subtitle}</p>{/if}
	{#if view.dates}<p class="mt-5 first-letter:uppercase">{view.dates}</p>{/if}
	<p class="text-foreground-alt">{[view.venueName, view.place].filter(Boolean).join(', ')}</p>
	<div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
		{#if canBook}
			<a href="#reserver" class="bg-foreground px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-foreground-alt">
				{$t('events.page.book')}
			</a>
			<p class="font-mono text-sm">{view.priceLine}</p>
		{:else}
			<p class="text-sm italic text-foreground-alt">{view.summaryLabel}</p>
		{/if}
	</div>
{/snippet}

{#snippet body()}
	<div class="flex flex-col gap-12">
		{#if view.description.length || view.admission}
			<div class="flex flex-col gap-4">
				{#each view.description as paragraph, i (i)}
					<p class={i === 0 ? 'font-serif text-xl leading-snug text-pretty' : 'leading-relaxed text-pretty text-foreground-alt'}>{paragraph}</p>
				{/each}
				{#if view.admission}<p class="italic text-foreground-alt">{view.admission}</p>{/if}
			</div>
		{/if}

		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-border-card pt-6 text-sm">
			{#each view.credits as credit, i (i)}
				<dt class="text-muted-foreground">{credit.role}</dt>
				<dd>
					{#if credit.href}
						<a href={credit.href} class="underline decoration-border-input-hover underline-offset-4 hover:decoration-foreground">{credit.name}</a>
					{:else}{credit.name}{/if}
				</dd>
			{/each}
			{#if view.curator}
				<dt class="text-muted-foreground">{$t('events.page.curator')}</dt>
				<dd>{view.curator}</dd>
			{/if}
			{#each view.timings as timing, i (i)}
				<dt class="text-muted-foreground">{timing.label}</dt>
				<dd class="font-mono">{timing.time}</dd>
			{/each}
			{#if view.venueLines.length}
				<dt class="text-muted-foreground">{$t('events.page.venue')}</dt>
				<dd>{view.venueLines.join(', ')}</dd>
			{/if}
		</dl>

		{#each view.menus as menu (menu.name + menu.services.join())}
			<div>
				<p class={label}>{view.menus.length > 1 ? menu.services.join(' · ') : $t('events.page.onTheMenu')}</p>
				<p class="mt-2 font-serif text-xl">{menu.name}</p>
				{#if menu.courses.length}<p class="mt-2 text-sm leading-relaxed text-foreground-alt">{menu.courses.map((course) => course.dish).join(' · ')}</p>{/if}
				{#if menu.note}<p class="mt-2 text-xs text-muted-foreground">{menu.note}</p>{/if}
			</div>
		{/each}

		{#if hasSeatings}
			<section id="reserver" class="scroll-mt-28 border-t border-foreground/80 pt-6">
				<h2 class="mb-6 font-serif text-3xl">{$t('events.page.book')}</h2>
				<SeatingList page={view} {preview} onchoose={choose} />
			</section>
		{/if}
	</div>
{/snippet}

<PhotoColumnLayout {photos} title={view.title} {head} {body} />

{#if canBook}
	<!-- On phones the way to book stays at hand while the photographs scroll. -->
	<a
		href="#reserver"
		class="fixed inset-x-4 bottom-4 z-40 bg-foreground py-3.5 text-center text-sm font-medium text-white lg:hidden"
	>
		{$t('events.page.book')} · {view.priceLine}
	</a>
{/if}

{#if chosen && chosen.seating.priceAmount !== null && bookingOpen}
	<BookingModal
		bind:isOpen={bookingOpen}
		session={{ ...chosen.seating, priceAmount: chosen.seating.priceAmount }}
		eventTitle={view.title}
		eventId={event.id}
		timeZone={event.timeZone}
		deposit={view.deposit}
		refundPolicy={view.refundPolicy}
	/>
{/if}

{#if chosen && waitlistOpen}
	<WaitlistForm bind:isOpen={waitlistOpen} session={chosen.seating} eventTitle={view.title} timeZone={event.timeZone} />
{/if}
