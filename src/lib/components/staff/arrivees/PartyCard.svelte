<script lang="ts">
	/**
	 * One party at the door, built for a phone held at arm's length: the
	 * name, what is left to collect on site, and the party size the door asks
	 * for first. The Dietary Requirements are outlined for the kitchen. With
	 * the contact permission, « Appeler » rings the party; the number itself is
	 * not printed (the search still finds it). Black and white, like the rest
	 * of the back office.
	 */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ChefHat, Gift, LoaderCircle, Phone, UserCheck, UserX } from 'lucide-svelte';
	import type { DayGuestParty } from '$lib/server/services/day-guest-list';
	import { balanceDue, guests as guestsLabel, type ArriveesFields } from './helpers';

	let {
			party,
			fields,
			canCheckIn = false,
			canCorrect = false
	}: { party: DayGuestParty; fields: ArriveesFields; canCheckIn?: boolean; canCorrect?: boolean } =
		$props();

	const balance = $derived(balanceDue(party));
	const arrived = party.arrived ?? 0;
	const expected = $derived((party.quantity ?? 0) - arrived);
	const allIn = $derived(party.quantity !== undefined && arrived >= party.quantity);

	const result = $derived.by(() => {
		const form = page.form as { error?: string; reservationId?: string } | null;
		return form && form.reservationId === party.id && form.error ? form.error : null;
	});

	// « Faire entrer » opens a small stepper pre-filled with the Guests still expected.
	let admitting = $state(false);
	let stepper = $state(0);
	let submitting = $state(false);
	let undoing = $state(false);

	function openStepper() {
		stepper = Math.max(1, expected);
		admitting = true;
	}

	const PILL =
		'inline-flex min-h-7 items-center gap-1.5 rounded-md border border-foreground bg-background px-2.5 text-sm font-semibold';
</script>

<article
	class="rounded-lg border border-border-card p-4 {allIn ? 'bg-muted/40' : 'bg-background'}"
	aria-label={party.guestName}
>
	<header class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h3 class="pt-0.5 text-lg leading-snug font-semibold break-words text-foreground">
				{party.guestName}
			</h3>
			{#if party.isComp || balance || (party.quantity !== undefined && arrived > 0)}
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					{#if party.isComp}
						<span class={PILL}><Gift size={14} aria-hidden="true" /> Offert</span>
					{:else if balance}
						<span class="{PILL} tabular-nums">Reste sur place {balance}</span>
					{/if}
					{#if party.quantity !== undefined && arrived > 0}
						<!-- Everyone in: a solid black pill, so the door sees at a glance the party is complete. -->
						<span
							class="inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm font-semibold tabular-nums {allIn
								? 'border-foreground bg-foreground text-background'
								: 'border-foreground bg-background text-foreground'}"
							>
							<UserCheck size={14} aria-hidden="true" />
							{arrived} / {party.quantity} arrivé{arrived === 1 ? '' : 's'}
						</span>
					{/if}
				</div>
			{/if}
		</div>
		{#if party.quantity !== undefined}
			<p class="shrink-0 text-right">
				<span class="block text-3xl leading-none font-semibold tracking-tight tabular-nums text-foreground">
					{party.quantity}
				</span>
				<span class="text-xs text-muted-foreground">{party.quantity === 1 ? 'personne' : 'personnes'}</span>
			</p>
		{/if}
	</header>

	{#if fields.dietary && party.dietaryRequirements}
		<div class="mt-3 flex gap-2.5 rounded-md border border-foreground/80 px-3 py-2.5 text-sm text-foreground">
			<ChefHat size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
			<p class="min-w-0 break-words">
				<span class="font-semibold">Régime&nbsp;:</span>
				{party.dietaryRequirements}
			</p>
		</div>
	{/if}

	{#if party.id && party.quantity !== undefined && (canCheckIn || (canCorrect && arrived > 0))}
		<div class="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border-card pt-3">
			{#if canCorrect && arrived > 0}
				<form
					method="POST"
					action="?/undoCheckIn"
					class="contents"
					use:enhance={() => {
						undoing = true;
						return async ({ update }) => {
							await update();
							undoing = false;
						};
					}}
				>
					<input type="hidden" name="reservationId" value={party.id} />
					<button
						type="submit"
						disabled={undoing}
						aria-busy={undoing}
						class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-card px-4 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60"
					>
						{#if undoing}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
						{:else}<UserX size={16} aria-hidden="true" />{/if}
						Annuler l’arrivée
					</button>
				</form>
			{/if}

			{#if canCheckIn}
				{#if admitting}
					<!-- The stepper: how many are arriving, pre-filled with the Guests still expected. -->
					<form
						method="POST"
						action="?/checkIn"
						class="flex min-w-60 flex-1 flex-wrap items-center justify-end gap-2"
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								await update();
								submitting = false;
								admitting = false;
							};
						}}
					>
						<input type="hidden" name="reservationId" value={party.id} />
						<label for="guests-{party.id}" class="text-sm font-medium text-foreground">Entrées</label>
						<span class="inline-flex items-center rounded-lg border border-border-card">
							<button
								type="button"
								onclick={() => (stepper = Math.min(party.quantity!, Math.max(1, stepper - 1)))}
								aria-label="Une personne de moins"
								class="min-h-11 px-3 text-lg font-semibold text-foreground hover:bg-muted"
							>−</button
							>
							<input
								id="guests-{party.id}"
								name="guests"
								type="number"
								inputmode="numeric"
								min="1"
								max={party.quantity}
								bind:value={stepper}
								required
								class="w-14 border-x border-border-card bg-background py-2 text-center text-lg font-semibold tabular-nums text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
							/>
							<button
								type="button"
								onclick={() => (stepper = Math.min(party.quantity!, stepper + 1))}
								aria-label="Une personne de plus"
								class="min-h-11 px-3 text-lg font-semibold text-foreground hover:bg-muted"
							>+</button
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
							Confirmer
						</button>
						<button
							type="button"
							onclick={() => (admitting = false)}
							class="min-h-11 rounded-lg px-3 text-base font-medium text-muted-foreground hover:text-foreground"
						>Fermer</button
						>
					</form>
				{:else}
					<!-- The largest button of the card's action row: the door uses it most. -->
					<button
						type="button"
						onclick={openStepper}
						class="inline-flex min-h-11 flex-1 basis-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
						aria-label="Faire entrer {party.guestName}"
					>
						<UserCheck size={16} aria-hidden="true" />
						Faire entrer{party.quantity !== undefined && expected < party.quantity ? ` (${guestsLabel(expected)} attendue${expected === 1 ? '' : 's'})` : ''}
					</button>
				{/if}
			{/if}
		</div>
		{#if result}<p class="mt-2 text-end text-sm font-medium text-destructive" role="status">{result}</p>{/if}
	{/if}

	{#if fields.contact && party.guestPhone}
		<div class="mt-3 flex justify-end border-t border-border-card pt-3">
			<a
				href="tel:{party.guestPhone.replace(/[^\d+]/g, '')}"
				class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-card px-4 text-base text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
				aria-label="Appeler {party.guestName} au {party.guestPhone}"
			>
				<Phone size={16} aria-hidden="true" />
				Appeler
			</a>
		</div>
	{/if}
</article>
