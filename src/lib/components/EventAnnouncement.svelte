<script lang="ts">
	// An Event's page before it happens, « Plein cadre » (issue 079): the
	// announcement fills the first screen, then the text and the facts, then
	// the booking inline, with the Menu of the meal picked (UpcomingEvent).
	import { t, locale } from 'svelte-i18n';
	import { page } from '$app/state';
	import { eventPage, type PageDay, type PageMedium } from '$lib/utils/event-page';
	import UpcomingEvent from './event-page/UpcomingEvent.svelte';
	import StickyBook from './event-page/StickyBook.svelte';

	let {
		event,
		schedule,
		/** The Admin preview of a Draft (issue 033): a quiet banner, and
		 * Seatings shown without booking. */
		preview = false,
	}: {
		event: { coverMedia?: PageMedium | null; [key: string]: any };
		schedule: PageDay[];
		preview?: boolean;
	} = $props();

	const view = $derived(eventPage(event, schedule, $locale, $t));
	const canBook = $derived(view.summary === 'open' || view.summary === 'waitlist');
	const asksDietary = $derived(Boolean(event.askDietaryRequirements));

	const ogTitle = $derived(view.title ? `${view.title} | Germinal` : 'Germinal');
	const ogDescription = $derived((view.subtitle || view.description[0] || '').slice(0, 200));
	const ogImage = $derived(event.coverMedia?.type === 'image' ? event.coverMedia.url : undefined);
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

<!-- Extras are loaded with the real submit in issue 080. -->
<UpcomingEvent {view} {schedule} extras={[]} {asksDietary} {preview} />

{#if canBook}
	<!-- On a phone, the way to book stays at hand between the first
	     screen's button and the booking itself. -->
	<StickyBook label="{$t('events.page.book')} · {view.priceLine}" />
{/if}
