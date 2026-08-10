<script lang="ts">
	import { ScrollText, XCircle, Calendar, CalendarX, RotateCcw, Settings2 } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Human-readable label + icon for each tracked action type.
	function getActionInfo(action: string) {
		switch (action) {
			case 'reservation.cancel':
				return { text: 'Réservation annulée', class: 'bg-red-50 text-red-700', icon: CalendarX };
			case 'reservation.refund':
				return { text: 'Remboursement traité', class: 'bg-orange-50 text-orange-700', icon: RotateCcw };
			case 'event.delete':
				return { text: 'Événement supprimé', class: 'bg-red-50 text-red-700', icon: XCircle };
			case 'session.delete':
				return { text: 'Séance supprimée', class: 'bg-red-50 text-red-700', icon: Calendar };
			case 'talent.delete':
				return { text: 'Talent supprimé', class: 'bg-red-50 text-red-700', icon: XCircle };
			case 'settings.update':
				return { text: 'Paramètres modifiés', class: 'bg-blue-50 text-blue-700', icon: Settings2 };
			default:
				return { text: action, class: 'bg-muted text-foreground-alt', icon: ScrollText };
		}
	}

	function formatEntity(entityType: string) {
		switch (entityType) {
			case 'reservation':
				return 'Réservation';
			case 'event':
				return 'Événement';
			case 'session':
				return 'Séance';
			case 'talent':
				return 'Talent';
			case 'settings':
				return 'Paramètres';
			default:
				return entityType;
		}
	}

	function formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Journal d'Audit | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Journal d'Audit</h1>
		<p class="text-muted-foreground">
			Historique chronologique des actions administratives sensibles (annulations, remboursements, suppressions, modifications de paramètres)
		</p>
	</div>

	{#if data.entries.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<ScrollText size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">
				Aucune entrée d'audit
			</h3>
			<p class="text-muted-foreground">
				Les actions sensibles effectuées par les administrateurs apparaîtront ici.
			</p>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Action
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Entité
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Administrateur
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">
							Date
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.entries as entry (entry.id)}
						{@const actionInfo = getActionInfo(entry.action)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-6 py-4">
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {actionInfo.class} rounded-full">
									<svelte:component this={actionInfo.icon} size={12} />
									{actionInfo.text}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-foreground">{formatEntity(entry.entityType)}</div>
								{#if entry.entityId}
									<div class="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={entry.entityId}>
										{entry.entityId}
									</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-foreground">{entry.admin?.email ?? 'Administrateur supprimé'}</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-foreground-alt">
									{formatDateTime(entry.createdAt)}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.entries as entry (entry.id)}
				{@const actionInfo = getActionInfo(entry.action)}
				<div class="bg-background rounded-lg border border-border-card p-4">
					<div class="flex items-start justify-between mb-3">
						<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {actionInfo.class} rounded-full">
							<svelte:component this={actionInfo.icon} size={10} />
							{actionInfo.text}
						</span>
						<div class="text-xs text-muted-foreground">
							{formatDateTime(entry.createdAt)}
						</div>
					</div>
					<div class="space-y-2">
						<div>
							<div class="text-xs text-muted-foreground">Entité</div>
							<div class="text-sm font-medium text-foreground">{formatEntity(entry.entityType)}</div>
							{#if entry.entityId}
								<div class="text-xs text-muted-foreground font-mono truncate">{entry.entityId}</div>
							{/if}
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Administrateur</div>
							<div class="text-sm text-foreground">{entry.admin?.email ?? 'Administrateur supprimé'}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
