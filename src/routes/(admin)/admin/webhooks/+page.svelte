<script lang="ts">
	import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, ExternalLink, RotateCcw, User, Mail, Ticket, Calendar, RefreshCw } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	// Form state
	let form = $state<{
		success?: string;
		error?: string;
	} | undefined>();

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'succeeded':
				return { text: 'Paid', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'failed':
				return { text: 'Failed', class: 'bg-red-50 text-red-700', icon: XCircle };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', icon: null };
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
	<title>Webhook Monitoring | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Webhook Monitoring</h1>
		<p class="text-dark-400">Monitor payments with unprocessed webhooks</p>
	</div>

	<!-- Success/Error Messages -->
	{#if form?.success}
		<div class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-3">
			<CheckCircle2 size={20} />
			<span>{form.success}</span>
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-3">
			<AlertTriangle size={20} />
			<span>{form.error}</span>
		</div>
	{/if}

	{#if data.payments.length === 0}
		<div class="bg-white rounded-lg border border-border-card p-12 text-center">
			<CheckCircle2 size={48} class="mx-auto mb-4 text-green-300" />
			<h3 class="text-xl font-semibold text-dark-900 mb-2">
				All webhooks processed
			</h3>
			<p class="text-dark-400">
				No payments with unprocessed webhooks found. Everything is up to date!
			</p>
		</div>
	{:else}
		<!-- Info banner -->
		<div class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-start gap-3">
			<AlertTriangle size={20} class="flex-shrink-0 mt-0.5" />
			<div>
				<p class="font-medium mb-1">Payments with unprocessed webhooks</p>
				<p class="text-sm">
					These payments haven't had their Stripe webhooks processed yet. This could be due to webhook delivery failures or timing issues.
					Use the retry action to manually process the webhook.
				</p>
			</div>
		</div>

		<!-- Results count -->
		<div class="mb-6 text-sm text-dark-500">
			Showing {data.payments.length} payments with unprocessed webhooks
		</div>

		<!-- Table view for desktop -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-dark-50 border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Payment
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Reservation
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Amount
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Status
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Created
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Error
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.payments as payment}
						{@const statusBadge = getStatusBadge(payment.status)}
						<tr class="hover:bg-dark-50 transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
										<CreditCard size={18} class="text-dark-500" />
									</div>
									<div>
										<div class="font-medium text-dark-900 font-mono text-sm">
											{payment.stripePaymentIntentId}
										</div>
										<div class="text-xs text-dark-400">
											ID: {payment.id.substring(0, 8)}
										</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								{#if payment.reservation}
									<div class="text-sm">
										<div class="flex items-center gap-2">
											<User size={14} class="text-dark-400" />
											<span class="font-medium text-dark-900">{payment.reservation.guestName}</span>
										</div>
										<div class="flex items-center gap-2 text-dark-400">
											<Mail size={12} />
											<span class="text-xs">{payment.reservation.guestEmail}</span>
										</div>
										<div class="text-dark-400 text-xs mt-1">
											{payment.reservation.eventTitle}
										</div>
										<div class="text-dark-400 text-xs">
											{payment.reservation.sessionTitle}
										</div>
									</div>
								{:else}
									<div class="text-sm text-dark-400">No reservation</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="text-sm font-semibold text-dark-900">
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
								<div class="text-sm text-dark-600">
									{formatDateTime(payment.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								{#if payment.lastError}
									<div class="text-sm text-red-600 truncate max-w-xs" title={payment.lastError}>
										{payment.lastError}
									</div>
								{:else}
									<div class="text-sm text-dark-400">-</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									{#if payment.reservation}
										<a
											href="/admin/reservations/{payment.reservation.id}"
											class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
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
											class="p-2 text-dark-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
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
				<div class="bg-white rounded-lg border border-border-card p-4">
					<div class="flex items-start gap-3 mb-3">
						<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center flex-shrink-0">
							<CreditCard size={18} class="text-dark-500" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-mono text-sm font-semibold text-dark-900 truncate">
									{payment.stripePaymentIntentId}
								</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {statusBadge.class} rounded-full flex-shrink-0">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={10} />
									{/if}
									{statusBadge.text}
								</span>
							</div>
							<p class="text-xs text-dark-400">ID: {payment.id.substring(0, 8)}</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<div class="text-xs text-dark-400">Amount</div>
							<div class="text-sm font-semibold text-dark-900">
								{formatCurrency(payment.amount, payment.currency)}
							</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Created</div>
							<div class="text-sm text-dark-900">{formatDate(payment.createdAt)}</div>
						</div>
					</div>

					{#if payment.reservation}
						<div class="mb-3 pb-3 border-b border-border-card">
							<div class="text-xs text-dark-400 mb-1">Guest</div>
							<div class="text-sm font-medium text-dark-900">{payment.reservation.guestName}</div>
							<div class="text-xs text-dark-400">{payment.reservation.guestEmail}</div>
							<div class="text-xs text-dark-400 mt-1">
								{payment.reservation.eventTitle}
							</div>
						</div>
					{/if}

					{#if payment.lastError}
						<div class="mb-3">
							<div class="text-xs text-dark-400">Error</div>
							<div class="text-sm text-red-600 truncate">{payment.lastError}</div>
						</div>
					{/if}

					<div class="flex items-center justify-between pt-3 border-t border-border-card">
						<div class="text-xs text-dark-400">
							{formatDateTime(payment.createdAt)}
						</div>
						<div class="flex items-center gap-2">
							{#if payment.reservation}
								<a
									href="/admin/reservations/{payment.reservation.id}"
									class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
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
									class="p-2 text-dark-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
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
