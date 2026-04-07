<script lang="ts">
	import {
		Ticket,
		TrendingUp,
		Calendar,
		Clock,
		ArrowRight,
		Users,
		BarChart3,
		Plus
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatCurrency(cents: number, currency = 'EUR'): string {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (minutes < 1) return "à l'instant";
		if (minutes < 60) return `il y a ${minutes}m`;
		if (hours < 24) return `il y a ${hours}h`;
		return `il y a ${days}j`;
	}

	function fillRate(total: number, available: number): number {
		if (total === 0) return 0;
		return Math.round(((total - available) / total) * 100);
	}
</script>

<svelte:head>
	<title>Tableau de bord | Germinal Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-1">Tableau de bord</h1>
		<p class="text-muted-foreground">Activité récente et aperçu de vos événements</p>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		<div class="bg-background rounded-lg border border-border-card p-5">
			<div class="flex items-center gap-2 mb-3">
				<TrendingUp size={16} class="text-muted-foreground" />
				<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenus (7j)</span>
			</div>
			<div class="text-2xl font-bold text-foreground">{formatCurrency(data.stats.revenueThisWeek)}</div>
		</div>

		<div class="bg-background rounded-lg border border-border-card p-5">
			<div class="flex items-center gap-2 mb-3">
				<Ticket size={16} class="text-muted-foreground" />
				<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Billets (7j)</span>
			</div>
			<div class="text-2xl font-bold text-foreground">{data.stats.ticketsThisWeek}</div>
		</div>

		<div class="bg-background rounded-lg border border-border-card p-5">
			<div class="flex items-center gap-2 mb-3">
				<Calendar size={16} class="text-muted-foreground" />
				<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sessions à venir</span>
			</div>
			<div class="text-2xl font-bold text-foreground">{data.stats.upcomingSessionsCount}</div>
		</div>

		<div class="bg-background rounded-lg border border-border-card p-5">
			<div class="flex items-center gap-2 mb-3">
				<Clock size={16} class="text-muted-foreground" />
				<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">En attente</span>
			</div>
			<div class="text-2xl font-bold text-foreground">{data.stats.pendingReservationsCount}</div>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
		<!-- Recent Bookings -->
		<div class="lg:col-span-3 bg-background rounded-lg border border-border-card">
			<div class="flex items-center justify-between px-6 py-4 border-b border-border-card">
				<div>
					<h2 class="text-base font-semibold text-foreground">Dernières réservations</h2>
					<p class="text-xs text-muted-foreground mt-0.5">Billets confirmés récemment</p>
				</div>
				<a
					href="/admin/reservations"
					class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
				>
					Voir tout
					<ArrowRight size={12} />
				</a>
			</div>

			{#if data.recentBookings.length === 0}
				<div class="flex items-center justify-center h-48 text-muted-foreground">
					<div class="text-center">
						<Users size={36} class="mx-auto mb-3 opacity-25" />
						<p class="text-sm">Aucune réservation confirmée</p>
					</div>
				</div>
			{:else}
				<div class="divide-y divide-border-card">
					{#each data.recentBookings as booking}
						<div class="px-6 py-4 hover:bg-muted/40 transition-colors">
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0">
									<div class="font-medium text-foreground text-sm truncate">{booking.guestName}</div>
									<div class="text-xs text-muted-foreground mt-0.5 truncate">
										{booking.eventTitle}
										{#if booking.sessionTitle}
											· {booking.sessionTitle}
										{/if}
									</div>
								</div>
								<div class="flex-shrink-0 text-right">
									<div class="text-sm font-semibold text-foreground tabular-nums">
										{formatCurrency(booking.totalAmount, booking.currency)}
									</div>
									<div class="text-xs text-muted-foreground mt-0.5">
										{booking.quantity} billet{booking.quantity > 1 ? 's' : ''} · {timeAgo(booking.confirmedAt)}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Upcoming Sessions -->
		<div class="lg:col-span-2 bg-background rounded-lg border border-border-card">
			<div class="flex items-center justify-between px-6 py-4 border-b border-border-card">
				<div>
					<h2 class="text-base font-semibold text-foreground">Prochaines sessions</h2>
					<p class="text-xs text-muted-foreground mt-0.5">Capacité et remplissage</p>
				</div>
				<a
					href="/admin/events"
					class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
				>
					Voir tout
					<ArrowRight size={12} />
				</a>
			</div>

			{#if data.upcomingSessions.length === 0}
				<div class="flex items-center justify-center h-48 text-muted-foreground">
					<div class="text-center">
						<Calendar size={36} class="mx-auto mb-3 opacity-25" />
						<p class="text-sm">Aucune session à venir</p>
					</div>
				</div>
			{:else}
				<div class="divide-y divide-border-card">
					{#each data.upcomingSessions as session}
						{@const fill = fillRate(session.totalCapacity, session.availableCapacity)}
						<div class="px-6 py-4">
							<div class="font-medium text-foreground text-sm truncate">{session.eventTitle}</div>
							<div class="text-xs text-muted-foreground mt-0.5 mb-3">
								{session.sessionTitle} · {formatDate(session.startTime)}
							</div>
							<div class="flex items-center justify-between text-xs mb-1.5">
								<span class="text-muted-foreground">
									{session.totalCapacity - session.availableCapacity}/{session.totalCapacity} places
								</span>
								<span class="font-medium text-foreground">{fill}%</span>
							</div>
							<div class="w-full bg-muted rounded-full h-1">
								<div
									class="h-1 rounded-full transition-all"
									style="width: {fill}%; background: var(--foreground); opacity: 0.75"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="flex flex-wrap gap-3">
		<a
			href="/admin/events/new"
			class="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
		>
			<Plus size={15} />
			Nouvel événement
		</a>
		<a
			href="/admin/talents/new"
			class="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
		>
			<Plus size={15} />
			Nouveau talent
		</a>
		<a
			href="/admin/analytics"
			class="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
		>
			<BarChart3 size={15} />
			Analytiques
		</a>
		<a
			href="/admin/reservations"
			class="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors text-sm font-medium"
		>
			<Ticket size={15} />
			Réservations
		</a>
	</div>
</div>
