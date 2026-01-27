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
				return { text: 'Succeeded', class: 'bg-green-50 text-green-700', bg: 'bg-green-500' };
			case 'failed':
				return { text: 'Failed', class: 'bg-red-50 text-red-700', bg: 'bg-red-500' };
			case 'refunded':
				return { text: 'Refunded', class: 'bg-dark-100 text-dark-600', bg: 'bg-dark-500' };
			case 'partially_refunded':
				return { text: 'Partially Refunded', class: 'bg-orange-50 text-orange-700', bg: 'bg-orange-500' };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', bg: 'bg-yellow-500' };
			case 'processing':
				return { text: 'Processing', class: 'bg-blue-50 text-blue-700', bg: 'bg-blue-500' };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', bg: 'bg-dark-500' };
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
			label: 'Total Revenue',
			value: formatCurrency(data.metrics.totalRevenue),
			icon: DollarSign,
			color: 'bg-green-500',
			trend: null
		},
		{
			label: 'Successful Payments',
			value: data.metrics.successfulPayments.toString(),
			icon: CheckCircle,
			color: 'bg-green-500',
			trend: null
		},
		{
			label: 'Success Rate',
			value: `${data.metrics.successRate.toFixed(1)}%`,
			icon: TrendingUp,
			color: 'bg-blue-500',
			trend: null
		},
		{
			label: 'Avg Order Value',
			value: formatCurrency(data.metrics.averageOrderValue),
			icon: CreditCard,
			color: 'bg-purple-500',
			trend: null
		},
		{
			label: 'Total Tickets Sold',
			value: data.metrics.totalTicketsSold.toString(),
			icon: Ticket,
			color: 'bg-orange-500',
			trend: null
		},
		{
			label: 'Pending Payments',
			value: data.metrics.pendingPayments.toString(),
			icon: RefreshCw,
			color: 'bg-yellow-500',
			trend: null
		},
		{
			label: 'Failed Payments',
			value: data.metrics.failedPayments.toString(),
			icon: XCircle,
			color: 'bg-red-500',
			trend: null
		},
		{
			label: 'Refunded',
			value: data.metrics.refundedPayments.toString(),
			icon: AlertCircle,
			color: 'bg-dark-500',
			trend: null
		}
	];
</script>

