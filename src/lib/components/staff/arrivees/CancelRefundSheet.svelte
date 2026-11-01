<script lang="ts">
	/**
	 * La feuille Annuler / Rembourser d'une partie (issue 041), ouverte
	 * depuis le menu ⋮ de sa carte dans Arrivées. Annulation : le montant
	 * pré-rempli par la politique d'annulation, modifiable (0 autorisé), ou
	 * « Annulée par Germinal » pour un remboursement intégral. Remboursement
	 * partiel : sans annuler. Le serveur revérifie la permission et le jour
	 * en cours ; après un succès, un toast montre le message et la liste se
	 * recharge (une partie annulée quitte la liste).
	 */
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fade, fly } from 'svelte/transition';
	import { Ban, LoaderCircle, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { formatCurrency } from '$lib/utils/currency';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { cancelRefundForm, closeCancelRefund } from './cancel-refund.svelte';

	const toast = getToastContext();

	// The page renders twice (mobile and desktop): ids unique per copy.
	const uid = $props.id();

	const target = $derived(cancelRefundForm.target);
	const isCancel = $derived(cancelRefundForm.kind === 'cancel');

	const refundableLabel = $derived(
		target ? formatCurrency(target.refundable, target.currency, 'fr-FR') : ''
	);

	let sheetEl = $state<HTMLElement | null>(null);
	let submitting = $state(false);
	// « Annulée par le client » (montant modifiable) ou « Annulée par Germinal ».
	let cancelledBy = $state<'guest' | 'germinal'>('guest');
	let amount = $state('');

	$effect(() => {
		if (cancelRefundForm.kind) {
			cancelledBy = 'guest';
			// Pré-rempli : ce que la politique suggère (annulation) ou tout ce
			// qui reste remboursable (remboursement partiel).
			const kind = cancelRefundForm.kind;
			const t = cancelRefundForm.target;
			amount =
				kind === 'cancel'
					? t && t.suggested !== null
						? (t.suggested / 100).toFixed(2)
						: '0.00'
					: t
						? (t.refundable / 100).toFixed(2)
						: '';
			sheetEl?.focus();
		}
	});

	function close() {
		closeCancelRefund();
	}

	const result = $derived.by(() => {
		const form = page.form as
			| {
					error?: string;
					reservationId?: string;
					cancelReservation?: boolean;
					refundReservation?: boolean;
					message?: string;
			  }
			| null;
		return form && form.reservationId === target?.reservationId && form.error ? form.error : null;
	});

	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const LABEL = 'block text-sm font-medium text-foreground';
	const CHOICE =
		'flex min-h-11 w-full cursor-default items-center gap-2.5 rounded-md border px-3 text-sm font-medium outline-none select-none';
</script>

{#if cancelRefundForm.kind && target}
	<div
		class="fixed inset-0 z-[59] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={close}
		aria-hidden="true"
		data-no-swipe
	></div>
	<div
		bind:this={sheetEl}
		role="dialog"
		aria-modal="true"
		aria-label={isCancel ? 'Annuler la réservation' : 'Rembourser'}
		tabindex="-1"
		class="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">
				{isCancel ? 'Annuler la réservation' : 'Rembourser'}
			</h2>
			<button
				type="button"
				onclick={close}
				aria-label="Fermer"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</header>

		<p class="mb-3 text-sm text-muted-foreground">
			{target.guestName ?? '—'} · {target.quantity ?? '—'}
			{target.quantity === 1 ? 'personne' : 'personnes'} · {target.seatingLabel}
		</p>

		{#if isCancel}
			<form
				method="POST"
				action="?/cancelReservation"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
						const form = page.form as
							| { error?: string; reservationId?: string; message?: string }
							| null;
						if (form && form.reservationId === target.reservationId && !form.error && form.message) {
							toast.success('Réservation', form.message);
							close();
						}
					};
				}}
			>
				<fieldset class="space-y-3" disabled={submitting}>
					<input type="hidden" name="reservationId" value={target.reservationId} />
					<input type="hidden" name="cancelledBy" value={cancelledBy} />
					<p class="text-sm text-foreground tabular-nums">
						Payé en ligne : {formatCurrency(target.paidOnline, target.currency, 'fr-FR')}
					</p>

					<div class="space-y-2">
						<label class="{CHOICE} {cancelledBy === 'guest' ? 'border-foreground bg-muted/40' : 'border-border-card'}">
							<input
								type="radio"
								name="cancelledByChoice"
								value="guest"
								bind:group={cancelledBy}
								class="size-4 accent-foreground"
							/>
							<span>Annulée par le client</span>
						</label>
						<label class="{CHOICE} {cancelledBy === 'germinal' ? 'border-foreground bg-muted/40' : 'border-border-card'}">
							<input
								type="radio"
								name="cancelledByChoice"
								value="germinal"
								bind:group={cancelledBy}
								class="size-4 accent-foreground"
							/>
							<span>Annulée par Germinal — remboursement intégral&nbsp;: {refundableLabel}</span>
						</label>
					</div>

					{#if cancelledBy === 'guest'}
						<div>
							<label class={LABEL} for="{uid}-amount">Montant remboursé</label>
							<input
								id="{uid}-amount"
								name="amount"
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								bind:value={amount}
								required
								class="{INPUT} mt-1 tabular-nums"
							/>
							{#if target.suggested !== null}
								<p class="mt-1 text-xs text-muted-foreground tabular-nums">
									selon la politique&nbsp;: {formatCurrency(target.suggested, target.currency, 'fr-FR')}
								</p>
							{/if}
						</div>
					{/if}

					{#if result}<p class="text-sm font-medium text-red-600" role="alert">{result}</p>{/if}

					<button
						type="submit"
						disabled={submitting}
						class="{BTN} w-full border-red-600 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
					>
						{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
						{:else}<Ban size={16} aria-hidden="true" />{/if}
						Annuler la réservation
					</button>
				</fieldset>
			</form>
		{:else}
			<form
				method="POST"
				action="?/refundReservation"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
						const form = page.form as
							| { error?: string; reservationId?: string; message?: string }
							| null;
						if (form && form.reservationId === target.reservationId && !form.error && form.message) {
							toast.success('Remboursement', form.message);
							close();
						}
					};
				}}
			>
				<fieldset class="space-y-3" disabled={submitting}>
					<input type="hidden" name="reservationId" value={target.reservationId} />
					<div>
						<label class={LABEL} for="{uid}-refund-amount">Montant</label>
						<input
							id="{uid}-refund-amount"
							name="amount"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							bind:value={amount}
							required
							class="{INPUT} mt-1 tabular-nums"
						/>
						<p class="mt-1 text-xs text-muted-foreground tabular-nums">
							maximum&nbsp;: {refundableLabel}
						</p>
					</div>

					{#if result}<p class="text-sm font-medium text-red-600" role="alert">{result}</p>{/if}

					<button
						type="submit"
						disabled={submitting}
						class="{BTN} w-full border-foreground bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
					>
						{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
						Rembourser {amount && Number.isFinite(Number(amount)) ? formatCurrency(Math.round(Number(amount) * 100), target.currency, 'fr-FR') : ''}
					</button>
				</fieldset>
			</form>
		{/if}
	</div>
{/if}
