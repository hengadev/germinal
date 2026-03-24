<script lang="ts">
	import {
		DollarSign,
		CreditCard,
		CheckCircle,
		XCircle,
		AlertCircle,
		RefreshCw,
		TrendingUp,
		Ticket,
		BarChart3,
		Calendar,
		ArrowUp,
		ArrowDown,
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

	// Format currency
	function formatCurrency(cents: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'EUR'
		}).format(cents / 100);
	}

	// Format date
	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	// Status badge config
	function getStatusBadge(status: string) {
		switch (status) {
			case 'succeeded':
				return { text: 'Réussi', class: 'bg-green-50 text-green-700', bg: 'bg-green-500' };
			case 'failed':
				return { text: 'Échoué', class: 'bg-red-50 text-red-700', bg: 'bg-red-500' };
			case 'refunded':
				return { text: 'Remboursé', class: 'bg-muted text-foreground-alt', bg: 'bg-muted0' };
			case 'partially_refunded':
				return { text: 'Remboursé partiellement', class: 'bg-orange-50 text-orange-700', bg: 'bg-orange-500' };
			case 'pending':
				return { text: 'En attente', class: 'bg-yellow-50 text-yellow-700', bg: 'bg-yellow-500' };
			case 'processing':
				return { text: 'En traitement', class: 'bg-blue-50 text-blue-700', bg: 'bg-blue-500' };
			default:
				return { text: status, class: 'bg-muted text-foreground-alt', bg: 'bg-muted0' };
		}
	}

	// Calculate chart dimensions
	const chartHeight = 200;
	const chartPadding = 40;

	let maxRevenue = $derived(
		data.dailyRevenue.length > 0 ? Math.max(...data.dailyRevenue.map((d) => d.revenue)) : 0
	);

	// SVG chart helpers
	function getX(index: number, total: number): number {
		return chartPadding + (index / (total - 1 || 1)) * (600 - chartPadding * 2);
	}

	function getY(revenue: number): number {
		return chartHeight - chartPadding - (revenue / maxRevenue) * (chartHeight - chartPadding * 2);
	}

	function getBarHeight(revenue: number): number {
		return (revenue / maxRevenue) * (chartHeight - chartPadding * 2);
	}

	// Metric card data
	const metrics = [
		{
			label: 'Revenu Total',
			value: formatCurrency(data.metrics.totalRevenue),
			icon: DollarSign,
			color: 'bg-green-500',
			trend: null
		},
		{
			label: 'Paiements Réussis',
			value: data.metrics.successfulPayments.toString(),
			icon: CheckCircle,
			color: 'bg-green-500',
			trend: null
		},
		{
			label: 'Taux de Réussite',
			value: `${data.metrics.successRate.toFixed(1)}%`,
			icon: TrendingUp,
			color: 'bg-blue-500',
			trend: null
		},
		{
			label: 'Panier Moyen',
			value: formatCurrency(data.metrics.averageOrderValue),
			icon: CreditCard,
			color: 'bg-purple-500',
			trend: null
		},
		{
			label: 'Billets Vendus',
			value: data.metrics.totalTicketsSold.toString(),
			icon: Ticket,
			color: 'bg-orange-500',
			trend: null
		},
		{
			label: 'Paiements en Attente',
			value: data.metrics.pendingPayments.toString(),
			icon: RefreshCw,
			color: 'bg-yellow-500',
			trend: null
		},
		{
			label: 'Paiements Échoués',
			value: data.metrics.failedPayments.toString(),
			icon: XCircle,
			color: 'bg-red-500',
			trend: null
		},
		{
			label: 'Remboursés',
			value: data.metrics.refundedPayments.toString(),
			icon: AlertCircle,
			color: 'bg-muted0',
			trend: null
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
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Analytiques des Paiements</h1>
				<p class="text-muted-foreground">Suivre les revenus, les paiements et les métriques de performance</p>
			</div>
			<div class="flex items-center gap-3">
				<!-- Date Range Selector -->
				<div class="flex items-center gap-2 bg-background rounded-lg border border-border-card p-1">
				{#each ['7d', '30d', '90d', 'all'] as range}
					<button
						onclick={() => updateRange(range)}
						class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {selectedRange === range
							? 'bg-foreground text-background'
							: 'text-foreground-alt hover:opacity-90'}"
					>
						{range === 'all' ? 'Toutes périodes' : range === '7d' ? '7 jours' : range === '30d' ? '30 jours' : '90 jours'}
					</button>
				{/each}
			</div>
				<!-- Export Button -->
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
					<div class="p-2 {metric.color} bg-opacity-10 rounded-lg">
						<Icon size={20} class="{metric.color.replace('bg-', 'text-')}" />
					</div>
					{#if metric.trend !== null}
						<div class="flex items-center gap-1 text-sm">
							{#if metric.trend > 0}
								<ArrowUp size={16} class="text-green-600" />
								<span class="text-green-600 font-medium">{metric.trend}%</span>
							{:else if metric.trend < 0}
								<ArrowDown size={16} class="text-red-600" />
								<span class="text-red-600 font-medium">{Math.abs(metric.trend)}%</span>
							{:else}
								<span class="text-muted-foreground">-</span>
							{/if}
						</div>
					{/if}
				</div>
				<div class="text-2xl font-bold text-foreground mb-1">{metric.value}</div>
				<div class="text-sm text-muted-foreground">{metric.label}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
		<!-- Revenue Over Time Chart -->
		<div class="bg-background rounded-lg border border-border-card p-6">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 class="text-lg font-semibold text-foreground">Revenus au Fil du Temps</h2>
					<p class="text-sm text-muted-foreground">Revenus quotidiens des paiements réussis</p>
				</div>
				<BarChart3 size={20} class="text-muted-foreground" />
			</div>

			{#if data.dailyRevenue.length === 0}
				<div class="flex items-center justify-center h-64 text-muted-foreground">
					<div class="text-center">
						<BarChart3 size={48} class="mx-auto mb-4 text-muted-foreground" />
						<p>Pas de données de revenus pour cette période</p>
					</div>
				</div>
			{:else}
				<div class="relative">
					<!-- Bar Chart -->
					<svg viewBox="0 0 600 200" class="w-full h-auto" preserveAspectRatio="none">
						<!-- Y-axis grid lines -->
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1={chartPadding}
								y1={chartPadding + tick * (chartHeight - chartPadding * 2)}
								x2={600 - chartPadding}
								y2={chartPadding + tick * (chartHeight - chartPadding * 2)}
								stroke="#e5e7eb"
								stroke-dasharray="4"
							/>
						{/each}

						<!-- Bars -->
						{#each data.dailyRevenue as day, index}
							{@const x = getX(index, data.dailyRevenue.length)}
							{@const barWidth = Math.max(
								600 / data.dailyRevenue.length - chartPadding,
								2
							)}
							{@const barHeight = getBarHeight(day.revenue)}
							{@const y = chartHeight - chartPadding - barHeight}
							<rect
								x={x - barWidth / 2}
								y={y}
								width={barWidth}
								height={barHeight}
								fill="#10b981"
								rx="2"
								class="hover:fill-green-600 transition-colors cursor-pointer"
							>
								<title>{formatDate(day.date)}: {formatCurrency(day.revenue)}</title>
							</rect>
						{/each}

						<!-- X-axis labels (show first, middle, last) -->
						{#if data.dailyRevenue.length > 2}
							<text
								x={getX(0, data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								class="text-xs fill-muted-foreground"
							>
								{formatDate(data.dailyRevenue[0].date)}
							</text>
							<text
								x={getX(Math.floor(data.dailyRevenue.length / 2), data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								class="text-xs fill-muted-foreground"
							>
								{formatDate(data.dailyRevenue[Math.floor(data.dailyRevenue.length / 2)].date)}
							</text>
							<text
								x={getX(data.dailyRevenue.length - 1, data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								class="text-xs fill-muted-foreground"
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
					<h2 class="text-lg font-semibold text-foreground">Statut des Paiements</h2>
					<p class="text-sm text-muted-foreground">Répartition des statuts de paiement</p>
				</div>
				<CreditCard size={20} class="text-muted-foreground" />
			</div>

			{#if data.paymentStatusBreakdown.length === 0}
				<div class="flex items-center justify-center h-64 text-muted-foreground">
					<div class="text-center">
						<CreditCard size={48} class="mx-auto mb-4 text-muted-foreground" />
						<p>Pas de données de paiement disponibles</p>
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					{#each data.paymentStatusBreakdown as status}
						{@const badge = getStatusBadge(status.status)}
						<div>
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2">
									<div class="w-3 h-3 {badge.bg} rounded-full"></div>
									<span class="text-sm font-medium text-foreground">{badge.text}</span>
								</div>
								<div class="flex items-center gap-4">
									<span class="text-sm text-muted-foreground">
										{status.count} paiements
									</span>
									<span class="text-sm font-semibold text-foreground">
										{formatCurrency(status.amount)}
									</span>
								</div>
							</div>
							<div class="w-full bg-muted rounded-full h-2">
								<div
									class="{badge.bg} h-2 rounded-full transition-all"
									style="width: {status.percentage}%"
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
				<h2 class="text-lg font-semibold text-foreground">Meilleurs Événements par Revenus</h2>
				<p class="text-sm text-muted-foreground">Événements les plus performants de cette période</p>
			</div>
			<Calendar size={20} class="text-muted-foreground" />
		</div>

		{#if data.eventRevenue.length === 0}
			<div class="flex items-center justify-center h-64 text-muted-foreground">
				<div class="text-center">
					<Calendar size={48} class="mx-auto mb-4 text-muted-foreground" />
					<p>Pas de données de revenus d'événements pour cette période</p>
				</div>
			</div>
		{:else}
			<!-- Table view -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-muted border-b border-border-card">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase">
								Événement
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase">
								Revenus
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase">
								Billets Vendus
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase">
								Paiements
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase">
								%
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.eventRevenue as event, index}
							{@const maxRevenue = data.eventRevenue[0].revenue}
							<tr class="hover:bg-muted transition-colors">
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										<div
											class="w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs font-medium text-foreground-alt"
										>
											{index + 1}
										</div>
										<span class="font-medium text-foreground">{event.eventTitle}</span>
									</div>
								</td>
								<td class="px-4 py-3 text-right font-medium text-foreground">
									{formatCurrency(event.revenue)}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-1">
										<Ticket size={14} class="text-muted-foreground" />
										<span class="text-foreground-alt">{event.ticketsSold}</span>
									</div>
								</td>
								<td class="px-4 py-3 text-right text-foreground-alt">{event.payments}</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-2">
										<div class="w-16 bg-muted rounded-full h-1.5">
											<div
												class="bg-green-500 h-1.5 rounded-full"
												style="width: {(event.revenue / maxRevenue) * 100}%"
											></div>
										</div>
										<span class="text-xs text-muted-foreground w-8">
											{((event.revenue / maxRevenue) * 100).toFixed(0)}%
										</span>
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
