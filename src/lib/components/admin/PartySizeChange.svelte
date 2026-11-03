<script lang="ts">
	import { AlertCircle, Users } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import { quotePartySize } from '$lib/utils/party-size';
	import type { RefundPolicy } from '$lib/utils/refund-policy';

	/**
	 * « Modifier le nombre » (issue 046): the trigger and the panel that
	 * changes a confirmed Reservation's number of Guests, with the quote
	 * (new total, what is left to pay on site) recomputed as the number
	 * changes and the capacity warning — never a refusal.
	 */
	let {
		reservation,
		party,
		onsuccess,
		onerror
	}: {
		/** The Reservation, as the Admin page loads it. */
		reservation: {
			quantity: number;
			totalAmount: number;
			/** The Extras' share of the total (issue 068). */
			extrasAmount?: number;
			balanceAmount: number | null;
			currency: string;
			status: string;
			isComp: boolean;
		};
		/** What the quote needs beyond the Reservation (issue 046). */
		party: {
			depositPaid: number;
			checkedIn: number;
			availableCapacity: number | null;
			totalCapacity: number | null;
			/** Issue 047: for the over-paid refund suggestion. */
			refundPolicy: RefundPolicy;
			/** ISO: the Seating's start. */
			seatingStart: string;
		};
		onsuccess: (message: string) => void;
		onerror: (error: string) => void;
	} = $props();

	let showPanel = $state(false);
	let isSubmitting = $state(false);
	let qty = $state<number | null>(0);
	let error = $state('');

	function open() {
		qty = reservation.quantity;
		error = '';
		showPanel = true;
	}

	function step(delta: number) {
		qty = Math.max(1, (qty ?? reservation.quantity) + delta);
		error = '';
	}

	let quote = $derived(
		quotePartySize(
			{
				quantity: reservation.quantity,
				total: reservation.totalAmount,
				extrasTotal: reservation.extrasAmount ?? 0,
				depositPaid: party.depositPaid,
				balance: reservation.balanceAmount ?? 0,
				isComp: reservation.isComp,
				checkedIn: party.checkedIn,
				status: reservation.status,
				refundPolicy: party.refundPolicy,
				seatingStart: new Date(party.seatingStart),
				now: new Date()
			},
			qty ?? 0
		)
	);

	// Seats beyond capacity the change would take (never a refusal): as in
	// issue 045, « N places au-delà de la capacité ».
	let overflow = $derived(
		party.availableCapacity === null
			? 0
			: Math.max(0, (qty ?? 0) - reservation.quantity - party.availableCapacity)
	);

	let changed = $derived((qty ?? 0) !== reservation.quantity);

	// The over-paid refund (issue 047): pre-filled with the policy's
	// suggestion, in euros in the form, reset as the number changes.
	let overPaid = $derived((quote.ok ? quote.quote.overPaid : 0));
	let refundAmount = $state<number | null>(null);
	$effect(() => {
		const suggestion = quote.ok ? quote.quote.overPaidRefund : null;
		refundAmount = suggestion ? suggestion.amount / 100 : 0;
	});
</script>

{#if !showPanel}
	<button
		type="button"
		onclick={open}
		disabled={isSubmitting}
		class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
	>
		<Users size={18} />
		Modifier le nombre
	</button>
{:else}
	<form
		method="POST"
		action="?/changeGuests"
		class="border border-border-card rounded-lg p-4 space-y-3"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'success' && result.data) {
					showPanel = false;
					onsuccess((result.data as { message: string }).message);
					await update();
				} else if (result.type === 'failure' && result.data) {
					onerror((result.data as { error?: string }).error || 'Action échouée');
				}
			};
		}}
	>
		<h3 class="text-sm font-semibold text-foreground">Modifier le nombre de personnes</h3>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => step(-1)}
				class="w-10 h-10 shrink-0 border border-border-input rounded-lg text-lg font-semibold text-foreground hover:bg-muted"
				>−</button
			>
			<input
				type="number"
				name="quantity"
				min="1"
				step="1"
				bind:value={qty}
				oninput={() => { error = ''; }}
				class="min-w-0 flex-1 text-center px-3 py-2 border border-border-input rounded-lg text-sm bg-background text-foreground"
			/>
			<button
				type="button"
				onclick={() => step(1)}
				class="w-10 h-10 shrink-0 border border-border-input rounded-lg text-lg font-semibold text-foreground hover:bg-muted"
				>+</button
			>
		</div>

		{#if quote.ok && changed}
			<div class="space-y-1 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-foreground-alt">Nouveau total</span>
					<span class="font-semibold text-foreground">{formatCurrency(quote.quote.total, reservation.currency, 'fr-FR')}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-foreground-alt">Reste à payer sur place</span>
					<span class="font-semibold text-foreground">{formatCurrency(quote.quote.balance, reservation.currency, 'fr-FR')}</span>
				</div>
			</div>
			{#if overPaid > 0}
				<div class="space-y-1 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-foreground-alt">Trop-perçu</span>
						<span class="font-semibold text-foreground">{formatCurrency(overPaid, reservation.currency, 'fr-FR')}</span>
					</div>
					{#if quote.quote.overPaidRefund}
						<p class="text-xs text-foreground-alt">{quote.quote.overPaidRefund.reasonFr}</p>
					{/if}
					<label class="block space-y-1">
						<span class="text-foreground-alt">Remboursement ({reservation.currency})</span>
						<input
							type="number"
							name="refundAmount"
							min="0"
							step="0.01"
							max={overPaid / 100}
							bind:value={refundAmount}
							class="w-full px-3 py-2 border border-border-input rounded-lg text-sm bg-background text-foreground"
						/>
					</label>
				</div>
			{/if}
			{#if overflow > 0}
				<div class="flex items-center gap-1.5 text-xs text-amber-700">
					<AlertCircle size={14} />
					<span>{overflow} {overflow > 1 ? 'places' : 'place'} au-delà de la capacité</span>
				</div>
			{/if}
		{:else if !quote.ok && changed}
			<div class="flex items-center gap-1.5 text-xs text-red-600">
				<AlertCircle size={14} />
				<span>{quote.error}</span>
			</div>
		{/if}

		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => { showPanel = false; }}
				disabled={isSubmitting}
				class="flex-1 px-3 py-2 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50"
			>
				Retour
			</button>
			<button
				type="submit"
				disabled={isSubmitting || !changed || !quote.ok}
				class="flex-1 px-3 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Confirmer
			</button>
		</div>
	</form>
{/if}
