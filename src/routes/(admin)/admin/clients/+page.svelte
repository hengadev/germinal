<script lang="ts">
	import { Search, ChevronLeft, ChevronRight, Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { guestKeyFromEmail } from '$lib/utils/guest-email';
	import { formatCurrency } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();
	const uid = $props.id();

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function hrefWith(params: Record<string, string | number>): string {
		const search = new URLSearchParams();
		const current: Record<string, string | number> = {
			search: data.search,
			sort: data.sort,
			page: data.page
		};
		for (const [key, value] of Object.entries({ ...current, ...params })) {
			const str = String(value);
			if (str && str !== 'last-visit') search.set(key, str);
		}
		const query = search.toString();
		return query ? `/admin/clients?${query}` : '/admin/clients';
	}

	const sortOptions: { value: string; label: string }[] = [
		{ value: 'last-visit', label: 'Dernière visite' },
		{ value: 'visits', label: 'Visites' },
		{ value: 'amount', label: 'Montant payé' }
	];
</script>

<svelte:head>
	<title>Clients — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-foreground">Clients</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Un client est identifié par son email. L'identité d'un client est effacée un an après sa
			séance : l'historique ne remonte qu'à environ un an.
		</p>
	</div>

	<!-- Search and sort -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<div class="flex flex-col sm:flex-row gap-4">
			<form action="/admin/clients" method="get" class="flex-1">
				<label for="{uid}-search" class="block text-sm font-medium text-foreground-alt mb-1">Rechercher</label>
				<div class="relative">
					<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="{uid}-search"
						type="text"
						name="search"
						value={data.search}
						placeholder="Rechercher par nom ou email..."
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					/>
				</div>
			</form>
			<div class="flex-1">
				<label for="{uid}-sort" class="block text-sm font-medium text-foreground-alt mb-1">Trier par</label>
				<select
					id="{uid}-sort"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					value={data.sort}
					onchange={(e) => {
						const url = new URL(window.location.href);
						url.searchParams.set('sort', (e.currentTarget as HTMLSelectElement).value);
						url.searchParams.delete('page');
						window.location.assign(url);
					}}
				>
					{#each sortOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
		<p class="mt-3 text-sm text-muted-foreground">
			{data.total} client{data.total > 1 ? 's' : ''}
		</p>
	</div>

	{#if data.guests.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<Users size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">Aucun client trouvé</h3>
			<p class="text-muted-foreground">
				{#if data.search}
					Essayez d'ajuster votre recherche
				{:else}
					Aucun client n'a encore de réservation avec email
				{/if}
			</p>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-muted border-b border-border-card">
						<tr>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Client</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Visites</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Invités arrivés</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">No-shows</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Montant payé</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Dernière visite</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">À venir</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.guests as guest (guest.email)}
							<tr class="hover:bg-muted/50">
								<td class="px-6 py-4">
									<a href="/admin/clients/{guestKeyFromEmail(guest.email)}" class="font-medium text-foreground hover:underline">{guest.name}</a>
									<p class="text-sm text-muted-foreground">{guest.email}</p>
								</td>
								<td class="px-6 py-4 text-foreground">{guest.visits}</td>
								<td class="px-6 py-4 text-foreground">{guest.guestsArrived}</td>
								<td class="px-6 py-4 text-foreground">{guest.noShows}</td>
								<td class="px-6 py-4 text-foreground">
									{#if guest.amounts.length === 0}
										—
									{:else}
										{#each guest.amounts as amount (amount.currency)}
											<div>{formatCurrency(amount.net, amount.currency)}</div>
										{/each}
									{/if}
								</td>
								<td class="px-6 py-4 text-foreground">{guest.lastVisit ? formatDate(guest.lastVisit) : '—'}</td>
								<td class="px-6 py-4 text-foreground">{guest.upcoming}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.guests as guest (guest.email)}
				<a
					href="/admin/clients/{guestKeyFromEmail(guest.email)}"
					class="block bg-background rounded-lg border border-border-card p-4"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="font-medium text-foreground truncate">{guest.name}</span>
						{#if guest.lastVisit}
							<span class="text-xs text-muted-foreground whitespace-nowrap">{formatDate(guest.lastVisit)}</span>
						{/if}
					</div>
					<p class="text-sm text-muted-foreground truncate">{guest.email}</p>
					<div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-foreground-alt">
						<span>Visites : {guest.visits}</span>
						<span>À venir : {guest.upcoming}</span>
						<span>Arrivés : {guest.guestsArrived}</span>
						<span>No-shows : {guest.noShows}</span>
					</div>
					{#if guest.amounts.length > 0}
						<p class="mt-1 text-sm text-foreground">
							{#each guest.amounts as amount (amount.currency)}
								<span class="mr-3">{formatCurrency(amount.net, amount.currency)}</span>
							{/each}
						</p>
					{/if}
				</a>
			{/each}
		</div>

		<!-- Pagination -->
		{#if data.pageCount > 1}
			<div class="mt-6 flex items-center justify-between">
				<a
					href={hrefWith({ page: data.page - 1 })}
					class="inline-flex items-center gap-1 px-4 py-2 border border-border-input rounded-lg text-sm text-foreground-alt hover:text-foreground {data.page <= 1 ? 'pointer-events-none opacity-50' : ''}"
				>
					<ChevronLeft size={16} /> Précédent
				</a>
				<span class="text-sm text-muted-foreground">Page {data.page} sur {data.pageCount}</span>
				<a
					href={hrefWith({ page: data.page + 1 })}
					class="inline-flex items-center gap-1 px-4 py-2 border border-border-input rounded-lg text-sm text-foreground-alt hover:text-foreground {data.page >= data.pageCount ? 'pointer-events-none opacity-50' : ''}"
				>
					Suivant <ChevronRight size={16} />
				</a>
			</div>
		{/if}
	{/if}
</div>
