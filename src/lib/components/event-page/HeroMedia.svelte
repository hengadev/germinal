<script lang="ts">
	// The Event's announcement at the top of its page: the promotional
	// video, else the cover. A video starts muted and loops; it holds on its
	// poster for visitors who ask for less motion. Two icon buttons, where
	// video players put them (bottom right), let anyone pause it or hear it;
	// their names are spoken, not shown. A key visual already carries the
	// name: its alt text is the title.
	import { Pause, Play, Volume2, VolumeX } from 'lucide-svelte';
	import { t } from 'svelte-i18n';
	import type { HeroMedium } from '$lib/utils/event-page';

	let {
		medium,
		title,
		class: className = '',
		fit = 'cover',
	}: {
		medium: HeroMedium;
		title: string;
		class?: string;
		/** cover fills the frame; contain keeps the whole picture. */
		fit?: 'cover' | 'contain';
	} = $props();

	/** Less motion asked for: the video waits on its poster to be played. */
	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	let video: HTMLVideoElement | null = $state(null);
	let playing = $state(!still);
	let muted = $state(true);

	const fitClass = $derived(fit === 'cover' ? 'object-cover' : 'object-contain');
	const control =
		'flex size-10 items-center justify-center backdrop-blur-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 bg-black/35 text-white hover:bg-black/55 focus-visible:outline-white';
</script>

<div class="{/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} {className}">
	{#if medium.type === 'video'}
		<video
			bind:this={video}
			src={medium.src}
			poster={medium.poster ?? undefined}
			class="h-full w-full {fitClass}"
			autoplay={!still}
			loop
			playsinline
			bind:muted
			bind:paused={() => !playing, (p) => (playing = !p)}
			aria-label={title}
		></video>
		<div class="absolute right-3 bottom-3 z-10 flex gap-1.5">
			<button
				type="button"
				class={control}
				aria-label={playing ? $t('events.page.video.pause') : $t('events.page.video.play')}
				title={playing ? $t('events.page.video.pause') : $t('events.page.video.play')}
				onclick={() => (playing ? video?.pause() : video?.play())}
			>
				{#if playing}<Pause size={18} strokeWidth={1.75} />{:else}<Play size={18} strokeWidth={1.75} />{/if}
			</button>
			<button
				type="button"
				class={control}
				aria-label={muted ? $t('events.page.video.soundOn') : $t('events.page.video.mute')}
				title={muted ? $t('events.page.video.soundOn') : $t('events.page.video.mute')}
				onclick={() => (muted = !muted)}
			>
				{#if muted}<VolumeX size={18} strokeWidth={1.75} />{:else}<Volume2 size={18} strokeWidth={1.75} />{/if}
			</button>
		</div>
	{:else}
		<img src={medium.src} alt={medium.hasName ? title : ''} class="h-full w-full {fitClass}" />
	{/if}
</div>
