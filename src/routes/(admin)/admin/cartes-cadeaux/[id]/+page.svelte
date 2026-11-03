<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarClock, Ban, ChevronLeft } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { ActionData, PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { formatGiftCardCode } from '$lib/utils/gift-card';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uid = $props.id();

	const card = $derived(data.card);

	function formatDate(value: string | Date): string {
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function formatDateTime(value: string | Date): string {
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const reasonLabels: Record<string, string> = {
		booking: 'Réservation',
		door: 'Paiement à la porte',
		refund: 'Remboursement',
		admin_adjustment: 'Ajustement admin'
	};

	const statusLabel = $derived(
		card.status === 'cancelled'
			? 'Annulée'
			: new Date(card.expiresAt).getTime() <= Date.now()
				? 'Expirée'
				: card.balance <= 0
					? 'Épuisée'
					: 'Active'
	);

	// « Prolonger » : one year from today, prefilled and editable.
	const defaultExpiry = $derived(
		new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
	);
	let extendValue = $state('');
	$effect.pre(() => {
		extendValue = defaultExpiry;
	});

	let cancelModalOpen = $state(false);
</script>

<svelte:head>
	<title>Carte {formatGiftCardCode(card.code)} — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<a href="/admin/cartes-cadeaux" class="inline-flex items-center gap-1 text-sm text-foreground-alt hover:text-foreground mb-4">
		<ChevronLeft size={16} /> Cartes cadeaux
	</a>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-foreground font-mono">{formatGiftCardCode(card.code)}</h1>
		<p class="text-sm text-muted-foreground mt-1">
			{statusLabel} — émise le {formatDate(card.createdAt)}
			{#if card.origin === 'admin'}à la main{:else}en ligne{/if}
		</p>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Card details -->
		<div class="bg-background rounded-lg border border-border-card p-6">
			<dl class="space-y-4">
				<div>
					<dt class="text-sm text-muted-foreground">Montant initial</dt>
					<dd class="text-foreground font-medium">{formatCurrency(card.initialAmount, 'EUR', 'fr-FR')}</dd>
				</div>
				<div>
					<dt class="text-sm text-muted-foreground">Solde</dt>
					<dd class="text-foreground font-medium">{formatCurrency(card.balance, 'EUR', 'fr-FR')}</dd>
				</div>
				<div>
					<dt class="text-sm text-muted-foreground">Expiration</dt>
					<dd class="text-foreground font-medium">{formatDate(card.expiresAt)}</dd>
				</div>
				<div>
					<dt class="text-sm text-muted-foreground">Destinataire</dt>
					<dd class="text-foreground font-medium">
						{card.recipientName ?? '—'}
						{#if card.recipientEmail}<p class="text-sm text-muted-foreground">{card.recipientEmail}</p>{/if}
					</dd>
				</div>
				{#if card.buyerName || card.buyerEmail}
					<div>
						<dt class="text-sm text-muted-foreground">Acheteur</dt>
						<dd class="text-foreground font-medium">
							{card.buyerName ?? '—'}
							{#if card.buyerEmail}<p class="text-sm text-muted-foreground">{card.buyerEmail}</p>{/if}
						</dd>
					</div>
				{/if}
				{#if card.stripeReference}
					<div>
						<dt class="text-sm text-muted-foreground">Référence Stripe</dt>
						<dd class="text-foreground font-medium">{card.stripeReference}</dd>
					</div>
				{/if}
				{#if card.message}
					<div>
						<dt class="text-sm text-muted-foreground">Message</dt>
						<dd class="text-foreground whitespace-pre-wrap">{card.message}</dd>
					</div>
				{/if}
			</dl>

			{#if card.status === 'active'}
				<div class="mt-6 flex flex-col gap-3">
					<form action="?/extend" method="post" use:enhance class="flex flex-col sm:flex-row gap-2">
						<input type="hidden" name="expiresAt" value={extendValue} />
						<input
							id="{uid}-extend"
							type="date"
							bind:value={extendValue}
							class="flex-1 px-4 py-2.5 border border-border-input rounded-lg text-sm"
							aria-label="Nouvelle date d'expiration"
						/>
						<button type="submit" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90">
							<CalendarClock size={16} /> Prolonger
						</button>
					</form>
					{#if form?.extendError}
						<p class="text-sm text-foreground">{form.extendError}</p>
					{:else if form?.extendSuccess}
						<p class="text-sm text-muted-foreground">Carte prolongée.</p>
					{/if}

					<button
						type="button"
						class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border-input text-foreground hover:bg-muted"
						onclick={() => (cancelModalOpen = true)}
					>
						<Ban size={16} /> Annuler
					</button>
					{#if form?.cancelError}
						<p class="text-sm text-foreground">{form.cancelError}</p>
					{/if}

					<Modal bind:isOpen={cancelModalOpen} title="Annuler la carte">
						<p class="text-sm text-foreground mb-4">
							La carte ne pourra plus être utilisée ; son relevé est conservé. Le code n'apparaît
							jamais en entier dans le journal d'audit (quatre derniers caractères seulement).
						</p>
						<form action="?/cancel" method="post" use:enhance>
							<input type="hidden" name="confirm" value="1" />
							<div class="flex justify-end gap-2">
								<button type="button" class="px-4 py-2 rounded-lg text-sm border border-border-input text-foreground hover:bg-muted" onclick={() => (cancelModalOpen = false)}>Retour</button>
								<button type="submit" class="px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90">Annuler la carte</button>
							</div>
						</form>
					</Modal>
				</div>
			{/if}
		</div>

		<!-- Ledger -->
		<div class="lg:col-span-2 bg-background rounded-lg border border-border-card overflow-hidden">
			<div class="px-6 py-4 border-b border-border-card">
				<h2 class="text-lg font-semibold text-foreground">Relevé</h2>
				<p class="text-sm text-muted-foreground">Le solde vaut toujours le montant initial plus le relevé.</p>
			</div>
			{#if data.ledger.length === 0}
				<p class="px-6 py-12 text-center text-muted-foreground">Aucun mouvement. Solde intact.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-muted border-b border-border-card">
							<tr>
								<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Date</th>
								<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Motif</th>
								<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Montant</th>
								<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Réservation</th>
								<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Par</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border-card">
							{#each data.ledger as row (row.id)}
								<tr>
									<td class="px-6 py-4 text-foreground">{formatDateTime(row.createdAt)}</td>
									<td class="px-6 py-4 text-foreground">{reasonLabels[row.reason] ?? row.reason}</td>
									<td class="px-6 py-4 font-medium {row.amount < 0 ? 'text-foreground' : 'text-foreground'}">
										{row.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(row.amount), 'EUR', 'fr-FR')}
									</td>
									<td class="px-6 py-4 text-foreground">
										{#if row.reservationId}
											<a href="/admin/reservations/{row.reservationId}" class="text-foreground hover:underline">Voir</a>
										{:else}—{/if}
									</td>
									<td class="px-6 py-4 text-foreground">{row.actorName ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>
