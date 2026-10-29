<script lang="ts">
	/**
	 * Variante B — plein écran : la fiche remplace la caméra, la taille du
	 * groupe en très grand est la première chose que la porte voit.
	 */
	import { enhance } from '$app/forms';
	import { ChefHat, Gift, LoaderCircle, UserCheck } from 'lucide-svelte';
	import type { ScanParty } from './types';

	let { party, onDone }: { party: ScanParty; onDone: (guests: number) => void } = $props();

	const arrived = $derived(party.arrived);
	const expected = $derived((party.quantity ?? 1) - arrived);

	let stepper = $state(Math.max(1, expected));
	let submitting = $state(false);
</script>

<div class="rounded-lg border-2 border-foreground bg-background p-6 text-center">
	<p class="text-sm font-medium text-muted-foreground">Groupe</p>
	<h2 class="mt-1 text-2xl leading-snug font-bold break-words text-foreground">
		{party.guestName}
	</h2>

	<p class="mt-6">
		<span class="block text-7xl leading-none font-bold tracking-tight tabular-nums text-foreground">
			{party.quantity}
		</span>
		<span class="mt-2 block text-sm text-muted-foreground">
			{party.quantity === 1 ? 'personne' : 'personnes'} — {arrived} déjà arrivé{arrived === 1 ? '' : 's'}
		</span>
	</p>

	<div class="mt-4 flex justify-center gap-1.5">
		{#if party.isComp}
			<span class="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-foreground bg-background px-2.5 text-sm font-semibold">
				<Gift size={14} aria-hidden="true" /> Offert
			</span>
		{:else if party.balance}
			<span class="inline-flex min-h-7 items-center rounded-md border border-foreground bg-background px-2.5 text-sm font-semibold tabular-nums">
				Reste sur place {party.balance}
			</span>
		{/if}
	</div>

	{#if party.dietaryRequirements}
		<div class="mt-4 flex gap-2.5 rounded-md border border-foreground/80 px-3 py-2.5 text-left text-sm text-foreground">
			<ChefHat size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
			<p class="min-w-0 break-words">
				<span class="font-semibold">Régime&nbsp;:</span>
				{party.dietaryRequirements}
			</p>
		</div>
	{/if}

	<form
		method="POST"
		action="?/scanCheckIn"
		class="mt-6 flex flex-col items-center gap-3"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') {
					onDone(stepper);
				} else {
					await update();
				}
			};
		}}
	>
		<input type="hidden" name="reservationId" value={party.id ?? ''} />
		<span class="inline-flex items-center rounded-lg border border-border-card">
			<button
				type="button"
				onclick={() => (stepper = Math.max(1, stepper - 1))}
				aria-label="Une personne de moins"
				class="min-h-12 px-5 text-lg font-semibold text-foreground hover:bg-muted">−</button
			>
			<input
				name="guests"
				type="number"
				inputmode="numeric"
				min="1"
				max={Math.max(1, expected)}
				bind:value={stepper}
				required
				class="w-16 border-x border-border-card bg-background py-2.5 text-center text-xl font-semibold tabular-nums text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
			/>
			<button
				type="button"
				onclick={() => (stepper = Math.min(Math.max(1, expected), stepper + 1))}
				aria-label="Une personne de plus"
				class="min-h-12 px-5 text-lg font-semibold text-foreground hover:bg-muted">+</button
			>
		</span>
		<button
			type="submit"
			disabled={submitting}
			aria-busy={submitting}
			class="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-lg font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60"
		>
			{#if submitting}<LoaderCircle size={18} class="animate-spin" aria-hidden="true" />
			{:else}<UserCheck size={18} aria-hidden="true" />{/if}
			Faire entrer
		</button>
	</form>
</div>
