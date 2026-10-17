<script lang="ts">
	// Time Zone of the Event's venue (ADR 0006), picked in the Lieu section.
	// Seating times are typed and shown on its clock everywhere. Posted as
	// `timeZone`; a disabled (locked) select posts nothing, so the zone stays.
	import { Globe } from 'lucide-svelte';
	import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';

	let {
		value = $bindable(DEFAULT_EVENT_TIME_ZONE),
		zones,
		locked = false,
		id = 'timeZone',
	}: {
		/** The Event's Time Zone; bindable so the host can follow the pick. */
		value?: string;
		/** IANA zones to pick from. */
		zones: string[];
		/** Locked once any Seating has a Reservation: Tickets must not shift. */
		locked?: boolean;
		id?: string;
	} = $props();

	const options = $derived(zones.includes(value) ? zones : [value, ...zones]);
</script>

<div>
	<label for={id} class="block text-sm font-medium text-foreground-alt mb-2">Fuseau horaire</label>
	<div class="relative">
		<Globe size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
		<select
			{id}
			name="timeZone"
			bind:value
			disabled={locked}
			aria-describedby="{id}-help"
			class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent disabled:opacity-60"
		>
			{#each options as zone (zone)}
				<option value={zone}>{zone.replaceAll('_', ' ')}</option>
			{/each}
		</select>
	</div>
	<p id="{id}-help" class="mt-2 text-xs text-muted-foreground">
		{#if locked}
			Le fuseau horaire ne peut plus être modifié : des séances ont déjà des réservations.
		{:else}
			Les heures des séances sont saisies et affichées à l’heure du lieu. Changer de fuseau conserve les
			heures saisies.
		{/if}
	</p>
</div>
