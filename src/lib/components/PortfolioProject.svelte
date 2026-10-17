<script lang="ts">
	// A Portfolio Event's page (issue 045, ADR 0007): the Event shown as a
	// project, once it took place. It leads with its cover photograph, the
	// Recap and the Event Photos, then closes on a colophon — dates, venue,
	// Curator and Collaborators. No announcement text, Seatings, prices or
	// booking: those belonged to the Event before it happened.
	import { ArrowLeft } from 'lucide-svelte';
	import { t, locale } from 'svelte-i18n';
	import { page } from '$app/state';
	import { reveal } from '$lib/actions/reveal';
	import { localizedText } from '$lib/utils/event-text';
	import { mediaAlt } from '$lib/utils/media-alt';
	import { formatProjectDates } from '$lib/utils/project-dates';

	interface ProjectMedia {
		id: string;
		type: string;
		url: string;
		altEn?: string | null;
		altFr?: string | null;
	}

	let {
		project,
	}: {
		project: {
			titleEn?: string | null;
			titleFr?: string | null;
			recapEn?: string | null;
			recapFr?: string | null;
			curatorEn?: string | null;
			curatorFr?: string | null;
			collaborators?: string | null;
			venueNameEn?: string | null;
			venueNameFr?: string | null;
			streetAddressEn?: string | null;
			streetAddressFr?: string | null;
			districtEn?: string | null;
			districtFr?: string | null;
			cityEn?: string | null;
			cityFr?: string | null;
			postalCode?: string | null;
			countryEn?: string | null;
			countryFr?: string | null;
			locationEn?: string | null;
			locationFr?: string | null;
			cover: ProjectMedia | null;
			eventPhotos: ProjectMedia[];
			days: string[];
		};
	} = $props();

	const lang = $derived($locale === 'en' ? 'en' : 'fr');
	const text = (en: string | null | undefined, fr: string | null | undefined) => localizedText(en, fr, $locale);

	const title = $derived(text(project.titleEn, project.titleFr));
	const recap = $derived(text(project.recapEn, project.recapFr));
	// The Recap's paragraphs, the first one set as the lead.
	const paragraphs = $derived(
		recap
			.split(/\n\s*\n/)
			.map((paragraph) => paragraph.trim())
			.filter(Boolean)
	);
	const dates = $derived(formatProjectDates(project.days, lang));
	const city = $derived(text(project.cityEn, project.cityFr) || text(project.locationEn, project.locationFr));

	// The cover leads the page; the other photographs follow the Recap.
	const photos = $derived(project.eventPhotos.filter((photo) => photo.id !== project.cover?.id));

	const venueLines = $derived(
		[
			text(project.venueNameEn, project.venueNameFr),
			text(project.streetAddressEn, project.streetAddressFr),
			[text(project.districtEn, project.districtFr), [project.postalCode, text(project.cityEn, project.cityFr)].filter(Boolean).join(' ')]
				.filter(Boolean)
				.join(', '),
			text(project.countryEn, project.countryFr),
		].filter(Boolean)
	);
	const venueFallback = $derived(venueLines.length === 0 ? text(project.locationEn, project.locationFr) : '');

	const curator = $derived(text(project.curatorEn, project.curatorFr));
	const collaborators: { name: string; role?: string }[] = $derived.by(() => {
		try {
			const parsed = project.collaborators ? JSON.parse(project.collaborators) : [];
			return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.name === 'string' && c.name.trim()) : [];
		} catch {
			return [];
		}
	});

	// Photographs set in a reading rhythm rather than a grid: one full
	// measure, then a pair whose second image drops below the first.
	type Row = { kind: 'full'; photo: ProjectMedia } | { kind: 'pair'; photos: ProjectMedia[] };
	const rows: Row[] = $derived.by(() => {
		const result: Row[] = [];
		let i = 0;
		while (i < photos.length) {
			result.push({ kind: 'full', photo: photos[i] });
			i += 1;
			if (i < photos.length) {
				result.push({ kind: 'pair', photos: photos.slice(i, i + 2) });
				i += 2;
			}
		}
		return result;
	});

	const ogDescription = $derived(recap.slice(0, 200));
	const ogImage = $derived(project.cover?.type === 'image' ? project.cover.url : undefined);
</script>

