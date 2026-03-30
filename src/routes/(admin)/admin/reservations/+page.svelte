<script lang="ts">
	import { Eye, CheckCircle2, Clock, XCircle, AlertCircle, Search, Calendar, User, Mail, Ticket, CreditCard, ArrowRight, Download } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();

	// Filter and search state
	let statusFilter = $state<'all' | 'confirmed' | 'pending' | 'cancelled' | 'expired'>('all');
	let searchQuery = $state('');

	// Get export URL
	let exportUrl = $derived(() => {
		const params = new URLSearchParams();
		if (statusFilter !== 'all') params.set('status', statusFilter);
		return `/admin/export/reservations?${params.toString()}`;
	});

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'confirmed':
				return { text: 'Confirmée', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'En attente', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'cancelled':
				return { text: 'Annulée', class: 'bg-red-50 text-red-700', icon: XCircle };
			case 'expired':
				return { text: 'Expirée', class: 'bg-muted text-foreground-alt', icon: AlertCircle };
			default:
				return { text: status, class: 'bg-muted text-foreground-alt', icon: null };
		}
	}

	// Get payment status badge
	function getPaymentStatusBadge(status: string) {
		switch (status) {
			case 'succeeded':
				return { text: 'Payé', class: 'bg-green-50 text-green-700' };
			case 'pending':
				return { text: 'En attente', class: 'bg-yellow-50 text-yellow-700' };
			case 'failed':
				return { text: 'Échoué', class: 'bg-red-50 text-red-700' };
			case 'refunded':
				return { text: 'Remboursé', class: 'bg-muted text-foreground-alt' };
			default:
				return { text: 'Aucun', class: 'bg-muted text-foreground-alt' };
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
	<title>Réservations | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Réservations</h1>
			<p class="text-muted-foreground">Gérer toutes les réservations d'événements</p>
		</div>
		<a
			href={exportUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium text-sm"
		>
			<Download size={16} />
			Exporter CSV
		</a>
	</div>

	<!-- Filters and Search -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<div class="flex flex-col sm:flex-row gap-4">
			<!-- Status Filter -->
			<div class="flex-1">
				<label for="statusFilter" class="block text-sm font-medium text-foreground-alt mb-1">Filtrer par Statut</label>
				<select
					id="statusFilter"
					bind:value={statusFilter}
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				>
					<option value="all">Tous les Statuts</option>
					<option value="confirmed">Confirmée</option>
					<option value="pending">En attente</option>
					<option value="cancelled">Annulée</option>
					<option value="expired">Expirée</option>
				</select>
			</div>

			<!-- Search -->
			<div class="flex-1">
				<label for="search" class="block text-sm font-medium text-foreground-alt mb-1">Rechercher</label>
				<div class="relative">
					<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="search"
						type="text"
						bind:value={searchQuery}
						placeholder="Rechercher par nom, email ou événement..."
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					/>
				</div>
			</div>
		</div>

		<!-- Results count -->
		<div class="mt-3 text-sm text-muted-foreground">
			Affichage de {filteredReservations().length} sur {data.reservations.length} réservations
		</div>
	</div>

	{#if filteredReservations().length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<Ticket size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">
				Aucune réservation trouvée
			</h3>
			<p class="text-muted-foreground">
				{#if searchQuery || statusFilter !== 'all'}
					Essayez d'ajuster vos filtres ou votre recherche
				{:else}
					Aucune réservation n'a encore été faite
				{/if}
			</p>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Invité
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Événement
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Quantité & Total
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Statut
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Paiement
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Date
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each filteredReservations() as reservation}
						{@const statusBadge = getStatusBadge(reservation.status)}
						{@const paymentBadge = getPaymentStatusBadge(reservation.paymentStatus)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
										<User size={18} class="text-muted-foreground" />
									</div>
									<div>
										<div class="font-medium text-foreground">{reservation.guestName}</div>
										<div class="text-sm text-muted-foreground flex items-center gap-1">
											<Mail size={12} />
											{reservation.guestEmail}
										</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="font-medium text-foreground">{reservation.eventTitle}</div>
									<div class="text-muted-foreground">{reservation.sessionTitle}</div>
									<div class="text-muted-foreground text-xs mt-1">
										{formatDate(reservation.sessionStartTime)}
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="flex items-center gap-2 text-foreground">
										<Ticket size={14} />
										<span class="font-medium">{reservation.quantity}</span>
									</div>
									<div class="text-foreground">
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
								<div class="text-sm text-foreground-alt">
									{formatDateTime(reservation.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<a
										href="/admin/reservations/{reservation.id}"
										class="p-2 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
										title="Voir Détails"
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
				<div class="bg-background rounded-lg border border-border-card p-4">
					<div class="flex items-start gap-3 mb-3">
						<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
							<User size={18} class="text-muted-foreground" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-semibold text-foreground truncate">
									{reservation.guestName}
								</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {statusBadge.class} rounded-full flex-shrink-0">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={10} />
									{/if}
									{statusBadge.text}
								</span>
							</div>
							<p class="text-sm text-muted-foreground truncate">{reservation.guestEmail}</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<div class="text-xs text-muted-foreground">Événement</div>
							<div class="text-sm font-medium text-foreground truncate">{reservation.eventTitle}</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Billets</div>
							<div class="text-sm font-medium text-foreground">{reservation.quantity}</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Total</div>
							<div class="text-sm font-medium text-foreground">
								{formatCurrency(reservation.totalAmount, reservation.currency)}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Paiement</div>
							<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {paymentBadge.class} rounded-full">
								{paymentBadge.text}
							</span>
						</div>
					</div>

					<div class="flex items-center justify-between pt-3 border-t border-border-card">
						<div class="text-xs text-muted-foreground">
							{formatDateTime(reservation.createdAt)}
						</div>
						<a
							href="/admin/reservations/{reservation.id}"
							class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
						>
							Voir Détails
							<ArrowRight size={14} />
						</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
