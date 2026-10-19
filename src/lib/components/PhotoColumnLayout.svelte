<script lang="ts">
	// The Event page's layout, for the announcement and the Portfolio project
	// alike: the photographs are the page. On desktop a column on the left
	// holds still (scrolling on its own when it runs long) with the title,
	// the text and the booking, while the photographs stream down the right,
	// each at its own proportions. On phones: the head, the photographs, then
	// the rest. Any photograph opens full screen.
	import type { Snippet } from 'svelte';
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { PageMedium } from '$lib/utils/event-page';
	import PhotoViewer from './PhotoViewer.svelte';

	let {
		photos,
		title,
		head,
		body,
	}: {
		photos: PageMedium[];
		/** The Event's title: the fallback alt text and the viewer's heading. */
		title: string;
		head: Snippet;
		body: Snippet;
	} = $props();

	let open: number | null = $state(null);
	const count = (n: number) => String(n).padStart(2, '0');
</script>

<!-- The photographs, rendered in the column on phones and beside it on desktop. -->
{#snippet stream()}
	{#each photos as photo, i (photo.id)}
		<button
			type="button"
			onclick={() => (open = i)}
			aria-label={$t('events.page.viewer.open', { values: { index: i + 1 } })}
			class="relative block w-full cursor-zoom-in"
		>
			{#if photo.type === 'video'}
				<video src={photo.url} autoplay muted loop playsinline class="block h-auto w-full" aria-label={mediaAlt(photo, $locale, title)}></video>
			{:else}
				<img
					src={photo.url}
					alt={mediaAlt(photo, $locale, title)}
					loading={i < 2 ? 'eager' : 'lazy'}
					decoding="async"
					class="block h-auto w-full"
				/>
			{/if}
			{#if photos.length > 1}
				<span class="absolute top-3 right-3 font-mono text-[11px] text-white mix-blend-difference" aria-hidden="true">
					{count(i + 1)} / {count(photos.length)}
				</span>
			{/if}
		</button>
	{/each}
{/snippet}

<div class="pt-[72px] lg:grid lg:grid-cols-12">
	<!-- Without photographs the column simply widens into a page. -->
	<div
		class="px-6 pt-10 pb-24 lg:px-12 lg:pt-14 lg:pb-16 {photos.length
			? 'lg:sticky lg:top-[72px] lg:col-span-5 lg:h-[calc(100svh-72px)] lg:overflow-y-auto xl:col-span-4'
			: 'lg:col-span-7 xl:col-span-6'}"
	>
		{@render head()}
		{#if photos.length}
			<section class="-mx-4 mt-10 flex flex-col gap-2 lg:hidden" aria-label={$t('events.project.photographs')}>
				{@render stream()}
			</section>
		{/if}
		<div class="mt-14 lg:mt-12">{@render body()}</div>
	</div>
	{#if photos.length}
		<section
			class="hidden flex-col gap-2 pt-2 pr-2 lg:col-span-7 lg:flex xl:col-span-8"
			aria-label={$t('events.project.photographs')}
		>
			{@render stream()}
		</section>
	{/if}
</div>

<PhotoViewer {photos} bind:index={open} {title} />
