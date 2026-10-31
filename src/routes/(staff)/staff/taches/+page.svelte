<script lang="ts">
	import { enhance } from '$app/forms';
	import { CheckCircle2, Circle, Clock } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	// « À faire » (default) hides finished Tasks; « Toutes » shows everything.
	let showAll = $state(false);

	const visibleGroups = $derived(
		data.groups.map((group) => ({
			...group,
			tasks: showAll ? group.tasks : group.tasks.filter((t) => t.status !== 'done'),
		})).filter((group) => group.tasks.length > 0)
	);

	const TASK_STATUS_LABELS: Record<string, string> = {
		pending: 'À faire',
		in_progress: 'En cours',
		done: 'Terminée',
	};

	function titleOf(event: { titleFr: string | null; titleEn: string | null }): string {
		return event.titleFr || event.titleEn || 'Événement sans titre';
	}

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
	<title>Mes tâches | Portail Staff</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-6">
		<h1 class="text-2xl lg:text-3xl font-bold text-foreground">Mes tâches</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Vos tâches, groupées par événement : le jour en cours d'abord.
		</p>
	</div>

	<!-- Filtre : À faire / Toutes -->
	<div class="mb-6 flex gap-2" role="group" aria-label="Filtrer les tâches">
		<button
			type="button"
			onclick={() => (showAll = false)}
			aria-pressed={!showAll}
			class="min-h-[44px] px-4 text-sm font-medium rounded-lg border transition-colors {!showAll
				? 'bg-foreground text-background border-foreground'
				: 'bg-background text-foreground-alt border-border-card hover:text-foreground'}"
		>
			À faire
		</button>
		<button
			type="button"
			onclick={() => (showAll = true)}
			aria-pressed={showAll}
			class="min-h-[44px] px-4 text-sm font-medium rounded-lg border transition-colors {showAll
				? 'bg-foreground text-background border-foreground'
				: 'bg-background text-foreground-alt border-border-card hover:text-foreground'}"
		>
			Toutes
		</button>
	</div>

	{#if visibleGroups.length === 0}
		<div class="bg-background border border-border-card rounded-lg p-8 text-center">
			<p class="text-muted-foreground">Aucune tâche à faire.</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#each visibleGroups as group (group.event.id)}
				<section aria-label={titleOf(group.event)}>
					<h2 class="text-base font-semibold text-foreground mb-2">
						<a
							href="/staff/events/{group.event.id}"
							class="hover:underline decoration-foreground/40"
						>
							{titleOf(group.event)}
						</a>
					</h2>
					<div class="bg-background border border-border-card rounded-lg divide-y divide-border-card">
						{#each group.tasks as task (task.id)}
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
										class="min-h-[44px] px-3 py-2 text-sm border border-border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
				</section>
			{/each}
		</div>
	{/if}
</div>
