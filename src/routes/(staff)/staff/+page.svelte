<script lang="ts">
	import { CalendarDays } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function titleOf(event: { titleFr: string | null; titleEn: string | null }): string {
		return event.titleFr || event.titleEn || 'Événement sans titre';
	}

	function formatDay(day: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
		}).format(new Date(`${day}T12:00:00Z`));
	}

	function formatRange(startDate: string | null, endDate: string | null): string {
		if (!startDate) return '';
		const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
		const start = fmt.format(new Date(startDate));
		if (!endDate || startDate === endDate) return start;
		return `${start} – ${fmt.format(new Date(endDate))}`;
	}
</script>

<svelte:head>
	<title>Mes événements | Portail Staff</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-2xl lg:text-3xl font-bold text-foreground">Mes événements</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Les événements auxquels vous êtes affecté·e, à venir puis passés.
		</p>
	</div>

	{#if data.assignments.length === 0}
		<div class="bg-background border border-border-card rounded-lg p-8 text-center">
			<p class="text-muted-foreground">Aucun événement pour le moment.</p>
		</div>
	{:else}
		<div class="bg-background border border-border-card rounded-lg divide-y divide-border-card">
			{#each data.assignments as item (item.event.id)}
				<a
					href="/staff/events/{item.event.id}"
					class="block p-6 hover:bg-muted/50 transition-colors"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1 min-w-0">
							<h2 class="text-base font-semibold text-foreground truncate">
								{titleOf(item.event)}
							</h2>
							{#if item.staffRoleName}
								<p class="text-sm text-muted-foreground mt-1">
									<span class="font-medium">Rôle :</span> {item.staffRoleName}
								</p>
							{/if}
							{#if item.event.startDate}
								<p class="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
									<CalendarDays size={14} />
									{formatRange(
										item.event.startDate.toISOString(),
										item.event.endDate?.toISOString() ?? item.event.startDate.toISOString()
									)}
								</p>
							{/if}
							{#if item.days.length > 0}
								<p class="text-sm text-muted-foreground mt-1">
									{item.days.length} jour{item.days.length > 1 ? 's' : ''}
									– {formatDay(item.days[0])}
									{#if item.days.length > 1}
										→ {formatDay(item.days[item.days.length - 1])}
									{/if}
								</p>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
