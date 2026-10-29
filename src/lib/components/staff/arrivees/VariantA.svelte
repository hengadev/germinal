<script lang="ts">
	/** Variante A — liste compacte groupée par Service, en-têtes collants. */
	import type { DayGuestSeating } from '$lib/server/services/day-guest-list';
	import {
		seatingLabel,
		capacityLabel,
		partyLabel,
		balanceLabel,
		type ArriveesFields,
	} from './helpers';

	let {
		seatings,
		fields,
		timeZone,
	}: {
		seatings: DayGuestSeating[];
		fields: ArriveesFields;
		timeZone: string;
	} = $props();
</script>

<div class="space-y-6">
	{#each seatings as seating (seating.id)}
		{@const capacity = capacityLabel(seating)}
		<section aria-label="Service">
			<div class="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background border-b border-border-card">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="text-sm font-semibold text-foreground">{seatingLabel(seating, timeZone)}</h3>
					<span class="text-sm font-medium {capacity.over ? 'text-red-600' : 'text-muted-foreground'}">
						{capacity.text}
					</span>
				</div>
			</div>
			<ul class="divide-y divide-border-card">
				{#each seating.parties as party, i (party.id ?? i)}
					{@const balance = fields.guestList ? balanceLabel(party, fields) : null}
					<li class="py-2.5 flex items-start justify-between gap-3 text-sm">
						<span class="min-w-0">
							<span class="block font-medium text-foreground truncate">{partyLabel(party)}</span>
							{#if fields.contact && (party.guestPhone || party.guestEmail)}
								<span class="block text-xs text-muted-foreground truncate">
									{#if party.guestPhone}<a href="tel:{party.guestPhone}" class="hover:underline">{party.guestPhone}</a>{/if}
									{#if party.guestPhone && party.guestEmail} · {/if}
									{#if party.guestEmail}{party.guestEmail}{/if}
								</span>
							{/if}
						</span>
						<span class="flex items-center gap-3 shrink-0">
							{#if fields.dietary && party.dietaryRequirements}
								<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium max-w-48 text-right">
									{party.dietaryRequirements}
								</span>
							{/if}
							{#if party.isComp}
								<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs font-medium">Comp</span>
							{/if}
							{#if party.quantity !== undefined}
								<span class="text-muted-foreground tabular-nums">{party.quantity}</span>
							{/if}
							{#if balance !== null && party.balanceAmount !== undefined && party.balanceAmount > 0}
								<span class="text-foreground tabular-nums">{balance}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
