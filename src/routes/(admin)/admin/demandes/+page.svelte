<script lang="ts">
	import { Inbox, ChevronRight } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { ContactSubmission } from '$lib/types/contact';

	let { data }: { data: PageData } = $props();
	const uid = $props.id();

	const typeLabels: Record<string, string> = {
		collaboration: 'Collaboration',
		new_project: 'Nouveau projet',
		join_roster: 'Rejoindre la liste',
		private_event: 'Privatisation',
		other: 'Autre'
	};

	const statusLabels: Record<string, string> = {
		new: 'Nouvelle',
		discussing: 'En discussion',
		quote_sent: 'Devis envoyé',
		confirmed: 'Confirmée',
		lost: 'Perdue'
	};

	const statusClasses: Record<string, string> = {
		new: 'bg-blue-100 text-blue-800',
		discussing: 'bg-amber-100 text-amber-800',
		quote_sent: 'bg-purple-100 text-purple-800',
		confirmed: 'bg-green-100 text-green-800',
		lost: 'bg-red-100 text-red-800'
	};

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function hrefWith(params: Record<string, string>): string {
		const search = new URLSearchParams();
		const current: Record<string, string> = {
			type: data.inquiryType,
			status: data.status
		};
		for (const [key, value] of Object.entries({ ...current, ...params })) {
			if (value) search.set(key, value);
		}
		const query = search.toString();
		return query ? `/admin/demandes?${query}` : '/admin/demandes';
	}
</script>

<svelte:head>
	<title>Demandes — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-foreground">Demandes</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Tous les messages du formulaire de contact, du plus récent au plus ancien.
		</p>
	</div>

	<!-- Filters -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<form action="/admin/demandes" method="get" class="flex flex-col sm:flex-row gap-4">
			<div class="flex-1">
				<label for="{uid}-type" class="block text-sm font-medium text-foreground-alt mb-1">Type</label>
				<select
					id="{uid}-type"
					name="type"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				>
					<option value="">Tous les types</option>
					{#each Object.entries(typeLabels) as [value, label] (value)}
						<option value={value} selected={data.inquiryType === value}>{label}</option>
					{/each}
				</select>
			</div>
			<div class="flex-1">
				<label for="{uid}-status" class="block text-sm font-medium text-foreground-alt mb-1">Statut</label>
				<select
					id="{uid}-status"
					name="status"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				>
					<option value="">Tous les statuts</option>
					{#each Object.entries(statusLabels) as [value, label] (value)}
						<option value={value} selected={data.status === value}>{label}</option>
					{/each}
				</select>
			</div>
			<div class="flex items-end">
				<button type="submit" class="px-4 py-2 border border-border-input rounded-lg text-sm text-foreground hover:bg-muted">
					Appliquer
				</button>
			</div>
		</form>
		<p class="mt-3 text-sm text-muted-foreground">
			{data.demandes.length} demande{data.demandes.length > 1 ? 's' : ''}
		</p>
	</div>

	{#if data.demandes.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<Inbox size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">Aucune demande</h3>
			<p class="text-muted-foreground">Aucun message ne correspond à ces filtres.</p>
		</div>
	{:else}
		<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-muted border-b border-border-card">
						<tr>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Reçu le</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Expéditeur</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Type</th>
							<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Statut</th>
							<th class="px-6 py-4"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border-card">
						{#each data.demandes as demande (demande.id)}
							<tr class="hover:bg-muted/50">
								<td class="px-6 py-4 text-sm text-foreground">{formatDate(demande.createdAt)}</td>
								<td class="px-6 py-4">
									<p class="text-sm font-medium text-foreground">{demande.name}</p>
									<p class="text-xs text-muted-foreground">{demande.email}</p>
								</td>
								<td class="px-6 py-4 text-sm text-foreground-alt">{typeLabels[demande.inquiryType] ?? demande.inquiryType}</td>
								<td class="px-6 py-4">
									<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {statusClasses[demande.status] ?? ''}">
										{statusLabels[demande.status] ?? demande.status}
									</span>
								</td>
								<td class="px-6 py-4 text-right">
									<a href="/admin/demandes/{demande.id}" class="inline-flex items-center gap-1 text-sm text-foreground-alt hover:text-foreground">
										Voir <ChevronRight size={14} />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Card list for mobile -->
		<div class="lg:hidden grid gap-4">
			{#each data.demandes as demande (demande.id)}
				<a
					href="/admin/demandes/{demande.id}"
					class="block bg-background rounded-lg border border-border-card p-4 hover:bg-muted/50"
				>
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-sm font-medium text-foreground">{demande.name}</p>
							<p class="text-xs text-muted-foreground">{demande.email}</p>
						</div>
						<span class="inline-flex shrink-0 px-2 py-1 text-xs font-semibold rounded-full {statusClasses[demande.status] ?? ''}">
							{statusLabels[demande.status] ?? demande.status}
						</span>
					</div>
					<div class="mt-2 flex items-center justify-between gap-2">
						<span class="text-xs text-foreground-alt">{typeLabels[demande.inquiryType] ?? demande.inquiryType}</span>
						<span class="text-xs text-muted-foreground">{formatDate(demande.createdAt)}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
