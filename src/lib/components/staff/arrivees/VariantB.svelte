<script lang="ts">
	/** Variante B — une grande carte par groupe, cibles tactiles larges. */
	import { Users, Phone, Mail } from 'lucide-svelte';
	import type { DayGuestSeating } from '$lib/server/services/day-guest-list';
	import { seatingLabel, capacityLabel, partyLabel, balanceLabel, type ArriveesFields } from './helpers';

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

<div class="space-y-8">
	{#each seatings as seating (seating.id)}
		{@const capacity = capacityLabel(seating)}
		<section aria-label="Service">
			<h3 class="text-base font-semibold text-foreground mb-3">
				{seatingLabel(seating, timeZone)}
				<span class="ml-2 text-sm font-medium {capacity.over ? 'text-red-600' : 'text-muted-foreground'}">
					{capacity.text}
				</span>
			</h3>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each seating.parties as party, i (party.id ?? i)}
					{@const balance = fields.guestList ? balanceLabel(party, fields) : null}
					<div class="bg-background border border-border-card rounded-xl p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="text-base font-semibold text-foreground truncate">{partyLabel(party)}</p>
								<div class="flex items-center gap-2 mt-1.5 flex-wrap">
									{#if party.quantity !== undefined}
										<span class="inline-flex items-center gap-1 text-sm text-muted-foreground">
											<Users size={14} /> {party.quantity}
										</span>
									{/if}
									{#if party.isComp}
										<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs font-medium">Comp</span>
									{/if}
								</div>
							</div>
							{#if balance !== null && party.balanceAmount! > 0}
								<span class="px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-sm font-semibold tabular-nums shrink-0">
									{balance}
								</span>
							{/if}
						</div>
						{#if fields.dietary && party.dietaryRequirements}
							<p class="mt-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2">
								{party.dietaryRequirements}
							</p>
						{/if}
						{#if fields.contact && (party.guestPhone || party.guestEmail)}
							<div class="mt-3 space-y-1 text-sm text-muted-foreground">
								{#if party.guestPhone}
									<a href="tel:{party.guestPhone}" class="flex items-center gap-2 hover:text-foreground"><Phone size={14} /> {party.guestPhone}</a>
								{/if}
								{#if party.guestEmail}
									<p class="flex items-center gap-2 truncate"><Mail size={14} /> {party.guestEmail}</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
