<script lang="ts">
	/**
	 * « Bilan » (issue 057): the Event's attendance table (moved from the
	 * Réservations tab, issue 024) and its money per currency. Read-only:
	 * no form, nothing for the editor to save. Provisional before the
	 * Event is over, final after.
	 */
	import { Clock, BadgeCheck, Undo2, Wallet } from 'lucide-svelte';
	import { formatCurrency } from '$lib/utils/currency';

	interface AttendanceCategory {
		parties: number;
		guests: number;
	}
	interface SeatingAttendanceRow {
		id: string;
		startTime: string;
		booked: number;
		arrived: number;
		noShows: number;
		walkIns: AttendanceCategory;
		comps: AttendanceCategory;
	}
	interface CurrencyMoney {
		currency: string;
		depositsKept: number;
		refunds: number;
		balancesCollected: number;
	}
	interface Props {
		data: {
			event: any;
			attendance?: {
				days: {
					date: string;
					services: {
						kind: 'lunch' | 'dinner';
						seatings: SeatingAttendanceRow[];
					}[];
				}[];
				totals: {
					booked: number;
					arrived: number;
					noShows: number;
					walkIns: AttendanceCategory;
					comps: AttendanceCategory;
				};
			} | null;
			over?: boolean;
			money?: CurrencyMoney[];
		};
	}

	let { data }: Props = $props();

	function formatDayDate(date: string): string {
		return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function formatSeatingTime(startTime: string): string {
		return new Date(startTime).toLocaleTimeString('fr-FR', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: data.event?.timeZone
		});
	}

	function money(amount: number, currency: string): string {
		return formatCurrency(amount, currency, 'fr-FR');
	}
</script>

<!-- L'état des comptes : provisoire tant que l'événement n'est pas terminé -->
{#if data.over}
	<div class="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
		<BadgeCheck size={16} class="text-foreground-alt shrink-0" />
		Événement terminé : les comptes ci-dessous sont définitifs.</div>
{:else}
	<div class="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
		<Clock size={16} class="shrink-0" />
		L'événement n'est pas encore terminé : les comptes ci-dessous sont provisoires.</div>
{/if}

<!-- Fréquentation (issue 024), désormais dans le Bilan -->
{#if data.attendance && data.attendance.days.length > 0}
	<div class="bg-background rounded-lg border border-border-card overflow-hidden mb-6">
		<div class="px-6 py-4 border-b border-border-card">
			<h3 class="text-base font-semibold text-foreground">Fréquentation</h3>
			<p class="text-sm text-muted-foreground">Comptes par Séance. Walk-ins et Invitations : tables · personnes.</p>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm tabular-nums">
				<thead class="bg-muted border-b border-border-card">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Jour</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Service</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider">Séance</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Réservés</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Arrivés</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">No-shows</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Walk-ins</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider">Invitations</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.attendance.days as day (day.date)}
						{@const daySeatingCount = day.services.reduce((n, s) => n + s.seatings.length, 0)}
						{#each day.services as service, serviceIndex (service.kind)}
							{#each service.seatings as seating, seatingIndex (seating.id)}
								<tr class="hover:bg-muted transition-colors">
									{#if serviceIndex === 0 && seatingIndex === 0}
										<td rowspan={daySeatingCount} class="px-4 py-3 align-top font-medium text-foreground first-letter:uppercase">{formatDayDate(day.date)}</td>
									{/if}
									{#if seatingIndex === 0}
										<td rowspan={service.seatings.length} class="px-4 py-3 align-top text-foreground-alt">{service.kind === 'lunch' ? 'Déjeuner' : 'Dîner'}</td>
									{/if}
									<td class="px-4 py-3 text-foreground-alt">{formatSeatingTime(seating.startTime)}</td>
									<td class="px-4 py-3 text-right text-foreground">{seating.booked}</td>
									<td class="px-4 py-3 text-right text-foreground">{seating.arrived}</td>
									<td class="px-4 py-3 text-right text-foreground">{seating.noShows}</td>
									<td class="px-4 py-3 text-right text-foreground-alt whitespace-nowrap">{seating.walkIns.parties} · {seating.walkIns.guests}</td>
									<td class="px-4 py-3 text-right text-foreground-alt whitespace-nowrap">{seating.comps.parties} · {seating.comps.guests}</td>
								</tr>
							{/each}
						{/each}
					{/each}
				</tbody>
				<tfoot class="border-t border-border-card bg-muted">
					<tr class="font-bold text-foreground">
						<td colspan="3" class="px-4 py-3">Total événement</td>
						<td class="px-4 py-3 text-right">{data.attendance.totals.booked}</td>
						<td class="px-4 py-3 text-right">{data.attendance.totals.arrived}</td>
						<td class="px-4 py-3 text-right">{data.attendance.totals.noShows}</td>
						<td class="px-4 py-3 text-right whitespace-nowrap">{data.attendance.totals.walkIns.parties} · {data.attendance.totals.walkIns.guests}</td>
						<td class="px-4 py-3 text-right whitespace-nowrap">{data.attendance.totals.comps.parties} · {data.attendance.totals.comps.guests}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	</div>
{:else}
	<p class="text-sm text-muted-foreground mb-6">Aucune Séance : pas de fréquentation à compter.</p>
{/if}

<!-- Argent (issue 057) : par devise -->
<div class="bg-background rounded-lg border border-border-card overflow-hidden">
	<div class="px-6 py-4 border-b border-border-card">
		<h3 class="text-base font-semibold text-foreground">Argent</h3>
		<p class="text-sm text-muted-foreground">Acomptes conservés, remboursements et Soldes encaissés, par devise.</p>
	</div>
	{#if data.money && data.money.length > 0}
		<div class="divide-y divide-border-card">
			{#each data.money as m (m.currency)}
				<div class="px-6 py-4">
					<h4 class="text-sm font-semibold text-foreground mb-3">{m.currency}</h4>
					<dl class="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div class="rounded-lg border border-border-card p-3">
							<dt class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Wallet size={13} class="shrink-0" /> Acomptes conservés</dt>
							<dd class="text-base font-semibold text-foreground tabular-nums">{money(m.depositsKept, m.currency)}</dd>
						</div>
						<div class="rounded-lg border border-border-card p-3">
							<dt class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Undo2 size={13} class="shrink-0" /> Remboursements</dt>
							<dd class="text-base font-semibold text-foreground tabular-nums">{money(m.refunds, m.currency)}</dd>
						</div>
						<div class="rounded-lg border border-border-card p-3">
							<dt class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><BadgeCheck size={13} class="shrink-0" /> Soldes encaissés</dt>
							<dd class="text-base font-semibold text-foreground tabular-nums">{money(m.balancesCollected, m.currency)}</dd>
						</div>
					</dl>
				</div>
			{/each}
		</div>
	{:else}
		<p class="px-6 py-4 text-sm text-muted-foreground">Aucun paiement ni Solde encaissé pour l'instant.</p>
	{/if}
</div>
