<script lang="ts">
	/**
	 * Variante C — bandeau compact : la caméra continue de tourner
	 * en dessous, le groupe tient dans un bandeau dense en haut.
	 */
	import { enhance } from '$app/forms';
	import { ChefHat, Gift, LoaderCircle, UserCheck, X } from 'lucide-svelte';
	import type { ScanParty } from './types';

	let {
		party,
		onDone,
		onDismiss
	}: { party: ScanParty; onDone: (guests: number) => void; onDismiss: () => void } = $props();

	const arrived = $derived(party.arrived);
	const expected = $derived((party.quantity ?? 1) - arrived);

	let stepper = $state(Math.max(1, expected));
	let submitting = $state(false);
	let failure = $state<string | null>(null);
</script>

<div class="rounded-lg border-2 border-foreground bg-background">
	<div class="flex items-center justify-between gap-3 border-b border-border-card px-4 py-3">
		<h2 class="min-w-0 truncate text-lg font-semibold text-foreground">{party.guestName}</h2>
		<button
			type="button"
			onclick={onDismiss}
			aria-label="Fermer et reprendre le scan"
			class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm text-foreground">
		<span class="font-semibold tabular-nums">{arrived} / {party.quantity} arrivé{arrived === 1 ? '' : 's'}</span>
		{#if party.isComp}
			<span class="inline-flex items-center gap-1.5 font-semibold"><Gift size={14} aria-hidden="true" /> Offert</span>
		{:else if party.balance}
			<span class="font-semibold tabular-nums">Reste sur place {party.balance}</span>
		{/if}
	</div>

	{#if party.dietaryRequirements}
		<div class="flex gap-2.5 border-t border-border-card px-4 py-2.5 text-sm text-foreground">
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
		class="flex items-center gap-2 border-t border-border-card px-4 py-3"
		use:enhance={({ formData }) => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') {
					// Arrivées shows the new count too.
					const guests = Number(formData.get('guests'));
					await update({ reset: false });
					onDone(guests);
				} else {
					failure =
						result.type === 'failure'
							? ((result.data as { error?: string } | undefined)?.error ?? 'Une erreur est survenue.')
							: 'Une erreur est survenue.';
				}
			};
		}}
	>
		<input type="hidden" name="reservationId" value={party.id ?? ''} />
		<label class="text-sm font-medium text-foreground" for="scanner-stepper-c">Entrées</label>
		<span class="inline-flex items-center rounded-lg border border-border-card">
			<button
				type="button"
				onclick={() => (stepper = Math.max(1, stepper - 1))}
				aria-label="Une personne de moins"
				class="min-h-11 px-3 text-lg font-semibold text-foreground hover:bg-muted">−</button
			>
			<input
				id="scanner-stepper-c"
				name="guests"
				type="number"
				inputmode="numeric"
				min="1"
				max={Math.max(1, expected)}
				bind:value={stepper}
				required
				class="w-12 border-x border-border-card bg-background py-2 text-center text-base font-semibold tabular-nums text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
			/>
			<button
				type="button"
				onclick={() => (stepper = Math.min(Math.max(1, expected), stepper + 1))}
				aria-label="Une personne de plus"
				class="min-h-11 px-3 text-lg font-semibold text-foreground hover:bg-muted">+</button
			>
		</span>
		<button
			type="submit"
			disabled={submitting}
			aria-busy={submitting}
			class="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60"
		>
			{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
			{:else}<UserCheck size={16} aria-hidden="true" />{/if}
			Faire entrer
		</button>
	</form>
	{#if failure}<p class="mt-2 text-center text-sm font-semibold text-red-600" role="alert">{failure}</p>{/if}
</div>
