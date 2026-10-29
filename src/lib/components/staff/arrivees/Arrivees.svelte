<script lang="ts">
	/**
	 * Arrivées (issue 016) — the Day's parties, grouped by Seating, shaped
	 * by the viewer's permissions. Search and the "not yet arrived" filter
	 * live here; the three toggleable variants below render the same data.
	 */
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Search } from 'lucide-svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import type { DayGuestList, DayGuestSeating } from '$lib/server/services/day-guest-list';

	let {
		list,
		fields,
		timeZone,
	}: {
		list: DayGuestList;
		fields: { guestList: boolean; dietary: boolean; contact: boolean };
		timeZone: string;
	} = $props();

	const VALID = ['a', 'b', 'c'] as const;
	type Variant = (typeof VALID)[number];

	const initial = $derived.by(() => {
		const v = page.url.searchParams.get('variante');
		return VALID.includes(v as Variant) ? (v as Variant) : 'a';
	});

	let variante = $state<Variant>(initial);
	let search = $state('');
	let notArrivedOnly = $state(false);

	function switchTo(v: Variant) {
		variante = v;
		const url = new URL(page.url);
		url.searchParams.set('variante', v);
		replaceState(url.toString(), page.state);
	}

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const out: DayGuestSeating[] = [];
		for (const seating of list.seatings) {
			// Until Check-ins exist (issue 017), every party counts as not
			// arrived, so the filter keeps them all.
			const parties = seating.parties.filter((p) => {
				if (!q) return true;
				return (p.guestName ?? '').toLowerCase().includes(q);
			});
			out.push({ ...seating, parties });
		}
		return out;
	});

	const total = $derived(filtered.reduce((n, s) => n + s.parties.length, 0));
</script>

<div class="space-y-4">
	<!-- VARIANT-SWITCHER -->
	<div class="flex items-center gap-2" role="group" aria-label="Variante d'affichage">
		<span class="text-xs text-muted-foreground">Affichage :</span>
		{#each ['a', 'b', 'c'] as v}
			<button
				type="button"
				onclick={() => switchTo(v as Variant)}
				aria-pressed={variante === v}
				class="px-3 py-1 text-xs font-medium rounded-full border transition-colors {variante === v
					? 'bg-foreground text-background border-foreground'
					: 'bg-background text-muted-foreground border-border-card hover:text-foreground'}"
			>
				{v.toUpperCase()}
			</button>
		{/each}
	</div>

	<!-- Recherche et filtre -->
	<div class="flex flex-col sm:flex-row gap-3">
		<div class="relative flex-1">
			<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
			<input
				type="search"
				bind:value={search}
				placeholder="Rechercher un invité…"
				class="w-full pl-9 pr-3 py-2 text-sm border border-border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				aria-label="Rechercher un invité"
			/>
		</div>
		<label class="flex items-center gap-2 text-sm text-foreground select-none py-2 sm:py-0">
			<input type="checkbox" bind:checked={notArrivedOnly} class="accent-primary size-4" />
			Pas encore arrivés
		</label>
	</div>

	<p class="text-xs text-muted-foreground">{total} {total === 1 ? 'groupe' : 'groupes'}</p>

	{#if total === 0}
		<div class="bg-background border border-border-card rounded-lg p-8 text-center">
			<p class="text-muted-foreground">Aucun invité {search ? 'ne correspond à cette recherche' : 'pour ce jour'}.</p>
		</div>
	{:else if variante === 'a'}
		<VariantA {fields} {timeZone} seatings={filtered} />
	{:else if variante === 'b'}
		<VariantB {fields} {timeZone} seatings={filtered} />
	{:else}
		<VariantC {fields} {timeZone} seatings={filtered} />
	{/if}
</div>
