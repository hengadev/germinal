<script lang="ts">
	// The Talents in one row, as a frieze of
	// photographs of uneven heights standing on one line, the name and
	// craft beneath each. Under the row, the words of the one under the
	// pointer (or the keyboard), set large. On phones, a strip to swipe.
	import { locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { TalentWithMedia } from '$lib/types/talents';
	import { nameOf, quoteOf, quoted, roleOf } from './home';

	let { talents }: { talents: TalentWithMedia[] } = $props();

	// Heights, in turn, so the row reads as a frieze rather than a grid.
	const HEIGHTS = ['lg:h-[26rem]', 'lg:h-[20rem]', 'lg:h-[23rem]', 'lg:h-[18rem]', 'lg:h-[25rem]', 'lg:h-[21rem]'];
	let current = $state(0);
	const words = $derived(talents[current] ? quoteOf(talents[current], $locale) : '');
</script>

<ul class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:items-end lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
	{#each talents as talent, i (talent.id)}
		<li class="w-[60vw] shrink-0 snap-start sm:w-[16rem] lg:w-auto lg:flex-1">
			<a href="/talents/{talent.id}" class="group block" onmouseenter={() => (current = i)} onfocus={() => (current = i)}>
				{#if talent.profileMedia}
					<img
						src={talent.profileMedia.url}
						alt={mediaAlt(talent.profileMedia, $locale, nameOf(talent))}
						class="aspect-[3/4] w-full object-cover transition-[filter] duration-500 lg:aspect-auto {HEIGHTS[i % HEIGHTS.length]} {i === current
							? ''
							: 'lg:grayscale'}"
						loading="lazy"
					/>
				{/if}
				<span class="mt-4 block font-serif text-xl leading-tight group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4 lg:text-2xl">{nameOf(talent)}</span>
				<span class="mt-1 block text-foreground-alt italic">{roleOf(talent, $locale)}</span>
			</a>
		</li>
	{/each}
</ul>
<p class="mt-12 hidden min-h-[2.5em] max-w-4xl font-serif text-3xl leading-snug lg:block lg:text-4xl">
	{#if words}{quoted(words, $locale)}{/if}
</p>
