<script lang="ts">
	/**
	 * Variante A — bottom sheet : la caméra reste visible en dessous, la
	 * fiche du groupe glisse du bas de l'écran, pouce accessible.
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

<div class="fixed inset-x-0 bottom-0 z-[60] border-t-2 lg:left-64 border-foreground bg-background shadow-[0_-8px_30px_rgb(0_0_0_/_0.25)]">
	<div class="mx-auto max-w-lg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
		<div class="mx-auto mb-3 h-1 w-10 rounded-full bg-border-card" aria-hidden="true"></div>

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h2 class="text-xl leading-snug font-semibold break-words text-foreground">
					{party.guestName}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground tabular-nums">
					{arrived} / {party.quantity} arrivé{arrived === 1 ? '' : 's'}
				</p>
				<div class="mt-1.5 flex flex-wrap gap-1.5">
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
			</div>
			<button
				type="button"
				onclick={onDismiss}
				aria-label="Fermer et reprendre le scan"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</div>

		{#if party.dietaryRequirements}
			<div class="mt-3 flex gap-2.5 rounded-md border border-foreground/80 px-3 py-2.5 text-sm text-foreground">
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
			class="mt-4 flex items-center gap-2"
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
			<span class="inline-flex items-center rounded-lg border border-border-card">
				<button
					type="button"
					onclick={() => (stepper = Math.max(1, stepper - 1))}
					aria-label="Une personne de moins"
					class="min-h-12 px-4 text-lg font-semibold text-foreground hover:bg-muted">−</button
				>
				<input
					name="guests"
					type="number"
					inputmode="numeric"
					min="1"
					max={Math.max(1, expected)}
					bind:value={stepper}
					required
					class="w-14 border-x border-border-card bg-background py-2.5 text-center text-lg font-semibold tabular-nums text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
				/>
				<button
					type="button"
					onclick={() => (stepper = Math.min(Math.max(1, expected), stepper + 1))}
					aria-label="Une personne de plus"
					class="min-h-12 px-4 text-lg font-semibold text-foreground hover:bg-muted">+</button
				>
			</span>
			<button
				type="submit"
				disabled={submitting}
				aria-busy={submitting}
				class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60"
			>
				{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
				{:else}<UserCheck size={16} aria-hidden="true" />{/if}
				Faire entrer
			</button>
		</form>
		{#if failure}<p class="mt-2 text-center text-sm font-semibold text-red-600" role="alert">{failure}</p>{/if}
	</div>
</div>
