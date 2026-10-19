<script lang="ts">
	// PROTOTYPE — the past projects as panels side by side, from the home
	// page as it was: the one under the pointer (or the keyboard) opens
	// wide and says its name, the others narrow and keep theirs written up
	// their edge. One is always open, the latest first, and it stays open
	// when the pointer leaves. On phones, a strip of photographs to swipe.
	import { locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { EventWithMedia } from '$lib/types/events';
	import { placeOf, subtitleOf, titleOf, yearOf } from './shared';

	let { projects }: { projects: EventWithMedia[] } = $props();

	let open = $state(0);
</script>

<!-- Desktop: the panels. -->
<ul class="hidden h-[72vh] max-h-[40rem] min-h-[28rem] gap-1.5 md:flex">
	{#each projects as project, i (project.id)}
		{@const title = titleOf(project, $locale)}
		<li class="panel relative min-w-0 overflow-hidden" style="flex: {i === open ? 5 : 1}">
			<a
				href="/events/{project.id}"
				class="group absolute inset-0 block text-white outline-offset-[-3px]"
				onmouseenter={() => (open = i)}
				onfocus={() => (open = i)}
				aria-label={title}
			>
				{#if project.coverMedia}
					<img
						src={project.coverMedia.url}
						alt={mediaAlt(project.coverMedia, $locale, title)}
						class="photo absolute inset-0 h-full w-full object-cover {i === open ? 'is-open' : ''}"
						loading="lazy"
					/>
				{:else}
					<span class="absolute inset-0 bg-surface-hover"></span>
				{/if}
				<span
					class="absolute inset-0 transition-opacity duration-500 {i === open
						? 'bg-[linear-gradient(to_top,rgb(0_0_0/0.65),transparent_45%)]'
						: 'bg-black/35'}"
					aria-hidden="true"
				></span>

				<!-- The open one says its name… -->
				<span
					class="absolute right-6 bottom-6 left-6 transition-[opacity,translate] duration-500 ease-out {i === open
						? 'translate-y-0 opacity-100 delay-200'
						: 'translate-y-3 opacity-0'}"
					aria-hidden={i !== open}
				>
					<span class="block font-serif text-4xl leading-tight whitespace-nowrap lg:text-5xl">{title}</span>
					<span class="mt-2 block max-w-lg text-lg text-white/85">{subtitleOf(project, $locale)}</span>
					<span class="mt-1 block text-sm text-white/70">{placeOf(project, $locale)}, {yearOf(project)}</span>
				</span>
				<!-- …the others keep theirs up their edge. -->
				<span
					class="absolute bottom-6 left-1/2 -translate-x-1/2 font-serif text-xl whitespace-nowrap transition-opacity duration-300 [writing-mode:vertical-rl] rotate-180 {i ===
					open
						? 'opacity-0'
						: 'opacity-100 delay-200'}"
					aria-hidden="true"
				>
					{title}
				</span>
			</a>
		</li>
	{/each}
</ul>

<!-- Phones: a strip. -->
<ul class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:hidden">
	{#each projects as project (project.id)}
		<li class="w-[78vw] shrink-0 snap-start">
			<a href="/events/{project.id}" class="block">
				{#if project.coverMedia}
					<img
						src={project.coverMedia.url}
						alt={mediaAlt(project.coverMedia, $locale, titleOf(project, $locale))}
						class="aspect-[4/5] w-full object-cover"
						loading="lazy"
					/>
				{/if}
				<span class="mt-3 block font-serif text-2xl">{titleOf(project, $locale)}</span>
				<span class="mt-1 block text-sm text-foreground-alt">{placeOf(project, $locale)}, {yearOf(project)}</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.panel {
		transition: flex 700ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.photo {
		filter: grayscale(0.6);
		scale: 1.04;
		transition:
			filter 700ms cubic-bezier(0.16, 1, 0.3, 1),
			scale 1200ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.photo.is-open {
		filter: none;
		scale: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.panel,
		.photo {
			transition: none;
		}
	}
</style>
