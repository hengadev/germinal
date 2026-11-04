<script lang="ts">
	// « À venir » on the homepage (issue 071), as a typographic programme:
	// one row per upcoming Public Event, hairline rules between them, the
	// date set large on the left, soonest first (the loader's order).
	import { ArrowRight } from 'lucide-svelte';
	import { t, locale } from 'svelte-i18n';
	import { formatSeatingDate } from '$lib/utils/event-time';
	import { placeOf, subtitleOf, titleOf } from './home';
	import type { EventWithMedia } from '$lib/types/events';

	let { events }: { events: EventWithMedia[] } = $props();

	const lang = $derived($locale === 'en' ? 'en' : 'fr');

	/** « 19-20 » on one line, then « déc. 2026 » in small caps beneath. */
	function dateBlock(e: EventWithMedia) {
		if (!e.startDate) return { days: '', month: '' };
		const start = new Date(e.startDate);
		const end = e.endDate ? new Date(e.endDate) : start;
		const day = (d: Date) => formatSeatingDate(d, e.timeZone, lang, { day: 'numeric' });
		const days = day(start) === day(end) ? day(start) : `${day(start)}-${day(end)}`;
		return { days, month: formatSeatingDate(start, e.timeZone, lang, { month: 'short', year: 'numeric' }) };
	}
</script>

<ol class="border-b border-border-card">
	{#each events as e (e.id)}
		{@const d = dateBlock(e)}
		<li>
			<a
				href="/events/{e.id}"
				class="group grid grid-cols-[6.5rem_1fr] items-baseline gap-x-5 gap-y-2 border-t border-border-card py-7 lg:grid-cols-[12rem_1fr_16rem_auto] lg:gap-x-10 lg:py-9"
			>
				<span class="row-span-2 lg:row-span-1">
					<span class="block font-serif text-4xl leading-none whitespace-nowrap lg:text-6xl">{d.days}</span>
					<span class="mt-2 block text-xxs font-medium tracking-[0.15em] text-muted-foreground uppercase">{d.month}</span>
				</span>
				<span>
					<span class="block font-serif text-3xl leading-tight lg:text-5xl">{titleOf(e, $locale)}</span>
					{#if subtitleOf(e, $locale)}
						<span class="mt-2 block text-foreground-alt">{subtitleOf(e, $locale)}</span>
					{/if}
				</span>
				<span class="text-sm text-foreground-alt lg:self-center">{placeOf(e, $locale)}</span>
				<span class="hidden items-center gap-2 text-sm lg:inline-flex lg:self-center">
					<span class="underline decoration-border-input-hover underline-offset-4 group-hover:decoration-foreground">{$t('home.discover')}</span>
					<ArrowRight size={16} aria-hidden="true" class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
				</span>
			</a>
		</li>
	{/each}
</ol>
