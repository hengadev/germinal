<script lang="ts">
	// Reservations list indicator (issue 041): the Guest declared Dietary
	// Requirements. Admins only; the answer itself is on the Reservation's
	// page and in the CSV export, and in the tooltip here.
	import { Utensils } from 'lucide-svelte';

	let { dietaryRequirements, compact = false }: { dietaryRequirements: string | null; compact?: boolean } = $props();
</script>

{#if dietaryRequirements}
	<span
		class="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-700 rounded-full {compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}"
		title="Allergies ou régime : {dietaryRequirements}"
	>
		<Utensils size={compact ? 10 : 12} />
		Régime
	</span>
{/if}
