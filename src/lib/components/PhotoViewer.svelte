<script lang="ts">
	// An Event's photographs full screen, one at a time: on paper, flat, the
	// count and the caption (its alt text) around it. ← / → keys, swipe or
	// the side buttons move through them; Escape closes. The neighbours are
	// loaded ahead so the next photograph is already there.
	import { t, locale } from 'svelte-i18n';
	import { mediaAlt } from '$lib/utils/media-alt';
	import type { PageMedium } from '$lib/utils/event-page';

	let {
		photos,
		/** The photograph shown, null while the viewer is closed. */
		index = $bindable(),
		title,
	}: { photos: PageMedium[]; index: number | null; title: string } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let startX: number | null = null;

	const current = $derived(index === null ? null : photos[index]);
	const count = (n: number) => String(n).padStart(2, '0');

	function go(step: number) {
		if (index !== null) index = (index + step + photos.length) % photos.length;
	}

	$effect(() => {
		if (current && dialog && !dialog.open) dialog.showModal();
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		event.stopPropagation();
		go(event.key === 'ArrowRight' ? 1 : -1);
	}

	function onpointerup(event: PointerEvent) {
		if (startX !== null && Math.abs(event.clientX - startX) > 50) go(event.clientX < startX ? 1 : -1);
		startX = null;
	}
</script>

{#if current && index !== null}
	<dialog
		bind:this={dialog}
		aria-label={title}
		{onkeydown}
		onclose={() => (index = null)}
		onpointerdown={(event) => (startX = event.clientX)}
		{onpointerup}
		class="m-0 h-svh max-h-none w-screen max-w-none bg-white p-0 text-foreground backdrop:bg-white"
	>
		<div class="flex h-full flex-col">
			<div class="flex items-center justify-between px-4 py-4 lg:px-8">
				<p class="font-mono text-sm tabular-nums">{count(index + 1)} / {count(photos.length)}</p>
				<p class="hidden font-serif text-lg sm:block">{title}</p>
				<button type="button" onclick={() => dialog?.close()} class="text-sm underline-offset-4 hover:underline">
					{$t('events.page.viewer.close')} ✕
				</button>
			</div>
			<div class="relative flex min-h-0 flex-1 items-center justify-center px-4 lg:px-24">
				{#key current.id}
					{#if current.type === 'video'}
						<video src={current.url} autoplay muted loop playsinline class="max-h-full max-w-full" aria-label={mediaAlt(current, $locale, title)}></video>
					{:else}
						<img src={current.url} alt={mediaAlt(current, $locale, title)} draggable="false" class="max-h-full max-w-full object-contain select-none" />
					{/if}
				{/key}
				{#if photos.length > 1}
					<button
						type="button"
						onclick={() => go(-1)}
						aria-label={$t('events.page.viewer.previous')}
						class="absolute inset-y-0 left-0 hidden w-24 items-center justify-center text-2xl hover:bg-surface/50 lg:flex"
					>←</button>
					<button
						type="button"
						onclick={() => go(1)}
						aria-label={$t('events.page.viewer.next')}
						class="absolute inset-y-0 right-0 hidden w-24 items-center justify-center text-2xl hover:bg-surface/50 lg:flex"
					>→</button>
				{/if}
			</div>
			<p class="min-h-14 px-4 py-4 text-center text-sm italic text-foreground-alt">{mediaAlt(current, $locale)}</p>
		</div>
		<div class="hidden" aria-hidden="true">
			{#each [photos[(index + 1) % photos.length], photos[(index - 1 + photos.length) % photos.length]] as neighbour, i (i)}
				{#if neighbour.type !== 'video'}<img src={neighbour.url} alt="" />{/if}
			{/each}
		</div>
	</dialog>
{/if}
