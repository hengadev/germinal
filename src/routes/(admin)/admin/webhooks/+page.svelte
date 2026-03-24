<script lang="ts">
	import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, ExternalLink, RotateCcw, User, Mail, Ticket, Calendar, RefreshCw } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data }: { data: PageData } = $props();

	// Form state
	let form = $state<{
		success?: string;
		error?: string;
	} | undefined>();

	const toast = getToastContext();

	// Show toast on form changes
	$effect(() => {
		if (form?.success) {
			toast.success("Succès", form.success);
			form = undefined;
		}
	});

	$effect(() => {
		if (form?.error) {
			toast.error("Erreur", form.error);
			form = undefined;
		}
	});

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'succeeded':
				return { text: 'Payé', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'En attente', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'failed':
				return { text: 'Échoué', class: 'bg-red-50 text-red-700', icon: XCircle };
			default:
				return { text: status, class: 'bg-muted text-foreground-alt', icon: null };
		}
	}

	// Format date and time
	function formatDateTime(dateString: string): string {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(dateString: string): string {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Surveillance des Webhooks | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Surveillance des Webhooks</h1>
		<p class="text-muted-foreground">Surveiller les paiements avec des webhooks non traités</p>
	</div>

	{#if data.payments.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<CheckCircle2 size={48} class="mx-auto mb-4 text-green-300" />
			<h3 class="text-xl font-semibold text-foreground mb-2">
				Tous les webhooks ont été traités
			</h3>
			<p class="text-muted-foreground">
				Aucun paiement avec des webhooks non traités n'a été trouvé. Tout est à jour !
			</p>
		</div>
	{:else}
		<!-- Info banner -->
		<div class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-start gap-3">
			<AlertTriangle size={20} class="flex-shrink-0 mt-0.5" />
			<div>
				<p class="font-medium mb-1">Paiements avec des webhooks non traités</p>
				<p class="text-sm">
					Ces paiements n'ont pas encore eu leurs webhooks Stripe traités. Cela peut être dû à des échecs de livraison de webhooks ou à des problèmes de synchronisation.
					Utilisez l'action de réessai pour traiter manuellement le webhook.
				</p>
			</div>
		</div>

		<!-- Results count -->
		<div class="mb-6 text-sm text-muted-foreground">
			Affichage de {data.payments.length} paiements avec des webhooks non traités
		</div>

		<!-- Table view for desktop -->
		<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Paiement
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Réservation
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Montant
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Statut
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Créé
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Erreur
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.payments as payment}
						{@const statusBadge = getStatusBadge(payment.status)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
										<CreditCard size={18} class="text-muted-foreground" />
									</div>
									<div>
										<div class="font-medium text-foreground font-mono text-sm">
											{payment.stripePaymentIntentId}
										</div>
										<div class="text-xs text-muted-foreground">
											ID: {payment.id.substring(0, 8)}
										</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								{#if payment.reservation}
									<div class="text-sm">
										<div class="flex items-center gap-2">
											<User size={14} class="text-muted-foreground" />
											<span class="font-medium text-foreground">{payment.reservation.guestName}</span>
										</div>
										<div class="flex items-center gap-2 text-muted-foreground">
											<Mail size={12} />
											<span class="text-xs">{payment.reservation.guestEmail}</span>
										</div>
										<div class="text-muted-foreground text-xs mt-1">
											{payment.reservation.eventTitle}
										</div>
										<div class="text-muted-foreground text-xs">
											{payment.reservation.sessionTitle}
										</div>
									</div>
								{:else}
									<div class="text-sm text-muted-foreground">No reservation</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="text-sm font-semibold text-foreground">
									{formatCurrency(payment.amount, payment.currency)}
								</div>
							</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {statusBadge.class} rounded-full">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={12} />
									{/if}
									{statusBadge.text}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-foreground-alt">
									{formatDateTime(payment.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								{#if payment.lastError}
									<div class="text-sm text-red-600 truncate max-w-xs" title={payment.lastError}>
										{payment.lastError}
									</div>
								{:else}
									<div class="text-sm text-muted-foreground">-</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									{#if payment.reservation}
										<a
											href="/admin/reservations/{payment.reservation.id}"
											class="p-2 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
											title="View Reservation"
										>
											<ExternalLink size={18} />
										</a>
									{/if}
									<form method="POST" action="?/retry" use:enhance={({ formData, action, cancel }) => {
											if (!confirm('Manually process the webhook for this payment?')) {
												cancel();
											}
											return async ({ result, update }) => {
												if (result.type === 'success' && result.data) {
													form = { success: (result.data as { message: string }).message };
												} else if (result.type === 'failure' && result.data) {
													form = { error: (result.data as { error?: string }).error || 'Action failed' };
												}
												update();
											};
										}}>
										<input type="hidden" name="paymentId" value={payment.id} />
										<button
											type="submit"
											class="p-2 text-foreground-alt hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
											title="Retry Webhook"
										>
											<RefreshCw size={18} />
										</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.payments as payment}
				{@const statusBadge = getStatusBadge(payment.status)}
				<div class="bg-background rounded-lg border border-border-card p-4">
					<div class="flex items-start gap-3 mb-3">
						<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
							<CreditCard size={18} class="text-muted-foreground" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-mono text-sm font-semibold text-foreground truncate">
									{payment.stripePaymentIntentId}
								</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {statusBadge.class} rounded-full flex-shrink-0">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={10} />
									{/if}
									{statusBadge.text}
								</span>
							</div>
							<p class="text-xs text-muted-foreground">ID: {payment.id.substring(0, 8)}</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<div class="text-xs text-muted-foreground">Amount</div>
							<div class="text-sm font-semibold text-foreground">
								{formatCurrency(payment.amount, payment.currency)}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Created</div>
							<div class="text-sm text-foreground">{formatDate(payment.createdAt)}</div>
						</div>
					</div>

					{#if payment.reservation}
						<div class="mb-3 pb-3 border-b border-border-card">
							<div class="text-xs text-muted-foreground mb-1">Guest</div>
							<div class="text-sm font-medium text-foreground">{payment.reservation.guestName}</div>
							<div class="text-xs text-muted-foreground">{payment.reservation.guestEmail}</div>
							<div class="text-xs text-muted-foreground mt-1">
								{payment.reservation.eventTitle}
							</div>
						</div>
					{/if}

					{#if payment.lastError}
						<div class="mb-3">
							<div class="text-xs text-muted-foreground">Error</div>
							<div class="text-sm text-red-600 truncate">{payment.lastError}</div>
						</div>
					{/if}

					<div class="flex items-center justify-between pt-3 border-t border-border-card">
						<div class="text-xs text-muted-foreground">
							{formatDateTime(payment.createdAt)}
						</div>
						<div class="flex items-center gap-2">
							{#if payment.reservation}
								<a
									href="/admin/reservations/{payment.reservation.id}"
									class="p-2 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
									title="View Reservation"
								>
									<ExternalLink size={16} />
								</a>
							{/if}
							<form method="POST" action="?/retry" use:enhance={({ formData, action, cancel }) => {
									if (!confirm('Manually process the webhook for this payment?')) {
										cancel();
									}
									return async ({ result, update }) => {
										if (result.type === 'success' && result.data) {
											form = { success: (result.data as { message: string }).message };
										} else if (result.type === 'failure' && result.data) {
											form = { error: (result.data as { error?: string }).error || 'Action failed' };
										}
										update();
									};
								}}>
								<input type="hidden" name="paymentId" value={payment.id} />
								<button
									type="submit"
									class="p-2 text-foreground-alt hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
									title="Retry Webhook"
								>
									<RefreshCw size={16} />
								</button>
							</form>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
