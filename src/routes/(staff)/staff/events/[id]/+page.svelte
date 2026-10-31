<script lang="ts">
	import type { PageData } from './$types';
	import Arrivees from '$lib/components/staff/arrivees/Arrivees.svelte';
import Scanner from '$lib/components/staff/scanner/Scanner.svelte';
import { page } from '$app/state';

	let { data }: { data: PageData } = $props();

	// At the door, Arrivées comes first; it only exists during a Day.
	// ?onglet=arrivees|scanner lets a link open a tab directly.
	const fromUrl = page.url.searchParams.get('onglet');
	const tabFromUrl = fromUrl === 'arrivees' || fromUrl === 'scanner' ? fromUrl : null;
	let activeTab = $state<'arrivees' | 'scanner'>(tabFromUrl ?? 'arrivees');

	const title = $derived(data.event.titleFr || data.event.titleEn || 'Événement sans titre');

	const dayLabel = $derived(
		data.access.day
			? new Intl.DateTimeFormat('fr-FR', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC',
			}).format(new Date(`${data.access.day}T12:00:00Z`))
			: null
	);
</script>

<svelte:head>
	<title>{title} | Portail Staff</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<!-- En-tête : l'événement et le jour en cours -->
	<div class="mb-6">
		<h1 class="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
		<p class="text-sm text-muted-foreground mt-1">
			{#if data.staffRoleName}
				<span class="font-medium">Rôle :</span> {data.staffRoleName} —
			{/if}
			{#if dayLabel}
				Jour en cours : <span class="font-medium capitalize">{dayLabel}</span>
			{:else}
				Aucun jour en cours aujourd'hui.
			{/if}
		</p>
	</div>

	<!-- Onglets : seulement ce que l'accès autorise -->
	{#if !data.access.permissions.length}
		<div class="bg-background border border-border-card rounded-lg p-8 text-center">
			<p class="text-muted-foreground">
				Vous n'avez aucune permission sur cet événement. Contactez l'organisateur.
			</p>
		</div>
	{:else}
		<div class="border-b border-border-card mb-6">
			<nav class="flex gap-6 -mb-px" aria-label="Sections de l'événement">
				{#if data.access.canArrivees}
					<button
						type="button"
						onclick={() => (activeTab = 'arrivees')}
						aria-current={activeTab === 'arrivees' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'arrivees'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Arrivées
					</button>
				{/if}
				{#if data.access.canScan}
					<button
						type="button"
						onclick={() => (activeTab = 'scanner')}
						aria-current={activeTab === 'scanner' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'scanner'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Scanner
					</button>
				{/if}
			</nav>
		</div>

		<!-- Onglet Arrivées -->
		{#if activeTab === 'arrivees' && data.access.canArrivees}
			<section aria-label="Arrivées">
				{#if data.arrivees}
					<Arrivees
						list={data.arrivees}
						fields={{
							guestList: data.access.permissions.includes('guest_list'),
							dietary: data.access.permissions.includes('dietary'),
							contact: data.access.permissions.includes('contact')
						}}
						timeZone={data.event.timeZone}
						canCheckIn={data.access.canManualCheckIn}
						canCorrect={data.access.canCorrect}
						canSettle={data.access.canSettle}
						canWalkIn={data.access.canWalkIn}
						canMove={data.access.canMove}
						canComp={data.access.canComp}
					/>
				{:else}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucun jour en cours : les invités ne sont visibles que le jour J.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Onglet Scanner -->
		{#if activeTab === 'scanner' && data.access.canScan}
			<section aria-label="Scanner">
				<Scanner onSearchByName={() => (activeTab = 'arrivees')} />
			</section>
		{/if}

		{#if !(activeTab === 'arrivees' && data.access.canArrivees) && !(activeTab === 'scanner' && data.access.canScan)}
			<div class="bg-background border border-border-card rounded-lg p-8 text-center">
				<p class="text-muted-foreground">
					Vos tâches sont réunies sur la page
					<a href="/staff/taches" class="text-foreground font-medium underline">Mes tâches</a>.
				</p>
			</div>
		{/if}
	{/if}
</div>
