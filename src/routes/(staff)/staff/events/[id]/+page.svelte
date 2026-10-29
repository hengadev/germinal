<script lang="ts">
	import { enhance } from '$app/forms';
	import { CheckCircle2, Circle, Clock } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { STAFF_PERMISSION_LABELS_FR } from '$lib/staff/permissions';
	import Arrivees from '$lib/components/staff/arrivees/Arrivees.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	// At the door, Arrivées comes first; it only exists during a Day.
	let activeTab = $state<'tasks' | 'arrivees'>(data.access.canArrivees ? 'arrivees' : 'tasks');

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

	const TASK_STATUS_LABELS: Record<string, string> = {
		pending: 'À faire',
		in_progress: 'En cours',
		done: 'Terminée',
	};

	function statusBadge(status: string) {
		switch (status) {
			case 'done':
				return { class: 'bg-green-100 text-green-800', icon: CheckCircle2 };
			case 'in_progress':
				return { class: 'bg-blue-100 text-blue-800', icon: Clock };
			default:
				return { class: 'bg-muted text-foreground-alt', icon: Circle };
		}
	}

	function updateStatusEnhance() {
		return ({ formElement }: { formElement: HTMLFormElement }) =>
			async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: () => Promise<void> }) => {
				// Refresh the list so the badge shows the new status.
				await update();
				if (result.type === 'success') {
					toast.success('Succès', 'Statut de la tâche mis à jour');
				} else if (result.type === 'failure') {
					toast.error(
						'Erreur',
						(result.data as { error?: string })?.error ?? 'Une erreur est survenue'
					);
				}
			};
	}
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
				{#if data.access.canTasks}
					<button
						type="button"
						onclick={() => (activeTab = 'tasks')}
						aria-current={activeTab === 'tasks' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'tasks'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Tâches
					</button>
				{/if}
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
			</nav>
		</div>

		<!-- Onglet Tâches -->
		{#if activeTab === 'tasks' && data.access.canTasks}
			<section aria-label="Tâches">
				{#if data.tasks.length === 0}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucune tâche ne vous est affectée sur cet événement.</p>
					</div>
				{:else}
					<div class="bg-background border border-border-card rounded-lg divide-y divide-border-card">
						{#each data.tasks as task (task.id)}
							{@const badge = statusBadge(task.status)}
							<div class="p-5 flex items-start justify-between gap-4">
								<div class="flex-1 min-w-0">
									<h3 class="text-base font-semibold text-foreground truncate">{task.title}</h3>
									{#if task.description}
										<p class="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
									{/if}
									<div class="flex items-center gap-2 mt-2">
										<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium {badge.class}">
											<svelte:component this={badge.icon} size={12} />
											{TASK_STATUS_LABELS[task.status] ?? task.status}
										</span>
									</div>
								</div>
								<form
									method="POST"
									action="?/updateTaskStatus"
									use:enhance={updateStatusEnhance()}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="taskId" value={task.id} />
									<select
										name="status"
										value={task.status}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
										class="px-3 py-2 text-sm border border-border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
										aria-label="Statut de la tâche"
									>
										<option value="pending">À faire</option>
										<option value="in_progress">En cours</option>
										<option value="done">Terminée</option>
									</select>
									<noscript><button type="submit" class="text-sm text-primary hover:underline">OK</button></noscript>
								</form>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

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
					/>
				{:else}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucun jour en cours : les invités ne sont visibles que le jour J.</p>
					</div>
				{/if}
			</section>
		{/if}

		{#if !(activeTab === 'tasks' && data.access.canTasks) && !(activeTab === 'arrivees' && data.access.canArrivees)}
			<div class="bg-background border border-border-card rounded-lg p-8 text-center">
				<p class="text-muted-foreground">
					Vos permissions :
					{data.access.permissions.map((p) => STAFF_PERMISSION_LABELS_FR[p]).join(', ')}.
					Les autres onglets arriveront prochainement.
				</p>
			</div>
		{/if}
	{/if}
</div>
