<script lang="ts">
	import {
		DollarSign,
		CreditCard,
		CheckCircle,
		XCircle,
		AlertCircle,
		TrendingUp,
		Ticket,
		BarChart3,
		Calendar,
		Users,
		Download
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selectedRange = $state<'7d' | '30d' | '90d' | 'all'>(data.range || '30d');

	function updateRange(range: typeof selectedRange) {
		selectedRange = range;
		const url = new URL(window.location.href);
		url.searchParams.set('range', range);
		window.location.href = url.toString();
	}

	function formatCurrency(cents: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'EUR'
		}).format(cents / 100);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'succeeded': return 'Réussi';
			case 'failed': return 'Échoué';
			case 'refunded': return 'Remboursé';
			case 'partially_refunded': return 'Partiellement remboursé';
			case 'pending': return 'En attente';
			case 'processing': return 'En traitement';
			default: return status;
		}
	}

	const chartHeight = 200;
	const chartPadding = 40;

	let maxRevenue = $derived(
		data.dailyRevenue.length > 0 ? Math.max(...data.dailyRevenue.map((d) => d.revenue)) : 0
	);

	function getX(index: number, total: number): number {
		return chartPadding + (index / (total - 1 || 1)) * (600 - chartPadding * 2);
	}

	function getY(revenue: number): number {
		return chartHeight - chartPadding - (revenue / maxRevenue) * (chartHeight - chartPadding * 2);
	}

	function getBarHeight(revenue: number): number {
		return (revenue / maxRevenue) * (chartHeight - chartPadding * 2);
	}

	let refundRate = $derived(
		data.metrics.successfulPayments > 0
			? (data.metrics.refundedPayments / data.metrics.successfulPayments) * 100
			: 0
	);

	let avgTicketsPerOrder = $derived(
		data.metrics.successfulPayments > 0
			? data.metrics.totalTicketsSold / data.metrics.successfulPayments
			: 0
	);

	const metrics = [
		{
			label: 'Revenu Net',
			value: formatCurrency(data.metrics.totalRevenue),
			icon: DollarSign,
			sub: 'après remboursements'
		},
		{
			label: 'Panier Moyen',
			value: formatCurrency(data.metrics.averageOrderValue),
			icon: CreditCard,
			sub: 'par paiement réussi'
		},
		{
			label: 'Billets Vendus',
			value: data.metrics.totalTicketsSold.toString(),
			icon: Ticket,
			sub: 'confirmés'
		},
		{
			label: 'Taux de Réussite',
			value: `${data.metrics.successRate.toFixed(1)}%`,
			icon: TrendingUp,
			sub: 'des paiements'
		},
		{
			label: 'Paiements Réussis',
			value: data.metrics.successfulPayments.toString(),
			icon: CheckCircle,
			sub: `sur ${data.metrics.totalPayments} total`
		},
		{
			label: 'Paiements Échoués',
			value: data.metrics.failedPayments.toString(),
			icon: XCircle,
			sub: 'à relancer si nécessaire'
		},
		{
			label: 'Taux de Remboursement',
			value: `${refundRate.toFixed(1)}%`,
			icon: AlertCircle,
			sub: `${data.metrics.refundedPayments} remboursement(s)`
		},
		{
			label: 'Billets / Commande',
			value: avgTicketsPerOrder.toFixed(1),
			icon: Users,
			sub: 'en moyenne'
		}
	];
</script>

