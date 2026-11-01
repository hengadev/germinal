<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronLeft, Tag } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uid = $props.id();

	const guest = $derived(data.guest);

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function eventTitle(reservation: PageData['guest']['reservations'][number]): string {
		return reservation.eventTitleFr || reservation.eventTitleEn || '';
	}

	function formatDateTime(value: string | Date): string {
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const tagsValue = $derived((form?.tags ?? data.guest.tags ?? []).join(', '));
	const noteValue = $derived(form?.note ?? data.guest.notes?.note ?? '');

	const statusLabels: Record<string, string> = {
		confirmed: 'Confirmée',
		pending: 'En attente',
		cancelled: 'Annulée',
		expired: 'Expirée'
	};
</script>

<svelte:head>
	<title>{guest.name} — Clients — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<a href="/admin/clients" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
		<ChevronLeft size={16} /> Clients
	</a>

	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-foreground">{guest.name}</h1>
		<p class="text-sm text-muted-foreground mt-1">{guest.email}</p>
	</div>

	<!-- Totals -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
			<div>
				<dt class="text-muted-foreground">Visites</dt>
				<dd class="font-semibold text-foreground">{guest.visits}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Invités arrivés</dt>
				<dd class="font-semibold text-foreground">{guest.guestsArrived}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">No-shows</dt>
				<dd class="font-semibold text-foreground">{guest.noShows}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Montant payé</dt>
				<dd class="font-semibold text-foreground">
					{#if guest.amounts.length === 0}
						—
					{:else}
						{#each guest.amounts as amount (amount.currency)}
							<div>{formatCurrency(amount.net, amount.currency, 'fr-FR')}</div>
						{/each}
					{/if}
				</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Dernière visite</dt>
				<dd class="font-semibold text-foreground">{guest.lastVisit ? formatDate(guest.lastVisit) : '—'}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">À venir</dt>
				<dd class="font-semibold text-foreground">{guest.upcoming}</dd>
			</div>
		</dl>
		<p class="mt-3 text-xs text-muted-foreground">
			L'identité d'un client est effacée un an après sa séance : l'historique ne remonte qu'à environ un an.
		</p>
	</div>

	<!-- Private note and tags (issue 050) -->
	<div class="bg-background rounded-lg border border-border-card p-4 mb-6">
		<h2 class="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Note et tags</h2>
		<form
			method="POST"
			action="?/save"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
				};
			}}
			class="space-y-4"
		>
			{#if form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}
			<div>
				<label for="{uid}-note" class="block text-sm font-medium text-foreground-alt mb-1">Note privée</label>
				<textarea
					id="{uid}-note"
					name="note"
					rows="4"
					maxlength="2000"
					placeholder="Note visible des admins uniquement…"
					class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					>{noteValue}</textarea
				>
			</div>
			<div>
				<label for="{uid}-tags" class="block text-sm font-medium text-foreground-alt mb-1">Tags (séparés par des virgules, 5 max)</label>
				<datalist id="{uid}-tag-options">
					{#each data.tagSuggestions as tag (tag)}
						<option value={tag}></option>
					{/each}
				</datalist>
				<div class="relative">
					<Tag size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="{uid}-tags"
						type="text"
						name="tags"
						value={tagsValue}
						list="{uid}-tag-options"
						placeholder="Habitué, VIP…"
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					/>
				</div>
				{#if data.guest.tags.length > 0}
					<div class="mt-2 flex flex-wrap gap-1">
						{#each data.guest.tags as tag (tag)}
							<span class="inline-block px-2 py-0.5 rounded-full bg-muted text-xs text-foreground-alt">{tag}</span>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex items-center justify-between gap-4">
				<p class="text-xs text-muted-foreground">
					{#if data.guest.notes}
						Modifiée le {formatDateTime(data.guest.notes.updatedAt)}
						{#if data.guest.notes.updatedByEmail}par {data.guest.notes.updatedByEmail}{/if}
					{:else}
						Aucune note enregistrée
					{/if}
				</p>
				<button
					type="submit"
					class="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90"
				>
					Enregistrer
				</button>
			</div>
		</form>
	</div>

	<!-- Table view for desktop -->
	<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Événement</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Date de séance</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Convives</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Statut</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Invités arrivés</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Montant payé</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each guest.reservations as reservation (reservation.id)}
						<tr class="hover:bg-muted/50">
							<td class="px-6 py-4">
								<a href="/admin/reservations/{reservation.id}" class="font-medium text-foreground hover:underline">{eventTitle(reservation)}</a>
							</td>
							<td class="px-6 py-4 text-foreground">{formatDate(reservation.seatingStart)}</td>
							<td class="px-6 py-4 text-foreground">{reservation.quantity}</td>
							<td class="px-6 py-4 text-foreground">{statusLabels[reservation.status] ?? reservation.status}</td>
							<td class="px-6 py-4 text-foreground">{reservation.guestsArrived}</td>
							<td class="px-6 py-4 text-foreground">{formatCurrency(reservation.net, reservation.currency, 'fr-FR')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Card view for mobile -->
	<div class="lg:hidden space-y-4">
		{#each guest.reservations as reservation (reservation.id)}
			<a
				href="/admin/reservations/{reservation.id}"
				class="block bg-background rounded-lg border border-border-card p-4"
			>
				<div class="flex items-center justify-between gap-2">
					<span class="font-medium text-foreground truncate">{eventTitle(reservation)}</span>
					<span class="text-xs text-muted-foreground whitespace-nowrap">{formatDate(reservation.seatingStart)}</span>
				</div>
				<div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-foreground-alt">
					<span>Convives : {reservation.quantity}</span>
					<span>{statusLabels[reservation.status] ?? reservation.status}</span>
					<span>Arrivés : {reservation.guestsArrived}</span>
					<span>{formatCurrency(reservation.net, reservation.currency, 'fr-FR')}</span>
				</div>
			</a>
		{/each}
	</div>
</div>
