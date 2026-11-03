<script lang="ts">
	import { ArrowLeft, CheckCircle } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uid = $props.id();

	const typeLabels: Record<string, string> = {
		collaboration: 'Collaboration',
		new_project: 'Nouveau projet',
		join_roster: 'Rejoindre la liste',
		private_event: 'Privatisation',
		other: 'Autre'
	};

	const statusOptions = [
		{ value: 'new', label: 'Nouvelle' },
		{ value: 'discussing', label: 'En discussion' },
		{ value: 'quote_sent', label: 'Devis envoyé' },
		{ value: 'confirmed', label: 'Confirmée' },
		{ value: 'lost', label: 'Perdue' }
	];

	const demande = $derived(form?.demande ?? data.demande);

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Demande — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<a
		href="/admin/demandes"
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
	>
		<ArrowLeft size={14} /> Toutes les demandes
	</a>

	<div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold text-foreground">{demande.name}</h1>
			<p class="text-sm text-muted-foreground mt-1">
				<a href="mailto:{demande.email}" class="text-foreground-alt hover:text-foreground">{demande.email}</a>
				{#if demande.company}
					— {demande.company}
				{/if}
			</p>
		</div>
		<p class="text-sm text-muted-foreground">{formatDate(demande.createdAt)}</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
		<div class="grid gap-6">
			<div class="bg-background rounded-lg border border-border-card p-4 sm:p-6">
				<h2 class="text-sm font-semibold text-foreground-alt uppercase tracking-wider mb-3">Message</h2>
				<p class="text-sm text-foreground whitespace-pre-wrap">{demande.message}</p>
				<p class="mt-4 text-xs text-muted-foreground">
					Type : {typeLabels[demande.inquiryType] ?? demande.inquiryType}
				</p>
			</div>

			{#if demande.inquiryType === 'private_event'}
				<div class="bg-background rounded-lg border border-border-card p-4 sm:p-6">
					<h2 class="text-sm font-semibold text-foreground-alt uppercase tracking-wider mb-3">Privatisation</h2>
					<dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
						<div>
							<dt class="text-muted-foreground">Occasion</dt>
							<dd class="text-foreground">{demande.occasion ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">Dates souhaitées</dt>
							<dd class="text-foreground">{demande.preferredDates ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">Nombre d’invités</dt>
							<dd class="text-foreground">{demande.guestCount ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">Budget</dt>
							<dd class="text-foreground">{demande.budget ?? '—'}</dd>
						</div>
					</dl>
				</div>
			{/if}
		</div>

		<div class="grid gap-6 content-start">
			<form
				method="POST"
				class="bg-background rounded-lg border border-border-card p-4 sm:p-6 grid gap-4"
				use:enhance={() => async ({ update }) => update({ reset: false })}
			>
				<div>
					<label for="{uid}-status" class="block text-sm font-medium text-foreground-alt mb-1">Statut</label>
					<select
						id="{uid}-status"
						name="status"
						class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					>
						{#each statusOptions as option (option.value)}
							<option value={option.value} selected={demande.status === option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="{uid}-adminNote" class="block text-sm font-medium text-foreground-alt mb-1">Note privée</label>
					<textarea
						id="{uid}-adminNote"
						name="adminNote"
						rows="5"
						placeholder="Note interne, jamais visible par le visiteur…"
						class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
					>{demande.adminNote ?? ''}</textarea>
				</div>
				<div class="flex items-center gap-3">
					<button
						type="submit"
						class="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
					>
						Enregistrer
					</button>
					{#if form?.success}
						<span class="inline-flex items-center gap-1 text-sm text-green-700">
							<CheckCircle size={16} /> Enregistré
						</span>
					{:else if form?.error}
						<span class="text-sm text-red-600">{form.error}</span>
					{/if}
				</div>
			</form>
		</div>
	</div>
</div>