<svelte:head>
	<title>Payment Analytics | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
			<div>
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Payment Analytics</h1>
				<p class="text-dark-400">Track revenue, payments, and performance metrics</p>
			</div>
			<div class="flex items-center gap-3">
				<!-- Date Range Selector -->
				<div class="flex items-center gap-2 bg-white rounded-lg border border-border-card p-1">
				{#each ['7d', '30d', '90d', 'all'] as range}
					<button
						onclick={() => updateRange(range)}
						class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {selectedRange === range
							? 'bg-dark-900 text-white'
							: 'text-dark-600 hover:bg-dark-50'}"
					>
						{range === 'all' ? 'All time' : range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
					</button>
				{/each}
			</div>
				<!-- Export Button -->
				<a
					href="/admin/export/analytics"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm whitespace-nowrap"
				>
					<Download size={16} />
					Export CSV
				</a>
			</div>
		</div>
	</div>

	<!-- Metrics Grid -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		{#each metrics as metric}
			{@const Icon = metric.icon}
			<div class="bg-white rounded-lg border border-border-card p-6 hover:shadow-sm transition-shadow">
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
								<span class="text-dark-400">-</span>
							{/if}
						</div>
					{/if}
				</div>
				<div class="text-2xl font-bold text-dark-900 mb-1">{metric.value}</div>
				<div class="text-sm text-dark-400">{metric.label}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
		<!-- Revenue Over Time Chart -->
		<div class="bg-white rounded-lg border border-border-card p-6">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 class="text-lg font-semibold text-dark-900">Revenue Over Time</h2>
					<p class="text-sm text-dark-400">Daily revenue from successful payments</p>
				</div>
				<BarChart3 size={20} class="text-dark-400" />
			</div>

			{#if data.dailyRevenue.length === 0}
				<div class="flex items-center justify-center h-64 text-dark-400">
					<div class="text-center">
						<BarChart3 size={48} class="mx-auto mb-4 text-dark-300" />
						<p>No revenue data available for this period</p>
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
								class="text-xs fill-dark-400"
							>
								{formatDate(data.dailyRevenue[0].date)}
							</text>
							<text
								x={getX(Math.floor(data.dailyRevenue.length / 2), data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								class="text-xs fill-dark-400"
							>
								{formatDate(data.dailyRevenue[Math.floor(data.dailyRevenue.length / 2)].date)}
							</text>
							<text
								x={getX(data.dailyRevenue.length - 1, data.dailyRevenue.length)}
								y={chartHeight - 10}
								text-anchor="middle"
								class="text-xs fill-dark-400"
							>
								{formatDate(data.dailyRevenue[data.dailyRevenue.length - 1].date)}
							</text>
						{/if}
					</svg>
				</div>
			{/if}
		</div>

		<!-- Payment Status Breakdown -->
		<div class="bg-white rounded-lg border border-border-card p-6">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 class="text-lg font-semibold text-dark-900">Payment Status</h2>
					<p class="text-sm text-dark-400">Distribution of payment statuses</p>
				</div>
				<CreditCard size={20} class="text-dark-400" />
			</div>

			{#if data.paymentStatusBreakdown.length === 0}
				<div class="flex items-center justify-center h-64 text-dark-400">
					<div class="text-center">
						<CreditCard size={48} class="mx-auto mb-4 text-dark-300" />
						<p>No payment data available</p>
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
									<span class="text-sm font-medium text-dark-900">{badge.text}</span>
								</div>
								<div class="flex items-center gap-4">
									<span class="text-sm text-dark-400">
										{status.count} payments
									</span>
									<span class="text-sm font-semibold text-dark-900">
										{formatCurrency(status.amount)}
									</span>
								</div>
							</div>
							<div class="w-full bg-dark-100 rounded-full h-2">
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
	<div class="bg-white rounded-lg border border-border-card p-6">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-lg font-semibold text-dark-900">Top Events by Revenue</h2>
				<p class="text-sm text-dark-400">Best performing events in this period</p>
			</div>
			<Calendar size={20} class="text-dark-400" />
		</div>

		{#if data.eventRevenue.length === 0}
			<div class="flex items-center justify-center h-64 text-dark-400">
				<div class="text-center">
					<Calendar size={48} class="mx-auto mb-4 text-dark-300" />
					<p>No event revenue data available for this period</p>
				</div>
			</div>
		{:else}
			<!-- Table view -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-dark-50 border-b border-border-card">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-semibold text-dark-600 uppercase">
								Event
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-dark-600 uppercase">
								Revenue
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-dark-600 uppercase">
								Tickets Sold
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-dark-600 uppercase">
								Payments
							</th>
							<th class="px-4 py-3 text-right text-xs font-semibold text-dark-600 uppercase">
								%
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.eventRevenue as event, index}
							{@const maxRevenue = data.eventRevenue[0].revenue}
							<tr class="hover:bg-dark-50 transition-colors">
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										<div
											class="w-6 h-6 bg-dark-100 rounded-full flex items-center justify-center text-xs font-medium text-dark-600"
										>
											{index + 1}
										</div>
										<span class="font-medium text-dark-900">{event.eventTitle}</span>
									</div>
								</td>
								<td class="px-4 py-3 text-right font-medium text-dark-900">
									{formatCurrency(event.revenue)}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-1">
										<Ticket size={14} class="text-dark-400" />
										<span class="text-dark-600">{event.ticketsSold}</span>
									</div>
								</td>
								<td class="px-4 py-3 text-right text-dark-600">{event.payments}</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-2">
										<div class="w-16 bg-dark-100 rounded-full h-1.5">
											<div
												class="bg-green-500 h-1.5 rounded-full"
												style="width: {(event.revenue / maxRevenue) * 100}%"
											></div>
										</div>
										<span class="text-xs text-dark-400 w-8">
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
