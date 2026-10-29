<script lang="ts">
	/** Variante C — lignes denses façon tableau, le solde mis en avant. */
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

	const cols = $derived([
		fields.dietary ? 'Régimes' : null,
		fields.contact ? 'Coordonnées' : null,
	]);
</script>

<div class="space-y-6">
	{#each seatings as seating (seating.id)}
		{@const capacity = capacityLabel(seating)}
		<section aria-label="Service">
			<div class="flex items-baseline justify-between gap-3 mb-1">
				<h3 class="text-sm font-semibold text-foreground">{seatingLabel(seating, timeZone)}</h3>
				<span class="text-sm font-medium {capacity.over ? 'text-red-600' : 'text-muted-foreground'}">
					{capacity.text}
				</span>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border-card">
							<th class="py-2 pr-3 font-medium">Invité</th>
							<th class="py-2 pr-3 font-medium w-14 text-right">Taille</th>
							{#if cols[0]}
								<th class="py-2 pr-3 font-medium">Régimes</th>
							{/if}
							{#if cols[1]}
								<th class="py-2 pr-3 font-medium">Coordonnées</th>
							{/if}
							{#if fields.guestList}
								<th class="py-2 font-medium text-right">Solde</th>
							{/if}
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each seating.parties as party (party.id ?? partyLabel(party))}
							{@const balance = balanceLabel(party, fields)}
							<tr>
								<td class="py-2 pr-3 font-medium text-foreground">
									{partyLabel(party)}
									{#if party.isComp}
										<span class="ml-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-xs align-middle">Comp</span>
									{/if}
								</td>
								<td class="py-2 pr-3 text-right tabular-nums text-muted-foreground">
									{party.quantity ?? '—'}
								</td>
								{#if cols[0]}
									<td class="py-2 pr-3 text-foreground-alt">{party.dietaryRequirements ?? '—'}</td>
								{/if}
								{#if cols[1]}
									<td class="py-2 pr-3 text-muted-foreground">
										{#if party.guestPhone}{party.guestPhone}{/if}
										{#if party.guestPhone && party.guestEmail} · {/if}
										{#if party.guestEmail}{party.guestEmail}{/if}
										{#if !party.guestPhone && !party.guestEmail}—{/if}
									</td>
								{/if}
								{#if fields.guestList}
									<td class="py-2 text-right tabular-nums font-semibold {party.balanceAmount! > 0 ? 'text-orange-700' : 'text-muted-foreground'}">
										{balance ?? '—'}
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/each}
</div>
