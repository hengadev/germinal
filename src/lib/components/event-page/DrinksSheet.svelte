<script lang="ts">
	// The Event's Drinks card (issue 086), set like the Menu sheet: section
	// by section — the label in small capitals, one drink a line with its
	// price on the right when it has one, its description under it — then
	// the note apart, in small print. Paid on site, never booked.
	import { t } from 'svelte-i18n';
	import type { DrinksView } from '$lib/utils/event-page';

	let { drinks, class: className = '' }: { drinks: DrinksView; class?: string } = $props();
</script>

<section class="flex flex-col items-center gap-7 text-center {className}">
	<header class="flex flex-col gap-1.5">
		<p class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">{$t('events.drinks.onSite')}</p>
		<h3 class="font-serif text-2xl leading-tight text-balance">{drinks.name || $t('events.drinks.title')}</h3>
	</header>
	<ol class="flex w-full max-w-sm flex-col gap-5">
		{#each drinks.sections as section, i (i)}
			<li class="flex flex-col gap-2">
				{#if section.label}
					<p class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">{section.label}</p>
				{/if}
				{#each section.drinks as drink, d (d)}
					<div class="flex flex-col gap-0.5 text-left">
						<p class="flex items-baseline gap-3 leading-snug">
							<span class="text-pretty">{drink.name}</span>
							{#if drink.price}<span class="ml-auto shrink-0 tabular-nums text-foreground-alt">{drink.price}</span>{/if}
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
		<p class="mt-2 max-w-xs text-xs leading-relaxed text-pretty text-muted-foreground">{drinks.note}</p>
	{/if}
</section>
