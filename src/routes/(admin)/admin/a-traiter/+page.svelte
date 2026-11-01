<script lang="ts">
	import { AlertTriangle, CircleAlert } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();

	type Alert = (typeof data.alerts)[number];

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// One group per kind, each with one sentence on what to do.
	const groups: { kind: Alert['kind']; title: string; whatToDo: string }[] = [
		{
			kind: 'refund_failed',
			title: 'Remboursements refusés',
			whatToDo:
				"Le remboursement automatique a été refusé par Stripe. Ouvrez la réservation et remboursez l'acompte à la main."
		},
		{
			kind: 'paid_without_seat',
			title: 'Payés sans place',
			whatToDo:
				'Une réservation expirée ou annulée garde un paiement non remboursé. Ouvrez la réservation et remboursez l’acompte à la main.'
		},
		{
			kind: 'refunded_but_active',
			title: 'Remboursées mais toujours actives',
			whatToDo:
				"L'acompte a été remboursé (souvent à la main dans Stripe) mais la réservation reste confirmée : ses places restent prises. Ouvrez-la et annulez-la."
		},
		{
			kind: 'dispute_open',
			title: 'Litiges Stripe à répondre',
			whatToDo:
				"Un litige Stripe attend une réponse avant son échéance. Ouvrez-le dans Stripe et soumettez vos preuves."
		}
	];

	const alertsOf = (kind: Alert['kind']) => data.alerts.filter((alert) => alert.kind === kind);
	const knownKinds = new Set(groups.map((g) => g.kind));
	const isExternal = (href: string) => href.startsWith('http');
</script>

<svelte:head>
	<title>À traiter | Germinal Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-1">À traiter</h1>
		<p class="text-muted-foreground">Réservations dont l'argent attend une décision</p>
	</div>

	{#if data.alerts.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-8 text-center">
			<p class="text-muted-foreground">Rien à traiter.</p>
		</div>
	{:else}
		{#each groups as group (group.kind)}
			{@const alerts = alertsOf(group.kind)}
			{#if alerts.length > 0}
				<section class="mb-8">
					<div class="mb-3">
						<h2 class="text-lg font-semibold text-foreground flex items-center gap-2">
							{#if group.kind === 'refund_failed' || group.kind === 'dispute_open'}
								<AlertTriangle size={17} class="text-red-600" />
							{:else}
								<CircleAlert size={17} class="text-amber-500" />
							{/if}
							{group.title}
							<span class="text-sm font-normal text-muted-foreground">({alerts.length})</span>
						</h2>
						<p class="text-sm text-muted-foreground">{group.whatToDo}</p>
					</div>
					<div class="bg-background rounded-lg border border-border-card overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-border-card text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
									<th class="px-4 py-3">Montant</th>
									<th class="px-4 py-3">Client</th>
									<th class="px-4 py-3">Événement</th>
									<th class="px-4 py-3">Séance</th>
									<th class="px-4 py-3">Détail</th>
									<th class="px-4 py-3"></th>
								</tr>
							</thead>
							<tbody>
								{#each alerts as alert (alert.reservationId)}
									<tr class="border-b border-border-card last:border-b-0 {alert.kind === 'refund_failed' ? 'text-red-700 dark:text-red-400' : ''}">
										<td class="px-4 py-3 font-semibold whitespace-nowrap">
											{formatCurrency(alert.amount, alert.currency)}
										</td>
										<td class="px-4 py-3">{alert.guestName}</td>
										<td class="px-4 py-3">{alert.eventTitle}</td>
										<td class="px-4 py-3 whitespace-nowrap">{formatDate(alert.seatingStart)}</td>
										<td class="px-4 py-3 max-w-md">
											<span class="line-clamp-2">{alert.detail}</span>
										</td>
										<td class="px-4 py-3 text-right">
											<a
												href={alert.href}
												{...isExternal(alert.href) ? { target: '_blank', rel: 'noopener' } : {}}
												class="inline-flex items-center px-3 py-1.5 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
											>
												Ouvrir
											</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}
		{/each}

		<!-- Safety net for kinds the page doesn't describe yet (later issues). -->
		{#each data.alerts.filter((alert) => !knownKinds.has(alert.kind)) as alert (alert.reservationId)}
			<p class="text-sm text-muted-foreground">
				<a href={alert.href} class="underline">{alert.guestName}</a> — {alert.detail}
			</p>
		{/each}
	{/if}
</div>
