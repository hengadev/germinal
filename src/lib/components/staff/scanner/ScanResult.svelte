<script lang="ts">
	/**
	 * Le résultat d'un scan (issue 018) : la caméra reste visible en dessous,
	 * la fiche du groupe glisse du bas de l'écran, à portée de pouce.
	 */
	import { enhance } from '$app/forms';
	import { fade, fly } from 'svelte/transition';
	import { ChefHat, Gift, LoaderCircle, Smartphone, UserCheck, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import type { ScanParty } from './types';
	import { applyArrivalToSnapshot } from '$lib/staff/offline/snapshot-store';
	import { enqueueArrival } from '$lib/staff/offline/arrival-queue.svelte';
	import { markOffline } from '$lib/staff/offline/online-state.svelte';
	import { addPendingArrival } from '$lib/staff/offline/pending-arrivals.svelte';

	let {
		eventId,
		party,
		offline,
		onDone,
		onDismiss
	}: {
		eventId: string;
		party: ScanParty;
		/** Issue 060 : la fiche vient de la copie du téléphone, sans réseau. */
		offline?: boolean;
		onDone: (guests: number) => void;
		onDismiss: () => void;
	} = $props();

	const arrived = $derived(party.arrived);
	const expected = $derived((party.quantity ?? 1) - arrived);

	let stepper = $state(Math.max(1, expected));
	let submitting = $state(false);
	let failure = $state<string | null>(null);
	// Id of the arrival attempt in progress (issue 059): a double tap or a
	// retried request with the same id counts once.
	let clientId = $state(crypto.randomUUID());

	// Issue 061: an arrival without network waits in the phone's queue and
	// counts straight away in the Day's copy and on the party cards.
	function queueOffline() {
		if (!party.id) return;
		const guests = stepper;
		enqueueArrival({
			clientId,
			eventId,
			reservationId: party.id,
			guestName: party.guestName,
			guests,
			method: 'scan',
			queuedAt: new Date().toISOString()
		});
		applyArrivalToSnapshot(eventId, party.id, guests);
		addPendingArrival(party.id, guests);
		clientId = crypto.randomUUID();
		onDone(guests);
	}
</script>

<!-- Motion (issue 033): the sheet slides up over a fading backdrop and
     slides back down on close. The transitions are global so they also run
     when Scanner removes the component. -->
<div
	class="fixed inset-0 z-[65] bg-foreground/25"
	transition:fade|global={{ duration: motion(200) }}
	aria-hidden="true"
></div>
<div
	data-no-swipe
	class="fixed inset-x-0 bottom-0 z-[70] border-t-2 border-foreground bg-background shadow-[0_-8px_30px_rgb(0_0_0_/_0.25)]"
	transition:fly|global={{ y: 320, duration: motion(250), easing: cubicOut }}
>
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

		{#if offline}
			<!-- Issue 061 : hors ligne, l'arrivée attend le réseau dans la file
			     du téléphone, et compte tout de suite dans la copie du Jour. -->
			<p class="mt-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
				<Smartphone size={16} aria-hidden="true" />
				Données du téléphone · entrée en attente du réseau
			</p>
			{#if party.id}
				<form
					method="POST"
					class="mt-4 flex items-center gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						queueOffline();
					}}
				>
					<input type="hidden" name="reservationId" value={party.id} />
					<input type="hidden" name="clientId" value={clientId} />
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
						class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60"
					>
						<UserCheck size={16} aria-hidden="true" />
						Faire entrer
					</button>
				</form>
			{:else}
				<p
						class="mt-3 flex min-h-12 items-center justify-center rounded-lg border-2 border-foreground/40 px-4 text-base font-semibold text-muted-foreground"
					>
					L'entrée demande le réseau
					</p>
			{/if}
		{:else}
		<form
			method="POST"
			action={`/staff/events/${eventId}?/scanCheckIn`}
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
						// A fresh attempt gets a fresh id.
						clientId = crypto.randomUUID();
					} else if (result.type === 'error' && party.id) {
						// No answer from the server: queue it with the same id — if it
						// was recorded after all, the replay is a duplicate (059).
						markOffline();
						queueOffline();
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
			<input type="hidden" name="clientId" value={clientId} />
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
		{/if}
	</div>
</div>
