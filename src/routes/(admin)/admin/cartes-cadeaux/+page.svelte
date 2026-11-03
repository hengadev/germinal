<script lang="ts">
	import { enhance } from '$app/forms';
	import { Search, Gift } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { formatGiftCardCode } from '$lib/utils/gift-card';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uid = $props.id();

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const statusOptions: { value: string; label: string }[] = [
		{ value: '', label: 'Tous les statuts' },
		{ value: 'active', label: 'Actives' },
		{ value: 'used_up', label: 'Épuisées' },
		{ value: 'expired', label: 'Expirées' },
		{ value: 'cancelled', label: 'Annulées' }
	];

	function cardStatus(card: PageData['cards'][number]): { label: string; classes: string } {
		if (card.status === 'cancelled')
			return { label: 'Annulée', classes: 'bg-muted text-muted-foreground' };
		if (card.expiresAt && new Date(card.expiresAt).getTime() <= Date.now())
			return { label: 'Expirée', classes: 'bg-muted text-muted-foreground' };
		if (card.balance <= 0)
			return { label: 'Épuisée', classes: 'bg-muted text-muted-foreground' };
		return { label: 'Active', classes: 'bg-foreground/10 text-foreground' };
	}

	let issueOpen = $state(false);
</script>

<svelte:head>
	<title>Cartes cadeaux — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-foreground">Cartes cadeaux</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Chaque mouvement (réservation, porte, remboursement, ajustement) est inscrit dans le
			relevé de la carte : le solde vaut toujours le montant initial plus le relevé.
		</p>
	</div>

	{#if form?.issuedCode}
		<p class="mb-6 rounded-lg border border-border-card bg-muted/50 px-4 py-3 text-sm text-foreground">
			Carte {form.issuedCode} émise : l'email de la carte a été mis en file d'attente.
		</p>
	{/if}

	<!-- Search and status filter -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<form action="/admin/cartes-cadeaux" method="get" class="flex flex-col sm:flex-row gap-4">
			<div class="flex-1">
				<label for="{uid}-search" class="block text-sm font-medium text-foreground-alt mb-1">Rechercher</label>
				<div class="relative">
					<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="{uid}-search"
						type="text"
						name="search"
						value={data.search}
						placeholder="Code, nom ou email…"
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					/>
				</div>
			</div>
			<div class="flex-1">
				<label for="{uid}-status" class="block text-sm font-medium text-foreground-alt mb-1">Statut</label>
				<select
					id="{uid}-status"
					name="status"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				>
					{#each statusOptions as option (option.value || 'all')}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<div class="flex items-end">
				<button type="submit" class="px-4 py-2.5 border border-border-input rounded-lg text-sm text-foreground hover:bg-muted">Appliquer</button>
			</div>
		</form>
		<p class="mt-3 text-sm text-muted-foreground">
			{data.cards.length} carte{data.cards.length > 1 ? 's' : ''}
		</p>
	</div>

	<!-- Issue by hand -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<button
			type="button"
			class="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground-alt"
			onclick={() => (issueOpen = !issueOpen)}
		>
			<Gift size={16} />
			Émettre une carte
		</button>
		{#if issueOpen}
			<form action="?/issue" method="post" class="mt-4 max-w-xl" use:enhance>
				{#if form?.issueError}
					<p class="mb-3 rounded-lg border border-border-card bg-muted/50 px-4 py-3 text-sm text-foreground">{form.issueError}</p>
				{/if}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label for="{uid}-amount" class="block text-sm font-medium text-foreground-alt mb-1">Montant (€)</label>
						<input
							id="{uid}-amount"
							type="number"
							name="amount"
							min="1"
							step="0.01"
							required
							class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
						/>
					</div>
					<div>
						<label for="{uid}-expiresAt" class="block text-sm font-medium text-foreground-alt mb-1">Expiration (facultatif)</label>
						<input
							id="{uid}-expiresAt"
							type="date"
							name="expiresAt"
							class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
						/>
						<p class="mt-1 text-xs text-muted-foreground">Un an par défaut.</p>
					</div>
					<div>
						<label for="{uid}-recipientName" class="block text-sm font-medium text-foreground-alt mb-1">Nom du destinataire</label>
						<input
							id="{uid}-recipientName"
							type="text"
							name="recipientName"
							value={form?.recipientName ?? ''}
							required
							class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
						/>
					</div>
					<div>
						<label for="{uid}-recipientEmail" class="block text-sm font-medium text-foreground-alt mb-1">Email du destinataire</label>
						<input
							id="{uid}-recipientEmail"
							type="email"
							name="recipientEmail"
							value={form?.recipientEmail ?? ''}
							class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
						/>
					</div>
				</div>
				<div class="mt-4">
					<label for="{uid}-message" class="block text-sm font-medium text-foreground-alt mb-1">Message (facultatif)</label>
					<textarea
						id="{uid}-message"
						name="message"
						rows="3"
						class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					>{form?.message ?? ''}</textarea>
				</div>
				<button type="submit" class="mt-4 px-4 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90">
					Émettre
				</button>
			</form>
		{/if}
	</div>

	{#if data.cards.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<Gift size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">Aucune carte trouvée</h3>
			<p class="text-muted-foreground">Ajustez la recherche ou émettez une première carte.</p>
		</div>
	{:else}
		<div class="bg-background rounded-lg border border-border-card overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-muted border-b border-border-card">
						<tr>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Code</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Destinataire</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Statut</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Montant initial</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Solde</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Expiration</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.cards as card (card.id)}
							<tr class="hover:bg-muted/50">
								<td class="px-6 py-4">
									<a href="/admin/cartes-cadeaux/{card.id}" class="font-medium text-foreground hover:underline">{formatGiftCardCode(card.code)}</a>
									<p class="text-xs text-muted-foreground">{card.origin === 'admin' ? 'Émise à la main' : 'Achat en ligne'}</p>
								</td>
								<td class="px-6 py-4 text-foreground">
									{card.recipientName ?? '—'}
									{#if card.recipientEmail}
										<p class="text-sm text-muted-foreground">{card.recipientEmail}</p>
									{/if}
								</td>
								<td class="px-6 py-4">
									<span class="inline-block px-2 py-0.5 rounded-full text-xs {cardStatus(card).classes}">{cardStatus(card).label}</span>
								</td>
								<td class="px-6 py-4 text-foreground">{formatCurrency(card.initialAmount, 'EUR', 'fr-FR')}</td>
								<td class="px-6 py-4 text-foreground">{formatCurrency(card.balance, 'EUR', 'fr-FR')}</td>
								<td class="px-6 py-4 text-foreground">{formatDate(card.expiresAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
