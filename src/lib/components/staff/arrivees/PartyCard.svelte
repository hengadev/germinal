<script lang="ts">
	/**
	 * One party at the door, built for a phone held at arm's length: the
	 * name, what is left to collect on site, and the party size the door asks
	 * for first. The Dietary Requirements are outlined for the kitchen. With
	 * the contact permission, « Appeler » rings the party; the number itself is
	 * not printed (the search still finds it). Black and white, like the rest
	 * of the back office.
	 */
	import { ChefHat, Gift, Phone } from 'lucide-svelte';
	import type { DayGuestParty } from '$lib/server/services/day-guest-list';
	import { balanceDue, type ArriveesFields } from './helpers';

	let { party, fields }: { party: DayGuestParty; fields: ArriveesFields } = $props();

	const balance = $derived(balanceDue(party));
	const PILL =
		'inline-flex min-h-7 items-center gap-1.5 rounded-md border border-foreground bg-background px-2.5 text-sm font-semibold';
</script>

<article class="rounded-lg border border-border-card bg-background p-4" aria-label={party.guestName}>
	<header class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h3 class="pt-0.5 text-lg leading-snug font-semibold break-words text-foreground">
				{party.guestName}
			</h3>
			{#if party.isComp || balance}
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					{#if party.isComp}
						<span class={PILL}><Gift size={14} aria-hidden="true" /> Offert</span>
					{:else if balance}
						<span class="{PILL} tabular-nums">Reste sur place {balance}</span>
					{/if}
				</div>
			{/if}
		</div>
		{#if party.quantity !== undefined}
			<p class="shrink-0 text-right">
				<span class="block text-3xl leading-none font-semibold tracking-tight tabular-nums text-foreground">
					{party.quantity}
				</span>
				<span class="text-xs text-muted-foreground">{party.quantity === 1 ? 'personne' : 'personnes'}</span>
			</p>
		{/if}
	</header>

	{#if fields.dietary && party.dietaryRequirements}
		<div class="mt-3 flex gap-2.5 rounded-md border border-foreground/80 px-3 py-2.5 text-sm text-foreground">
			<ChefHat size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
			<p class="min-w-0 break-words">
				<span class="font-semibold">Régime&nbsp;:</span>
				{party.dietaryRequirements}
			</p>
		</div>
	{/if}

	{#if fields.contact && party.guestPhone}
		<div class="mt-3 flex justify-end border-t border-border-card pt-3">
			<a
				href="tel:{party.guestPhone.replace(/[^\d+]/g, '')}"
				class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-card px-4 text-base text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
				aria-label="Appeler {party.guestName} au {party.guestPhone}"
			>
				<Phone size={16} aria-hidden="true" />
				Appeler
			</a>
		</div>
	{/if}
</article>
