<script lang="ts">
	// A Drinks card (issue 086) set like the printed card the Admin edits:
	// its name, a short rule, then section by section — the label in small
	// capitals, one drink a line in italics with its price on the right when
	// it has one, its description under it — then the note apart, in small
	// print.
	import { t } from 'svelte-i18n';
	import type { DrinksView } from '$lib/utils/event-page';

	let {
		drinks,
		/** Above the name; « Réglées sur place » unless given. */
		heading,
		class: className = '',
	}: { drinks: DrinksView; heading?: string; class?: string } = $props();

	const small = 'text-[11px] uppercase tracking-[0.2em] text-muted-foreground';
	const kicker = $derived(heading ?? $t('events.drinks.onSite'));
</script>

<section class="flex flex-col items-center text-center {className}">
	<header class="flex flex-col gap-2">
		{#if kicker}<p class={small}>{kicker}</p>{/if}
		<h3 class="font-serif text-3xl leading-tight text-balance">{drinks.name || $t('events.drinks.title')}</h3>
	</header>
	<span class="my-6 block h-px w-10 bg-foreground/40" aria-hidden="true"></span>
	<ol class="flex w-full max-w-sm flex-col gap-6">
		{#each drinks.sections as section, i (i)}
			<li class="flex flex-col gap-2.5">
				{#if section.label}<p class={small}>{section.label}</p>{/if}
				{#each section.drinks as drink, d (d)}
					<div class="flex flex-col gap-0.5 text-left">
						<p class="flex items-baseline gap-3 leading-snug">
							<span class="text-lg italic text-pretty">{drink.name}</span>
							{#if drink.price}<span class="ml-auto shrink-0 text-sm tabular-nums text-foreground-alt">{drink.price}</span>{/if}
						</p>
						{#if drink.description}
							<p class="text-xs leading-relaxed text-pretty text-muted-foreground">{drink.description}</p>
						{/if}
					</div>
				{/each}
			</li>
		{/each}
	</ol>
	{#if drinks.note}
		<p class="mt-8 max-w-xs text-xs leading-relaxed text-pretty text-muted-foreground">{drinks.note}</p>
	{/if}
</section>
