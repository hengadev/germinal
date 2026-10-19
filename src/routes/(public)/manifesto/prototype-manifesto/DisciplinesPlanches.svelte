<script lang="ts">
	// PROTOTYPE — M2 « Planches »: each discipline is a plate, as in a
	// monograph. A large photograph of a past project on one side, the
	// name set across its edge — ink on the paper, paper on the picture —
	// and the description beside it. The plates alternate sides, and the
	// photographs stay in black and white until hovered, so that the name
	// reads across them.
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { ManifestoPhoto } from '../+page.server';
	import { DISCIPLINES, POINTS, THESES, photoAt, photoTitle } from './shared';

	let { photos }: { photos: ManifestoPhoto[] } = $props();
</script>

<section class="container mx-auto max-w-8xl px-4 pt-32 lg:pt-48" aria-labelledby="disciplines-title">
	<div class="grid gap-6 lg:grid-cols-12 lg:gap-12">
		<h2 id="disciplines-title" class="font-serif text-4xl leading-tight lg:col-span-6 lg:text-6xl">
			{$t('manifesto.servicesTitle')}
		</h2>
		<p class="max-w-xl text-lg leading-relaxed text-foreground-alt lg:col-span-5 lg:col-start-8 lg:pt-3 lg:text-xl">
			{$t('manifesto.servicesIntro')}
		</p>
	</div>

	<div class="mt-20 flex flex-col gap-24 lg:mt-32 lg:gap-40">
		{#each DISCIPLINES as { key, anchor }, i (key)}
			{@const photo = photoAt(photos, THESES.length + i)}
			{@const flip = i % 2 === 1}
			<article id={anchor} class="grid scroll-mt-28 items-end gap-8 lg:grid-cols-12 lg:gap-12">
				{#if photo}
					<a
						href="/events/{photo.eventId}"
						class="group block lg:row-start-1 {flip ? 'lg:col-span-7 lg:col-start-6' : 'lg:col-span-7 lg:col-start-1'}"
					>
						<img
							src={photo.url}
							alt={mediaAlt(photo, $locale, photoTitle(photo, $locale))}
							class="aspect-[4/3] w-full object-cover lg:aspect-square lg:grayscale lg:transition-[filter] lg:duration-700 lg:group-hover:grayscale-0"
						/>
						<span class="mt-3 block text-sm text-muted-foreground italic transition-colors group-hover:text-foreground-alt {flip ? 'lg:text-right' : ''}">
							{$t('manifesto.photoOf', { values: { title: photoTitle(photo, $locale), year: photo.year } })}
						</span>
					</a>
				{/if}

				<div class="lg:row-start-1 lg:pb-16 {flip ? 'lg:col-span-6 lg:col-start-1' : 'lg:col-span-6 lg:col-start-7'}">
					<h3
						class="name font-serif text-5xl leading-[0.98] text-balance lg:text-8xl {flip
							? 'lg:-mr-[40%] lg:text-right'
							: 'lg:-ml-[40%]'}"
					>
						{$t(`manifesto.${key}.title`)}
					</h3>
					<div class="mt-8 max-w-md lg:mt-12 {flip ? 'lg:mr-auto' : 'lg:ml-auto'}">
						<p class="font-serif text-2xl leading-snug italic lg:text-3xl">{$t(`manifesto.${key}.tagline`)}</p>
						<p class="mt-4 leading-relaxed text-foreground-alt lg:text-lg">{$t(`manifesto.${key}.body`)}</p>
						<ul class="mt-6 text-sm text-foreground-alt">
							{#each POINTS as n (n)}
								<li class="border-t border-border-card py-2.5 last:border-b">{$t(`manifesto.${key}.point${n}`)}</li>
							{/each}
						</ul>
					</div>
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	/* Ink on the paper, paper on the photograph. */
	@media (min-width: 64rem) {
		.name {
			color: white;
			mix-blend-mode: difference;
		}
	}
</style>