<svelte:head>
	<title>{title ? `${title} | Germinal` : 'Germinal'}</title>
	<meta name="description" content={recap.slice(0, 160)} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Germinal" />
	<meta property="og:title" content={title ? `${title} | Germinal` : 'Germinal'} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:url" content={page.url.href} />
	{#if ogImage}
		<meta property="og:image" content={ogImage} />
		<meta property="og:image:alt" content={mediaAlt(project.cover, $locale, title)} />
	{/if}
	<meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={title ? `${title} | Germinal` : 'Germinal'} />
	<meta name="twitter:description" content={ogDescription} />
	{#if ogImage}
		<meta name="twitter:image" content={ogImage} />
	{/if}
</svelte:head>

{#snippet medium(item: ProjectMedia)}
	{#if item.type === 'video'}
		<video src={item.url} autoplay muted loop playsinline class="block w-full h-auto" aria-label={mediaAlt(item, $locale, title)}></video>
	{:else}
		<img
			src={item.url}
			alt={mediaAlt(item, $locale, title)}
			loading="lazy"
			decoding="async"
			class="block w-full h-auto"
		/>
	{/if}
{/snippet}

<article>
	<!-- The cover photograph holds the first viewport; the navigation sits
	     over it as on every Event page. Without any image, ink stands in
	     for the missing photograph. -->
	<header class="relative h-svh min-h-[32rem] w-full overflow-hidden bg-foreground">
		{#if project.cover?.type === 'video'}
			<video src={project.cover.url} autoplay muted loop playsinline class="absolute inset-0 h-full w-full object-cover"></video>
		{:else if project.cover}
			<img
				src={project.cover.url}
				alt={mediaAlt(project.cover, $locale, title)}
				class="absolute inset-0 h-full w-full object-cover"
			/>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent via-35% to-black/70"></div>

		<a
			href="/events"
			class="absolute top-24 left-6 lg:left-12 z-10 flex items-center gap-2 text-sm lg:text-base text-white/85 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
		>
			<ArrowLeft size={18} aria-hidden="true" />
			{$t('events.project.backToProjects')}
		</a>

		<div class="absolute inset-x-0 bottom-0 z-10 px-6 pb-12 lg:px-12 lg:pb-16" use:reveal={{ preset: 'fade-up', delay: 100, duration: 800 }}>
			<h1 class="max-w-[18ch] font-serif text-[clamp(2.5rem,7vw,6rem)] leading-[1.05] text-balance text-white">
				{title}
			</h1>
			{#if dates || city}
				<p class="mt-5 text-base lg:text-lg text-white/80">
					{[dates, city].filter(Boolean).join(' · ')}
				</p>
			{/if}
		</div>
	</header>

	<div class="container mx-auto max-w-8xl px-4 lg:px-12">
		{#if paragraphs.length > 0}
			<section class="grid gap-6 py-20 lg:grid-cols-12 lg:py-32">
				<div class="lg:col-span-7 lg:col-start-5 flex flex-col gap-6">
					<p class="font-serif text-2xl lg:text-3xl leading-snug text-foreground text-pretty">
						{paragraphs[0]}
					</p>
					{#each paragraphs.slice(1) as paragraph, i (i)}
						<p class="max-w-prose text-base lg:text-lg leading-relaxed text-foreground-alt text-pretty">
							{paragraph}
						</p>
					{/each}
				</div>
			</section>
		{/if}

		{#if rows.length > 0}
			<section aria-label={$t('events.project.photographs')} class="flex flex-col gap-6 lg:gap-12 {paragraphs.length > 0 ? '' : 'pt-20 lg:pt-32'}">
				{#each rows as row, i (i)}
					{#if row.kind === 'full'}
						<figure class="lg:w-10/12 {i % 4 === 0 ? '' : 'lg:ml-auto'}" use:reveal={{ preset: 'fade-up' }}>
							{@render medium(row.photo)}
						</figure>
					{:else}
						<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-12 items-start">
							{#each row.photos as photo, j (photo.id)}
								<figure class={j === 1 ? 'sm:mt-24 lg:mt-40' : ''} use:reveal={{ preset: 'fade-up', delay: j * 120 }}>
									{@render medium(photo)}
								</figure>
							{/each}
						</div>
					{/if}
				{/each}
			</section>
		{/if}

		<!-- Colophon: who made it, when and where. -->
		<footer class="mt-24 lg:mt-40 mb-24 lg:mb-32 border-t border-border-card pt-10 lg:pt-14">
			<h2 class="sr-only">{$t('events.project.credits')}</h2>
			<dl class="grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
				{#if dates}
					{@render entry($t('events.project.dates'), [dates])}
				{/if}
				{#if venueLines.length > 0 || venueFallback}
					{@render entry($t('events.project.venue'), venueLines.length > 0 ? venueLines : [venueFallback])}
				{/if}
				{#if curator}
					{@render entry($t('events.project.curator'), [curator])}
				{/if}
				{#if collaborators.length > 0}
					<div class="flex flex-col gap-3">
						<dt class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">
							{$t('events.project.collaborators')}
						</dt>
						{#each collaborators as collaborator, i (i)}
							<dd class="text-base leading-snug text-foreground">
								{collaborator.name}
								{#if collaborator.role}
									<span class="block text-sm text-foreground-alt">{collaborator.role}</span>
								{/if}
							</dd>
						{/each}
					</div>
				{/if}
			</dl>
		</footer>
	</div>
</article>

{#snippet entry(label: string, lines: string[])}
	<div class="flex flex-col gap-3">
		<dt class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">{label}</dt>
		<dd class="text-base leading-snug text-foreground">
			{#each lines as line, i (i)}
				<span class="block">{line}</span>
			{/each}
		</dd>
	</div>
{/snippet}
