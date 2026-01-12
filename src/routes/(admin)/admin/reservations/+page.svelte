<script lang="ts">
	import { Eye, CheckCircle2, Clock, XCircle, AlertCircle, Search, Calendar, User, Mail, Ticket, CreditCard, ArrowRight } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();

	// Filter and search state
	let statusFilter = $state<'all' | 'confirmed' | 'pending' | 'cancelled' | 'expired'>('all');
	let searchQuery = $state('');

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'confirmed':
				return { text: 'Confirmed', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'cancelled':
				return { text: 'Cancelled', class: 'bg-red-50 text-red-700', icon: XCircle };
			case 'expired':
				return { text: 'Expired', class: 'bg-dark-100 text-dark-600', icon: AlertCircle };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', icon: null };
		}
	}

	// Get payment status badge
	function getPaymentStatusBadge(status: string) {
		switch (status) {
			case 'succeeded':
				return { text: 'Paid', class: 'bg-green-50 text-green-700' };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700' };
			case 'failed':
				return { text: 'Failed', class: 'bg-red-50 text-red-700' };
			case 'refunded':
				return { text: 'Refunded', class: 'bg-dark-100 text-dark-600' };
			default:
				return { text: 'None', class: 'bg-dark-100 text-dark-600' };
		}
	}

	// Filter reservations
	let filteredReservations = $derived(() => {
		let filtered = data.reservations;

		// Filter by status
		if (statusFilter !== 'all') {
			filtered = filtered.filter(r => r.status === statusFilter);
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(r =>
				r.guestName.toLowerCase().includes(query) ||
				r.guestEmail.toLowerCase().includes(query) ||
				r.eventTitle.toLowerCase().includes(query) ||
				r.sessionTitle.toLowerCase().includes(query)
			);
		}

		return filtered;
	});

	// Format date and time
	function formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Reservations | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Reservations</h1>
		<p class="text-dark-400">Manage all event reservations</p>
	</div>

	<!-- Filters and Search -->
	<div class="bg-white rounded-lg border border-border-card p-4 mb-6">
		<div class="flex flex-col sm:flex-row gap-4">
			<!-- Status Filter -->
			<div class="flex-1">
				<label for="statusFilter" class="block text-sm font-medium text-dark-700 mb-1">Filter by Status</label>
				<select
					id="statusFilter"
					bind:value={statusFilter}
					class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
				>
					<option value="all">All Statuses</option>
					<option value="confirmed">Confirmed</option>
					<option value="pending">Pending</option>
					<option value="cancelled">Cancelled</option>
					<option value="expired">Expired</option>
				</select>
			</div>

			<!-- Search -->
			<div class="flex-1">
				<label for="search" class="block text-sm font-medium text-dark-700 mb-1">Search</label>
				<div class="relative">
					<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
					<input
						id="search"
						type="text"
						bind:value={searchQuery}
						placeholder="Search by name, email, or event..."
						class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
					/>
				</div>
			</div>
		</div>

		<!-- Results count -->
		<div class="mt-3 text-sm text-dark-500">
			Showing {filteredReservations().length} of {data.reservations.length} reservations
		</div>
	</div>

	{#if filteredReservations().length === 0}
		<div class="bg-white rounded-lg border border-border-card p-12 text-center">
			<Ticket size={48} class="mx-auto mb-4 text-dark-300" />
			<h3 class="text-xl font-semibold text-dark-900 mb-2">
				No reservations found
			</h3>
			<p class="text-dark-400">
				{#if searchQuery || statusFilter !== 'all'}
					Try adjusting your filters or search query
				{:else}
					No reservations have been made yet
				{/if}
			</p>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-dark-50 border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Guest
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Event
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Quantity & Total
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Status
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Payment
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Date
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each filteredReservations() as reservation}
						{@const statusBadge = getStatusBadge(reservation.status)}
						{@const paymentBadge = getPaymentStatusBadge(reservation.paymentStatus)}
						<tr class="hover:bg-dark-50 transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
										<User size={18} class="text-dark-500" />
									</div>
									<div>
										<div class="font-medium text-dark-900">{reservation.guestName}</div>
										<div class="text-sm text-dark-400 flex items-center gap-1">
											<Mail size={12} />
											{reservation.guestEmail}
										</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="font-medium text-dark-900">{reservation.eventTitle}</div>
									<div class="text-dark-400">{reservation.sessionTitle}</div>
									<div class="text-dark-400 text-xs mt-1">
										{formatDate(reservation.sessionStartTime)}
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="flex items-center gap-2 text-dark-900">
										<Ticket size={14} />
										<span class="font-medium">{reservation.quantity}</span>
									</div>
									<div class="text-dark-900">
										{formatCurrency(reservation.totalAmount, reservation.currency)}
									</div>
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
								<div class="flex items-center gap-2">
									<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {paymentBadge.class} rounded-full">
										{paymentBadge.text}
									</span>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-600">
									{formatDateTime(reservation.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<a
										href="/admin/reservations/{reservation.id}"
										class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
										title="View Details"
									>
										<Eye size={18} />
									</a>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each filteredReservations() as reservation}
				{@const statusBadge = getStatusBadge(reservation.status)}
				{@const paymentBadge = getPaymentStatusBadge(reservation.paymentStatus)}
				<div class="bg-white rounded-lg border border-border-card p-4">
					<div class="flex items-start gap-3 mb-3">
						<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center flex-shrink-0">
							<User size={18} class="text-dark-500" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-semibold text-dark-900 truncate">
									{reservation.guestName}
								</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {statusBadge.class} rounded-full flex-shrink-0">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={10} />
									{/if}
									{statusBadge.text}
								</span>
							</div>
							<p class="text-sm text-dark-400 truncate">{reservation.guestEmail}</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<div class="text-xs text-dark-400">Event</div>
							<div class="text-sm font-medium text-dark-900 truncate">{reservation.eventTitle}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Tickets</div>
							<div class="text-sm font-medium text-dark-900">{reservation.quantity}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Total</div>
							<div class="text-sm font-medium text-dark-900">
								{formatCurrency(reservation.totalAmount, reservation.currency)}
							</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Payment</div>
							<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {paymentBadge.class} rounded-full">
								{paymentBadge.text}
							</span>
						</div>
					</div>

					<div class="flex items-center justify-between pt-3 border-t border-border-card">
						<div class="text-xs text-dark-400">
							{formatDateTime(reservation.createdAt)}
						</div>
						<a
							href="/admin/reservations/{reservation.id}"
							class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
						>
							View Details
							<ArrowRight size={14} />
						</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
