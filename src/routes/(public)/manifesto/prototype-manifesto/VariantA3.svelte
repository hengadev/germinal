<script lang="ts">
	// PROTOTYPE — A3 « Composition »: the whole manifesto is one poster on a
	// stage that holds still, and scrolling composes it. Each sentence comes
	// up from a faint proof to ink in turn, its photograph opening in the
	// line and its gloss beneath; the ones already read stay set, so the
	// last step shows the poster complete.
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { ManifestoPhoto } from '../+page.server';
	import PinnedStage from './PinnedStage.svelte';
	import { THESES, photoAt, photoTitle } from './shared';

	let { photos }: { photos: ManifestoPhoto[] } = $props();

	function split(sentence: string): [string, string] {
		const words = sentence.split(' ');
		const comma = words.findIndex((w) => /[,:;]$/.test(w));
		const at = comma >= 0 ? comma + 1 : Math.ceil(words.length / 2);
		return [words.slice(0, at).join(' '), words.slice(at).join(' ')];
	}

	// One step per sentence, and a last one for the poster complete.
	const count = THESES.length + 1;
</script>

<div class="container mx-auto max-w-8xl px-4 pt-36 pb-16 lg:pt-48 lg:pb-24">
	<h1 class="max-w-5xl font-serif text-5xl leading-[1.02] text-balance lg:text-8xl">{$t('manifesto.title')}</h1>
	<p class="mt-10 max-w-xl text-lg leading-relaxed text-foreground-alt lg:mt-14 lg:ml-[41.666%] lg:text-xl">
		{$t('manifesto.intro')}
	</p>
</div>

<div class="sr-only">
	{#each THESES as key (key)}
		<h2>{$t(`manifesto.theses.${key}.statement`)}</h2>
		<p>{$t(`manifesto.theses.${key}.body`)}</p>
	{/each}
</div>

<PinnedStage {count} step={0.8}>
	{#snippet children({ index })}
		{@const complete = index === THESES.length}
		<div class="container mx-auto flex h-full max-w-8xl flex-col justify-center gap-10 px-4 lg:gap-16" aria-hidden="true">
			<p class="font-serif text-[1.65rem] leading-[1.18] lg:text-[3.4rem] lg:leading-[1.12]">
				{#each THESES as key, i (key)}
					{@const [before, after] = split($t(`manifesto.theses.${key}.statement`))}
					{@const photo = photoAt(photos, i)}
					<span class="sentence {i === index || complete ? 'is-on' : i < index ? 'is-set' : 'is-proof'}"
						>{before}{' '}{#if photo}<a
								href="/events/{photo.eventId}"
								tabindex={i === index ? 0 : -1}
								class="photo {i === index ? 'is-open' : ''}"
								><img src={photo.url} alt={mediaAlt(photo, $locale, photoTitle(photo, $locale))} class="h-full w-full object-cover" /></a
							>{/if}{after}</span
					>{' '}
				{/each}
			</p>

			<div class="grid lg:ml-[58.333%] lg:max-w-md">
				{#each THESES as key, i (key)}
					<p
						class="col-start-1 row-start-1 leading-relaxed text-foreground-alt transition-[opacity,translate] duration-700 ease-out lg:text-lg {i === index
							? 'translate-y-0 opacity-100 delay-200'
							: 'translate-y-2 opacity-0'}"
					>
						{$t(`manifesto.theses.${key}.body`)}
					</p>
				{/each}
				<p
					class="col-start-1 row-start-1 font-serif text-lg italic text-muted-foreground transition-opacity duration-700 {complete
						? 'opacity-100 delay-200'
						: 'opacity-0'}"
				>
					{$t('manifesto.signature')}
				</p>
			</div>
		</div>
	{/snippet}
</PinnedStage>

<style>
	.sentence {
		transition: color 700ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.is-proof {
		color: color-mix(in srgb, var(--color-foreground) 12%, transparent);
	}
	.is-set {
		color: var(--color-foreground-alt);
	}
	.is-on {
		color: var(--color-foreground);
	}
	.photo {
		display: inline-block;
		height: 0.8em;
		width: 0;
		vertical-align: -0.06em;
		overflow: hidden;
		transition:
			width 900ms cubic-bezier(0.16, 1, 0.3, 1),
			margin 900ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.photo.is-open {
		width: 1.5em;
		margin-right: 0.25em;
	}
	@media (prefers-reduced-motion: reduce) {
		.sentence,
		.photo {
			transition: none;
		}
	}
</style>
