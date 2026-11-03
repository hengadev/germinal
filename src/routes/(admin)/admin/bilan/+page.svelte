<script lang="ts">
	import { Download } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { AveragesCell, EventBilanSummary } from '$lib/utils/bilan';
	import { formatCurrency } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();

	const periods: { value: '3m' | '12m' | 'tout'; label: string }[] = [
		{ value: '3m', label: '3 mois' },
		{ value: '12m', label: '12 mois' },
		{ value: 'tout', label: 'Tout' }
	];

	const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

	function percent(rate: number | null): string {
		if (rate === null) return '—';
		return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(rate);
	}

	function formatDate(date: string | Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function money(amount: number, currency: string): string {
		return formatCurrency(amount, currency, 'fr-FR');
	}

	// The totals row: sums over the listed Events, money per currency.
	const totals = $derived(
		data.events.reduce<EventBilanSummary & { money: Record<string, number> }>(
			(acc, event) => {
				acc.booked += event.summary.booked;
				acc.arrived += event.summary.arrived;
				acc.noShows += event.summary.noShows;
				acc.walkInGuests += event.summary.walkInGuests;
				acc.compGuests += event.summary.compGuests;
				if (event.summary.capacity !== null) {
					acc.capacity = (acc.capacity ?? 0) + event.summary.capacity;
				}
				for (const m of event.money) {
					acc.money[m.currency] = (acc.money[m.currency] ?? 0) + m.depositsKept - m.refunds + m.balancesCollected;
				}
				return acc;
			},
			{
				booked: 0,
				arrived: 0,
				noShows: 0,
				walkInGuests: 0,
				compGuests: 0,
				capacity: null,
				fillRate: null,
				noShowRate: null,
				money: {}
			}
		)
	);
	const totalFillRate = $derived(
		totals.capacity !== null && totals.capacity > 0 ? totals.arrived / totals.capacity : null
	);
	const totalNoShowRate = $derived(totals.booked > 0 ? totals.noShows / totals.booked : null);

	const lunchCells = $derived(data.averages.filter((c) => c.kind === 'lunch'));
	const dinnerCells = $derived(data.averages.filter((c) => c.kind === 'dinner'));
</script>

<svelte:head>
	<title>Bilan — Admin</title>
</svelte:head>

<div class="px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-foreground">Bilan</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Les événements terminés : fréquentation, no-shows et argent, du plus récent au plus ancien.
			</p>
		</div>
		<a
			href="/admin/export/bilan?periode={data.periode}"
			class="inline-flex items-center gap-1 text-sm text-foreground-alt hover:text-foreground"
		>
			<Download size={14} /> Exporter (CSV)
		</a>
	</div>

	<!-- Filtre de période -->
	<div class="flex gap-2 mb-6">
		{#each periods as p (p.value)}
			<a
				href="/admin/bilan?periode={p.value}"
				class="px-3 py-1.5 rounded-lg border text-sm transition-colors {data.periode === p.value
					? 'bg-foreground text-background border-foreground font-medium'
					: 'bg-background text-foreground-alt border-border-card hover:bg-muted'}"
			>
				{p.label}
			</a>
		{/each}
	</div>

	<!-- Tableau des événements -->
	<div class="bg-background rounded-lg border border-border-card overflow-hidden mb-6">
		<div class="overflow-x-auto">
			<table class="w-full text-sm tabular-nums">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Événement</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Réservés</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Arrivés</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">No-shows</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Walk-ins</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Invitations</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Capacité</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Remplissage</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">No-show</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider whitespace-nowrap">Argent</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.events as event (event.id)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-4 py-3">
								<a href="/admin/events/{event.id}#bilan" class="font-medium text-foreground hover:underline">
									{event.titleFr}
								</a>
								<div class="text-xs text-muted-foreground">Terminé le {formatDate(event.lastSeatingEnd)}</div>
							</td>
							<td class="px-4 py-3 text-right text-foreground">{event.summary.booked}</td>
							<td class="px-4 py-3 text-right text-foreground">{event.summary.arrived}</td>
							<td class="px-4 py-3 text-right text-foreground">{event.summary.noShows}</td>
							<td class="px-4 py-3 text-right text-foreground-alt">{event.summary.walkInGuests}</td>
							<td class="px-4 py-3 text-right text-foreground-alt">{event.summary.compGuests}</td>
							<td class="px-4 py-3 text-right text-foreground-alt">{event.summary.capacity ?? '—'}</td>
							<td class="px-4 py-3 text-right text-foreground">{percent(event.summary.fillRate)}</td>
							<td class="px-4 py-3 text-right text-foreground">{percent(event.summary.noShowRate)}</td>
							<td class="px-4 py-3 text-right text-foreground whitespace-nowrap">
								{#if event.money.length > 0}
									{#each event.money as m (m.currency)}
										<div>{money(m.depositsKept - m.refunds + m.balancesCollected, m.currency)}</div>
									{/each}
								{:else}
									—
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="10" class="px-4 py-8 text-center text-sm text-muted-foreground">
								Aucun événement terminé sur cette période.
							</td>
						</tr>
					{/each}
				</tbody>
				{#if data.events.length > 0}
					<tfoot class="border-t border-border-card bg-muted">
						<tr class="font-bold text-foreground">
							<td class="px-4 py-3">Total</td>
							<td class="px-4 py-3 text-right">{totals.booked}</td>
							<td class="px-4 py-3 text-right">{totals.arrived}</td>
							<td class="px-4 py-3 text-right">{totals.noShows}</td>
							<td class="px-4 py-3 text-right">{totals.walkInGuests}</td>
							<td class="px-4 py-3 text-right">{totals.compGuests}</td>
							<td class="px-4 py-3 text-right">{totals.capacity ?? '—'}</td>
							<td class="px-4 py-3 text-right">{percent(totalFillRate)}</td>
							<td class="px-4 py-3 text-right">{percent(totalNoShowRate)}</td>
							<td class="px-4 py-3 text-right whitespace-nowrap">
								{#each Object.entries(totals.money) as [currency, amount] (currency)}
									<div>{money(amount, currency)}</div>
								{/each}
							</td>
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>
	</div>

	<!-- Moyennes : Service × jour de la semaine -->
	<div class="bg-background rounded-lg border border-border-card overflow-hidden">
		<div class="px-6 py-4 border-b border-border-card">
			<h2 class="text-base font-semibold text-foreground">Moyennes</h2>
			<p class="text-sm text-muted-foreground">
				Taux de no-show et Walk-ins par Service et jour de la semaine, pondérés par les personnes.
				Une case reste vide sous 3 séances.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm tabular-nums">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Service</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Jour</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Séances</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">No-show</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Walk-ins / séance</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each [{ kind: 'lunch', label: 'Déjeuner', cells: lunchCells }, { kind: 'dinner', label: 'Dîner', cells: dinnerCells }] as service (service.kind)}
						{#each service.cells as cell (cell.kind + cell.weekday)}
							<tr class="hover:bg-muted transition-colors">
								<td class="px-4 py-3 text-foreground-alt">{service.label}</td>
								<td class="px-4 py-3 text-foreground">{WEEKDAYS[cell.weekday]}</td>
								<td class="px-4 py-3 text-right text-foreground-alt">{cell.seatings}</td>
								<td class="px-4 py-3 text-right text-foreground">{cell.noShowRate === null ? '' : percent(cell.noShowRate)}</td>
								<td class="px-4 py-3 text-right text-foreground">{cell.walkInsPerSeating === null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(cell.walkInsPerSeating)}</td>
							</tr>
						{:else}
							<tr>
								<td class="px-4 py-4 text-sm text-muted-foreground" colspan="5">
									Pas de {service.label.toLowerCase()} terminé sur cette période.
								</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
