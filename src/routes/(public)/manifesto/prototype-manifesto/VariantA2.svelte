<script lang="ts">
	// PROTOTYPE — A2 « Relais »: the poster on one stage that holds still.
	// Scrolling hands the stage from one sentence to the next: the words
	// leave upwards and the next sentence rises in word by word, its
	// photograph opening in the line. The title is the first sentence.
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { ManifestoPhoto } from '../+page.server';
	import PinnedStage from './PinnedStage.svelte';
	import { THESES, photoAt, photoTitle } from './shared';

	let { photos }: { photos: ManifestoPhoto[] } = $props();

	/** The sentence's words, and where its photograph goes: after the first comma, else halfway. */
	function wordsOf(sentence: string): { words: string[]; at: number } {
		const words = sentence.split(' ');
		const comma = words.findIndex((w) => /[,:;]$/.test(w));
		return { words, at: comma >= 0 ? comma + 1 : Math.ceil(words.length / 2) };
	}

	const count = THESES.length + 1;
	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<!-- The whole text for screen readers; the stage is its visual staging. -->
<div class="sr-only">
	<h1>{$t('manifesto.title')}</h1>
	<p>{$t('manifesto.intro')}</p>
	{#each THESES as key (key)}
		<h2>{$t(`manifesto.theses.${key}.statement`)}</h2>
		<p>{$t(`manifesto.theses.${key}.body`)}</p>
	{/each}
</div>

<PinnedStage {count}>
	{#snippet children({ index, progress })}
		<div class="container mx-auto flex h-full max-w-8xl flex-col px-4" aria-hidden="true">
			<div class="grid flex-1 items-center">
				<!-- The title, first. -->
				<div class="col-start-1 row-start-1">
					<p class="font-serif text-5xl leading-[1.04] lg:text-8xl">
						{#each $t('manifesto.title').split(' ') as word, w (w)}
							<span
								class="word {index === 0 ? 'is-on' : 'is-gone'}"
								style="transition-delay: {index === 0 ? w * 45 : 0}ms">{word}</span
							>{' '}
						{/each}
					</p>
					<p
						class="mt-10 max-w-xl text-lg leading-relaxed text-foreground-alt transition-opacity duration-700 lg:ml-[41.666%] lg:text-xl {index === 0
							? 'opacity-100 delay-300'
							: 'opacity-0'}"
					>
						{$t('manifesto.intro')}
					</p>
				</div>

				{#each THESES as key, i (key)}
					{@const n = i + 1}
					{@const state = n === index ? 'is-on' : n < index ? 'is-gone' : 'is-next'}
					{@const { words, at } = wordsOf($t(`manifesto.theses.${key}.statement`))}
					{@const photo = photoAt(photos, i)}
					<div class="col-start-1 row-start-1 {n === index ? '' : 'pointer-events-none'}">
						<p class="font-serif text-4xl leading-[1.08] lg:text-8xl">
							{#each words as word, w (w)}
								{#if w === at && photo}
									<a
										href="/events/{photo.eventId}"
										tabindex={n === index ? 0 : -1}
										class="photo word {state}"
										style="transition-delay: {n === index ? w * 45 : 0}ms"
									>
										<img
											src={photo.url}
											alt={mediaAlt(photo, $locale, photoTitle(photo, $locale))}
											class="h-full w-full object-cover grayscale transition-[filter] duration-500 hover:grayscale-0"
										/>
									</a>{' '}
								{/if}
								<span class="word {state}" style="transition-delay: {n === index ? w * 45 + 120 : 0}ms">{word}</span>{' '}
							{/each}
						</p>
						<p
							class="mt-8 max-w-md leading-relaxed text-foreground-alt transition-opacity duration-700 lg:mt-12 lg:ml-[41.666%] lg:text-lg {n === index
								? 'opacity-100 delay-500'
								: 'opacity-0'}"
						>
							{$t(`manifesto.theses.${key}.body`)}
						</p>
					</div>
				{/each}
			</div>

			<!-- Where the reader is in the run. -->
			<div class="flex items-center gap-4 pb-6 font-mono text-xs text-muted-foreground tabular-nums">
				<span>{pad(index + 1)} / {pad(count)}</span>
				<span class="relative h-px flex-1 bg-border-card">
					<span class="absolute inset-y-0 left-0 bg-foreground" style="width: {progress * 100}%"></span>
				</span>
			</div>
		</div>
	{/snippet}
</PinnedStage>

<style>
	.word {
		display: inline-block;
		transition:
			opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
			translate 900ms cubic-bezier(0.16, 1, 0.3, 1),
			filter 700ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.is-next {
		opacity: 0;
		translate: 0 0.45em;
		filter: blur(6px);
	}
	.is-gone {
		opacity: 0;
		translate: 0 -0.35em;
		filter: blur(6px);
	}
	.photo {
		height: 0.8em;
		width: 1.5em;
		vertical-align: -0.06em;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		.word {
			transition: opacity 200ms linear;
			translate: none;
			filter: none;
		}
	}
</style>
