<!--
	The kitchen's view (issue 028): every party of the Day's Seatings with its
	size, the Dietary Requirements outlined, one Service at a time (Déjeuner,
	Dîner), opening on the Service under way.
-->
<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { ChefHat } from 'lucide-svelte';
	import type { DayGuestList } from '$lib/server/services/day-guest-list';
	import {
		currentSeatingId,
		guests,
		seatingTime,
		serviceLabel,
		servicesOf,
	} from './helpers';

	let { list, timeZone }: { list: DayGuestList; timeZone: string } = $props();

	/** The Service shown, kept in the address (`?service=diner`); by default the one under way. */
	const SERVICE_PARAM = 'service';
	const serviceKey = (kind: 'lunch' | 'dinner') => (kind === 'lunch' ? 'dejeuner' : 'diner');
	const services = $derived(servicesOf(list.seatings));
	// svelte-ignore state_referenced_locally
	let serviceId = $state<string | null>(
		servicesOf(list.seatings).find((s) => serviceKey(s.kind) === page.url.searchParams.get(SERVICE_PARAM))?.id ??
			list.seatings.find((s) => s.id === currentSeatingId(list.seatings, new Date()))?.serviceId ??
			null
	);
	const service = $derived(services.find((s) => s.id === serviceId) ?? services[0]);
	const serviceSeatings = $derived(service?.seatings ?? []);

	function showService(id: string) {
		serviceId = id;
		const url = new URL(page.url.href);
		const chosen = services.find((s) => s.id === id);
		if (chosen) url.searchParams.set(SERVICE_PARAM, serviceKey(chosen.kind));
		replaceState(url, page.state);
	}
</script>

<div class="space-y-4">
	{#if services.length > 1}
		<nav class="flex gap-1.5" aria-label="Service">
			{#each services as s (s.id)}
				<button
					type="button"
					onclick={() => showService(s.id)}
					aria-pressed={s.id === service?.id}
					class="min-h-11 flex-1 rounded-lg border px-4 text-base font-semibold transition-colors sm:flex-none pointer-fine:min-h-9 {s.id ===
					service?.id
						? 'border-foreground bg-foreground text-background'
						: 'border-border-card bg-background text-foreground hover:bg-muted'}"
				>
					{serviceLabel(s.kind)}
				</button>
			{/each}
		</nav>
	{/if}

	{#if list.seatings.length === 0}
		<div class="rounded-lg border border-border-card bg-background p-8 text-center">
			<p class="text-muted-foreground">Aucun service ce jour.</p>
		</div>
	{:else}
		{#each serviceSeatings as seating (seating.id)}
			{@const time = seatingTime(seating, timeZone)}
			<section class="space-y-2" aria-labelledby="cuisine-seating-{seating.id}">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-card pb-2">
					<h2 id="cuisine-seating-{seating.id}" class="text-lg leading-none font-semibold tabular-nums text-foreground">
						{time}
					</h2>
					{#if seating.titleFr}
						<span class="text-sm text-muted-foreground">{seating.titleFr}</span>
					{/if}
				</div>

				{#if seating.parties.length > 0}
					<!-- Every party and its size, the Dietary Requirements outlined. -->
					<ul class="divide-y divide-border-card rounded-lg border border-border-card bg-background">
						{#each seating.parties as party, i (party.id ?? i)}
							<li class="space-y-1.5 px-4 py-3">
								<p class="text-sm text-foreground">
									<span class="font-semibold">{party.guestName}</span>
									{#if party.quantity !== undefined}
										<span class="text-muted-foreground">· {guests(party.quantity)}</span>
									{/if}
								</p>
								{#if party.dietaryRequirements?.trim()}
									<p class="flex gap-2.5 font-medium break-words text-foreground">
										<ChefHat size={16} class="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
										<span class="min-w-0">{party.dietaryRequirements}</span>
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">Aucune réservation pour cette séance.</p>
				{/if}
			</section>
		{/each}
	{/if}
</div>
