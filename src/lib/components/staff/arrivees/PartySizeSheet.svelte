<script lang="ts">
	/**
	 * La feuille « Modifier le nombre » d'une partie (issue 048), ouverte
	 * depuis le menu ⋮ de sa carte dans Arrivées. Le devis (nouveau total,
	 * reste à payer sur place, avertissement de capacité) se recalcule à
	 * chaque changement, comme le dialogue Admin. Sans la permission
	 * « Annuler et rembourser », une suppression au-delà du solde est
	 * refusée et aucun remboursement n'est proposé. Le serveur revérifie
	 * la permission et le jour en cours.
	 */
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fade, fly } from 'svelte/transition';
	import { AlertCircle, LoaderCircle, Users, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { formatCurrency } from '$lib/utils/currency';
	import { quotePartySize } from '$lib/utils/party-size';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { partySizeForm, closePartySize } from './party-size.svelte';

	const toast = getToastContext();

	// The page renders twice (mobile and desktop): ids unique per copy.
	const uid = $props.id();

	const target = $derived(partySizeForm.target);

	let sheetEl = $state<HTMLElement | null>(null);
	let submitting = $state(false);
	let qty = $state(0);
	// Le remboursement du trop-perçu, en euros dans le formulaire.
	let refundAmount = $state(0);

	$effect(() => {
		const t = partySizeForm.target;
		if (t) {
			qty = t.quantity;
			refundAmount = 0;
			sheetEl?.focus();
		}
	});

	function close() {
		closePartySize();
	}

	function step(delta: number) {
		qty = Math.max(1, qty + delta);
	}

	let quote = $derived.by(() => {
		const t = target;
		if (!t) return null;
		return quotePartySize(
			{
				quantity: t.quantity,
				total: t.total,
				extrasTotal: t.extrasTotal ?? 0,
				depositPaid: t.depositPaid,
				balance: t.balance,
				isComp: t.isComp,
				checkedIn: t.checkedIn,
				status: 'confirmed',
				refundPolicy: t.refundPolicy ?? undefined,
				seatingStart: new Date(t.seatingStart),
				now: new Date(),
				allowOverPay: t.canRefund
			},
			qty
		);
	});

	let changed = $derived(target !== null && qty !== target.quantity);

	// Seats beyond capacity the change would take (never a refusal).
	let overflow = $derived(
		target && target.availableCapacity !== null
			? Math.max(0, qty - target.quantity - (target.availableCapacity ?? 0))
			: 0
	);

	let overPaid = $derived(quote && quote.ok ? quote.quote.overPaid : 0);

	// Pré-rempli avec ce que la politique suggère, réinitialisé à chaque
	// changement de nombre.
	$effect(() => {
		const suggestion = quote && quote.ok ? quote.quote.overPaidRefund : null;
		refundAmount = suggestion ? suggestion.amount / 100 : 0;
	});

	const result = $derived.by(() => {
		const form = page.form as
			| { error?: string; reservationId?: string; changeParty?: boolean; message?: string }
			| null;
		return form && form.reservationId === target?.reservationId && form.error ? form.error : null;
	});

	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-center text-lg font-semibold tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
</script>

{#if target}
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
		aria-label="Modifier le nombre de personnes"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 pb-8 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">Modifier le nombre</h2>
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
			{target.guestName ?? '—'} · {target.quantity}
			{target.quantity === 1 ? 'personne' : 'personnes'} · {target.seatingLabel}
		</p>

		<form
			method="POST"
			action="?/changeParty"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
					const form = page.form as
						| { error?: string; reservationId?: string; changeParty?: boolean; message?: string }
						| null;
					if (
						form &&
						form.reservationId === target.reservationId &&
						form.changeParty &&
						!form.error &&
						form.message
					) {
						toast.success('Nombre modifié', form.message);
						close();
					}
				};
			}}
		>
			<fieldset class="space-y-3" disabled={submitting}>
				<input type="hidden" name="reservationId" value={target.reservationId} />

				<div class="flex items-center justify-center gap-3">
					<button
						type="button"
						onclick={() => step(-1)}
						aria-label="Une personne de moins"
						class="size-11 shrink-0 rounded-full border border-border-input text-xl font-semibold text-foreground hover:bg-muted"
					>
						−
					</button>
					<input
						id="{uid}-quantity"
						name="quantity"
						type="number"
						inputmode="numeric"
						min="1"
						step="1"
						bind:value={qty}
						required
						class="{INPUT} max-w-28"
					/>
					<button
						type="button"
						onclick={() => step(1)}
						aria-label="Une personne de plus"
						class="size-11 shrink-0 rounded-full border border-border-input text-xl font-semibold text-foreground hover:bg-muted"
					>
						+
					</button>
				</div>

				{#if quote && quote.ok && changed}
					<div class="space-y-1 text-sm">
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Nouveau total</span>
							<span class="font-semibold text-foreground tabular-nums">
								{formatCurrency(quote.quote.total, target.currency, 'fr-FR')}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Reste à payer sur place</span>
							<span class="font-semibold text-foreground tabular-nums">
								{formatCurrency(quote.quote.balance, target.currency, 'fr-FR')}
							</span>
						</div>
					</div>
					{#if overPaid > 0}
						<div class="space-y-1 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">Trop-perçu</span>
								<span class="font-semibold text-foreground tabular-nums">
									{formatCurrency(overPaid, target.currency, 'fr-FR')}
								</span>
							</div>
							{#if quote.quote.overPaidRefund}
								<p class="text-xs text-muted-foreground">{quote.quote.overPaidRefund.reasonFr}</p>
							{/if}
							<label class="block space-y-1">
								<span class="text-sm font-medium text-foreground">Remboursement</span>
								<input
									id="{uid}-refund"
									name="refundAmount"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									max={overPaid / 100}
									bind:value={refundAmount}
									class="min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
								/>
							</label>
						</div>
					{/if}
					{#if overflow > 0}
						<div class="flex items-center gap-1.5 text-xs text-amber-700">
							<AlertCircle size={14} aria-hidden="true" />
							<span>{overflow} {overflow > 1 ? 'places' : 'place'} au-delà de la capacité</span>
						</div>
					{/if}
				{:else if quote && !quote.ok && changed}
					<div class="flex items-center gap-1.5 text-xs text-red-600">
						<AlertCircle size={14} aria-hidden="true" />
						<span>{quote.error}</span>
					</div>
				{/if}

				{#if result}<p class="text-sm font-medium text-red-600" role="alert">{result}</p>{/if}

				<button
					type="submit"
					disabled={submitting || !changed || !quote?.ok}
					class="{BTN} w-full border-foreground bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
				>
					{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
					{:else}<Users size={16} aria-hidden="true" />{/if}
					Confirmer
				</button>
			</fieldset>
		</form>
	</div>
{/if}