<svelte:head>
	<title>Analytiques des Paiements | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
			<div>
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Analytiques</h1>
				<p class="text-muted-foreground">Revenus, paiements et métriques de performance</p>
			</div>
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-1 bg-background rounded-lg border border-border-card p-1">
					{#each ['7d', '30d', '90d', 'all'] as range}
						<button
							onclick={() => updateRange(range)}
							class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {selectedRange === range
								? 'bg-foreground text-background'
								: 'text-foreground-alt hover:opacity-90'}"
						>
							{range === 'all' ? 'Tout' : range === '7d' ? '7j' : range === '30d' ? '30j' : '90j'}
						</button>
					{/each}
				</div>
				<a
					href="/admin/export/analytics"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm whitespace-nowrap"
				>
					<Download size={16} />
					Exporter CSV
				</a>
			</div>
		</div>
	</div>

	<!-- Metrics Grid -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		{#each metrics as metric}
			{@const Icon = metric.icon}
			<div class="bg-background rounded-lg border border-border-card p-6 hover:shadow-sm transition-shadow">
				<div class="flex items-center justify-between mb-4">
					<div class="p-2 bg-muted rounded-lg">
						<Icon size={18} class="text-foreground-alt" />
					</div>
				</div>
				<div class="text-2xl font-bold text-foreground mb-1">{metric.value}</div>
				<div class="text-sm font-medium text-foreground">{metric.label}</div>
				{#if metric.sub}
					<div class="text-xs text-muted-foreground mt-0.5">{metric.sub}</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
		<!-- Revenue Over Time Chart -->
		<div class="bg-background rounded-lg border border-border-card p-6">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 class="text-lg font-semibold text-foreground">Revenus au fil du temps</h2>
					<p class="text-sm text-muted-foreground">Revenus quotidiens des paiements réussis</p>
				</div>
				<BarChart3 size={20} class="text-muted-foreground" />
			</div>

			{#if data.dailyRevenue.length === 0}
				<div class="flex items-center justify-center h-64 text-muted-foreground">
					<div class="text-center">
						<BarChart3 size={48} class="mx-auto mb-4 opacity-30" />
						<p class="text-sm">Pas de données pour cette période</p>
					</div>
				</div>
			{:else}
				<div class="relative">
					<svg viewBox="0 0 600 200" class="w-full h-auto" preserveAspectRatio="none">
						<!-- Y-axis grid lines -->
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1={chartPadding}
								y1={chartPadding + tick * (chartHeight - chartPadding * 2)}
								x2={600 - chartPadding}
								y2={chartPadding + tick * (chartHeight - chartPadding * 2)}
								stroke="currentColor"
								stroke-opacity="0.08"
								stroke-dasharray="4"
							/>
						{/each}

						<!-- Bars -->
						{#each data.dailyRevenue as day, index}
							{@const x = getX(index, data.dailyRevenue.length)}
							{@const barWidth = Math.max(600 / data.dailyRevenue.length - chartPadding, 2)}
							{@const barHeight = getBarHeight(day.revenue)}
							{@const y = chartHeight - chartPadding - barHeight}
							<rect
								x={x - barWidth / 2}
								y={y}
								width={barWidth}
								height={barHeight}
								style="fill: var(--foreground)"
								fill-opacity="0.85"
								rx="2"
							>
								<title>{formatDate(day.date)}: {formatCurrency(day.revenue)}</title>
							</rect>
						{/each}

						<!-- X-axis labels -->
						{#if data.dailyRevenue.length > 2}
							<text
								x={getX(0, data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								style="fill: var(--muted-foreground); font-size: 10px"
							>
								{formatDate(data.dailyRevenue[0].date)}
							</text>
							<text
								x={getX(Math.floor(data.dailyRevenue.length / 2), data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								style="fill: var(--muted-foreground); font-size: 10px"
							>
								{formatDate(data.dailyRevenue[Math.floor(data.dailyRevenue.length / 2)].date)}
							</text>
							<text
								x={getX(data.dailyRevenue.length - 1, data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								style="fill: var(--muted-foreground); font-size: 10px"
							>
								{formatDate(data.dailyRevenue[data.dailyRevenue.length - 1].date)}
							</text>
						{/if}
					</svg>
				</div>
			{/if}
		</div>

		<!-- Payment Status Breakdown -->
		<div class="bg-background rounded-lg border border-border-card p-6">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 class="text-lg font-semibold text-foreground">Statut des paiements</h2>
					<p class="text-sm text-muted-foreground">Répartition sur la période sélectionnée</p>
				</div>
				<CreditCard size={20} class="text-muted-foreground" />
			</div>

			{#if data.paymentStatusBreakdown.length === 0}
				<div class="flex items-center justify-center h-64 text-muted-foreground">
					<div class="text-center">
						<CreditCard size={48} class="mx-auto mb-4 opacity-30" />
						<p class="text-sm">Pas de données disponibles</p>
					</div>
				</div>
			{:else}
				<div class="space-y-5">
					{#each data.paymentStatusBreakdown as status}
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-foreground">{getStatusLabel(status.status)}</span>
								<div class="flex items-center gap-4 text-sm">
									<span class="text-muted-foreground">{status.count} paiement{status.count > 1 ? 's' : ''}</span>
									<span class="font-semibold text-foreground tabular-nums">{formatCurrency(status.amount)}</span>
									<span class="text-muted-foreground w-8 text-right tabular-nums">{status.percentage.toFixed(0)}%</span>
								</div>
							</div>
							<div class="w-full bg-muted rounded-full h-1.5">
								<div
									class="h-1.5 rounded-full transition-all"
									style="width: {status.percentage}%; background: var(--foreground); opacity: {status.status === 'succeeded' ? '0.9' : status.status === 'failed' ? '0.35' : '0.55'}"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Top Events by Revenue -->
	<div class="bg-background rounded-lg border border-border-card p-6">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-lg font-semibold text-foreground">Événements par revenus</h2>
				<p class="text-sm text-muted-foreground">Les plus performants sur la période sélectionnée</p>
			</div>
			<Calendar size={20} class="text-muted-foreground" />
		</div>

		{#if data.eventRevenue.length === 0}
			<div class="flex items-center justify-center h-64 text-muted-foreground">
				<div class="text-center">
					<Calendar size={48} class="mx-auto mb-4 opacity-30" />
					<p class="text-sm">Pas de données pour cette période</p>
				</div>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-border-card">
							<th class="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Événement
							</th>
							<th class="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Revenus
							</th>
							<th class="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Billets
							</th>
							<th class="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Commandes
							</th>
							<th class="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">
								Part
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.eventRevenue as event, index}
							{@const topRevenue = data.eventRevenue[0].revenue}
							{@const share = ((event.revenue / topRevenue) * 100).toFixed(0)}
							<tr class="hover:bg-muted/50 transition-colors">
								<td class="py-3 pr-4">
									<div class="flex items-center gap-3">
										<span class="text-xs tabular-nums text-muted-foreground w-4">{index + 1}</span>
										<span class="font-medium text-foreground">{event.eventTitle}</span>
									</div>
								</td>
								<td class="py-3 text-right font-semibold text-foreground tabular-nums">
									{formatCurrency(event.revenue)}
								</td>
								<td class="py-3 text-right text-foreground-alt tabular-nums">
									{event.ticketsSold}
								</td>
								<td class="py-3 text-right text-foreground-alt tabular-nums">
									{event.payments}
								</td>
								<td class="py-3">
									<div class="flex items-center justify-end gap-2">
										<div class="w-20 bg-muted rounded-full h-1">
											<div
												class="h-1 rounded-full"
												style="width: {share}%; background: var(--foreground); opacity: 0.7"
											></div>
										</div>
										<span class="text-xs text-muted-foreground tabular-nums w-7 text-right">{share}%</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
