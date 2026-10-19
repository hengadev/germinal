<script lang="ts">
	// A Portfolio Event's page (issue 045, ADR 0007): the Event shown as a
	// project, once it took place. Its Event Photos stream beside a still
	// column (PhotoColumnLayout) with the title, dates and city, the Recap
	// (first paragraph as the lead), the credits and the next project. No
	// announcement text, Seatings, prices or booking: those belonged to the
	// Event before it happened.
	import { t, locale } from 'svelte-i18n';
	import { page } from '$app/state';
	import { mediaAlt } from '$lib/utils/media-alt';
	import { localizedText } from '$lib/utils/event-text';
	import { projectPage, type PageMedium } from '$lib/utils/event-page';
	import PhotoColumnLayout from './PhotoColumnLayout.svelte';

	let {
		project,
	}: {
		project: {
			cover: PageMedium | null;
			eventPhotos: PageMedium[];
			days: string[];
			/** The project listed after this one on « Projets », if any. */
			next?: { id: string; titleEn: string | null; titleFr: string | null } | null;
			[key: string]: unknown;
		};
	} = $props();

	const view = $derived(projectPage(project, $locale));
	// The cover leads the photographs.
	const photos = $derived(
		[project.cover, ...project.eventPhotos.filter((photo) => photo.id !== project.cover?.id)].filter(
			(m): m is PageMedium => m !== null
		)
	);
	const next = $derived(project.next ? localizedText(project.next.titleEn, project.next.titleFr, $locale) : '');

	const ogTitle = $derived(view.title ? `${view.title} | Germinal` : 'Germinal');
	const ogDescription = $derived((view.recap[0] ?? '').slice(0, 200));
	const ogImage = $derived(project.cover?.type === 'image' ? project.cover.url : undefined);

	const label = 'text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground';
</script>

<svelte:head>
	<title>{ogTitle}</title>
	<meta name="description" content={ogDescription.slice(0, 160)} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Germinal" />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:url" content={page.url.href} />
	{#if ogImage}
		<meta property="og:image" content={ogImage} />
		<meta property="og:image:alt" content={mediaAlt(project.cover, $locale, view.title)} />
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
	<h1 class="font-serif text-[clamp(2.75rem,5vw,4.5rem)] leading-[0.98] text-balance">{view.title}</h1>
	{#if view.dates}<p class="mt-5">{view.dates}</p>{/if}
	{#if view.city}<p class="text-foreground-alt">{view.city}</p>{/if}
{/snippet}

{#snippet body()}
	<div class="flex flex-col gap-12">
		{#if view.recap.length}
			<div class="flex flex-col gap-4">
				{#each view.recap as paragraph, i (i)}
					<p class={i === 0 ? 'font-serif text-xl leading-snug text-pretty' : 'leading-relaxed text-pretty text-foreground-alt'}>{paragraph}</p>
				{/each}
			</div>
		{/if}

		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-border-card pt-6 text-sm" aria-label={$t('events.project.credits')}>
			{#each view.credits as credit, i (i)}
				<dt class="text-muted-foreground">{credit.role}</dt>
				<dd>
					{#if credit.href}
						<a href={credit.href} class="underline decoration-border-input-hover underline-offset-4 hover:decoration-foreground">{credit.name}</a>
					{:else}{credit.name}{/if}
				</dd>
			{/each}
			{#if view.curator}
				<dt class="text-muted-foreground">{$t('events.project.curator')}</dt>
				<dd>{view.curator}</dd>
			{/if}
			{#if view.venueLines.length}
				<dt class="text-muted-foreground">{$t('events.project.venue')}</dt>
				<dd>{view.venueLines.join(', ')}</dd>
			{/if}
		</dl>

		{#if project.next}
			<a href="/events/{project.next.id}" class="group border-t border-foreground/80 pt-5">
				<span class={label}>{$t('events.page.nextProject')}</span>
				<span class="mt-2 block font-serif text-3xl underline-offset-8 group-hover:underline">{next} →</span>
			</a>
		{/if}
	</div>
{/snippet}

<PhotoColumnLayout {photos} title={view.title} {head} {body} />
