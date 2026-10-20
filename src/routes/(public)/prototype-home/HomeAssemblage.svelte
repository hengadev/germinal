<script lang="ts">
	// PROTOTYPE — H4 « Assemblage »: the parts kept from the first round.
	// The page opens on one photograph, edge to edge (H2), under a deeper
	// shade: the next Event's when there is a Spotlight, the latest
	// project's with the manifesto's title when there is none. Then the
	// studio, always (H2, from H0's « about »), the past projects as opening panels (H0, reworked), the Talents
	// as a frieze (T3), the disciplines as three lines (H2),
	// and the letter that closes the manifesto.
	import { ArrowRight } from 'lucide-svelte';
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import ClosingLetter from '$lib/components/ClosingLetter.svelte';
	import ProjectsGallery from './ProjectsGallery.svelte';
	import TalentsFrise from './TalentsFrise.svelte';
	import { DISCIPLINES, datesOf, placeOf, titleOf, yearOf, type HomeProps } from './shared';

	let { spotlight, projects, talents }: HomeProps = $props();

	const cover = $derived(spotlight ? spotlight : projects[0]);
</script>

<!-- The photograph, and who speaks over it. -->
<section class="relative flex h-svh min-h-[36rem] flex-col justify-end overflow-hidden bg-foreground text-white">
	{#if cover?.coverMedia}
		<img
			src={cover.coverMedia.url}
			alt={mediaAlt(cover.coverMedia, $locale, titleOf(cover, $locale))}
			class="absolute inset-0 h-full w-full object-cover"
		/>
	{/if}
	<!-- Enough shade for the bar above and the words below to read. -->
	<div
		class="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.6),rgb(0_0_0/0.3)_18%,rgb(0_0_0/0.3)_40%,rgb(0_0_0/0.82))]"
		aria-hidden="true"
	></div>

	<div class="relative container mx-auto grid max-w-8xl gap-8 px-4 pb-10 lg:grid-cols-12 lg:items-end lg:pb-14">
		<div class="lg:col-span-8">
			{#if spotlight}
				<h1 class="font-serif text-6xl leading-[0.98] lg:text-8xl">
					<span class="block text-3xl text-white/80 italic lg:text-5xl">{$t('homeNext.next')}</span>
					{titleOf(spotlight, $locale)}
				</h1>
				<p class="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-lg text-white/85">
					<span class="text-white">{datesOf(spotlight, $locale)}</span>
					<span>{placeOf(spotlight, $locale)}</span>
					{#if spotlight.venueCapacity}<span>{$t('homeNext.guests', { values: { count: spotlight.venueCapacity } })}</span>{/if}
				</p>
				<div class="mt-8 flex flex-wrap items-center gap-6">
					<a href="/spotlight" class="group inline-flex items-center gap-3 bg-white px-6 py-3.5 text-foreground transition-colors hover:bg-white/85">
						{$t('homeNext.reserve')}
						<ArrowRight size={18} aria-hidden="true" class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
					</a>
				</div>
			{:else}
				<h1 class="max-w-4xl font-serif text-6xl leading-[0.98] text-balance lg:text-8xl">{$t('manifesto.title')}</h1>
				<div class="mt-8 flex flex-wrap items-center gap-6">
					<a href="/events" class="group inline-flex items-center gap-3 bg-white px-6 py-3.5 text-foreground transition-colors hover:bg-white/85">
						{$t('homeNext.allProjects')}
						<ArrowRight size={18} aria-hidden="true" class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
					</a>
					<a href="/manifesto" class="text-white/85 underline decoration-white/40 underline-offset-4 hover:text-white hover:decoration-white">
						{$t('homeNext.readManifesto')}
					</a>
				</div>
			{/if}
		</div>
		{#if cover && !spotlight}
			<a href="/events/{cover.id}" class="text-sm text-white/75 italic hover:text-white lg:col-span-4 lg:text-right">
				{titleOf(cover, $locale)}, {yearOf(cover)}
			</a>
		{/if}
	</div>
</section>

<!-- The studio, always second. -->
<section class="container mx-auto grid max-w-8xl gap-8 px-4 pt-32 lg:grid-cols-12 lg:gap-12 lg:pt-48" aria-labelledby="studio-title">
	<h2 id="studio-title" class="font-serif text-5xl leading-[1.02] text-balance lg:col-span-6 lg:text-7xl">{$t('homeNext.studioTitle')}</h2>
	<div class="lg:col-span-5 lg:col-start-8 lg:pt-3">
		<p class="text-lg leading-relaxed text-foreground-alt lg:text-xl">{$t('homeNext.studioBody')}</p>
		<a href="/manifesto" class="mt-6 inline-block text-foreground-alt underline decoration-border-input-hover underline-offset-4 hover:text-foreground hover:decoration-foreground">
			{$t('homeNext.readManifesto')}
		</a>
	</div>
</section>

<!-- The past projects, as panels that open. -->
<section class="container mx-auto max-w-8xl px-4 pt-32 lg:pt-48" aria-labelledby="projects-title">
	<div class="flex items-baseline justify-between gap-6">
		<h2 id="projects-title" class="font-serif text-4xl leading-tight lg:text-6xl">{$t('homeNext.projectsTitle')}</h2>
		<a href="/events" class="shrink-0 text-foreground-alt underline decoration-border-input-hover underline-offset-4 hover:text-foreground hover:decoration-foreground">
			{$t('homeNext.allProjects')}
		</a>
	</div>
	<div class="mt-12 lg:mt-16">
		<ProjectsGallery {projects} />
	</div>
</section>

<!-- The Talents. -->
{#if talents.length}
	<section class="container mx-auto max-w-8xl px-4 pt-32 lg:pt-48" aria-labelledby="talents-title">
		<div class="flex items-baseline justify-between gap-6">
			<h2 id="talents-title" class="font-serif text-4xl leading-tight lg:text-6xl">{$t('homeNext.talentsTitle')}</h2>
			<a href="/talents" class="shrink-0 text-foreground-alt underline decoration-border-input-hover underline-offset-4 hover:text-foreground hover:decoration-foreground">
				{$t('homeNext.allTalents')}
			</a>
		</div>
		<p class="mt-4 max-w-xl text-lg text-foreground-alt">{$t('homeNext.talentsBody')}</p>
		<div class="mt-12 lg:mt-16">
			<TalentsFrise {talents} />
		</div>
	</section>
{/if}

<!-- The disciplines, three lines into the manifesto. -->
<section class="container mx-auto max-w-8xl px-4 pt-32 lg:pt-48" aria-labelledby="disciplines-title">
	<h2 id="disciplines-title" class="font-serif text-4xl leading-tight lg:text-6xl">{$t('homeNext.disciplinesTitle')}</h2>
	<ul class="mt-12 border-b border-border-input-hover lg:mt-16">
		{#each DISCIPLINES as { key, anchor } (key)}
			<li class="border-t border-border-input-hover">
				<a href="/manifesto#{anchor}" class="group grid gap-2 py-8 lg:grid-cols-12 lg:items-baseline lg:gap-12 lg:py-10">
					<span class="font-serif text-4xl leading-tight transition-transform duration-500 ease-out group-hover:translate-x-2 lg:col-span-7 lg:text-6xl motion-reduce:transition-none">
						{$t(`manifesto.${key}.title`)}
					</span>
					<span class="font-serif text-xl text-foreground-alt italic lg:col-span-4 lg:col-start-9 lg:text-2xl">{$t(`manifesto.${key}.tagline`)}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<ClosingLetter />

