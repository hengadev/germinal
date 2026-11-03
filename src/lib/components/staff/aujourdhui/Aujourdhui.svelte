<script lang="ts">
	/**
	 * « Aujourd'hui » (issue 056) : le Jour en cours en chiffres — attendus,
	 * arrivés, à venir, No-shows des séances terminées, Walk-ins, invitations
	 * et places restantes, par séance et par service, totaux du Jour en tête.
	 * Aucune donnée nominative : des compteurs seulement. L'onglet se
	 * rafraîchit toutes les 30 secondes tant qu'il est visible et que la
	 * page est au premier plan.
	 */
	import { invalidate } from '$app/navigation';

	type Seating = {
		id: string;
		startTime: string;
		endTime: string;
		booked: number;
		arrived: number;
		stillToCome: number;
		noShows: number;
		ended: boolean;
		walkIns: { parties: number; guests: number };
		comps: { parties: number; guests: number };
		totalCapacity: number | null;
		seatsLeft: number | null;
	};
	type Service = { kind: 'lunch' | 'dinner'; seatings: Seating[]; totals: Totals };
	type Totals = {
		booked: number;
		arrived: number;
		stillToCome: number;
		noShows: number;
		walkIns: { parties: number; guests: number };
		comps: { parties: number; guests: number };
	};

	let {
		attendance,
		timeZone
	}: { attendance: { date: string; services: Service[]; totals: Totals }; timeZone: string } =
		$props();

	// Toutes les 30 secondes, et seulement au premier plan : l'onglet
	// visible se rafraîchit, jamais la page cachée.
	$effect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) invalidate('staff:aujourdhui');
		}, 30_000);
		return () => clearInterval(timer);
	});

	/** « 12 h 00 », sur l'horloge de l'événement. */
	function timeLabel(iso: string): string {
		const parts = new Intl.DateTimeFormat('fr-FR', {
			hour: 'numeric',
			minute: '2-digit',
			hourCycle: 'h23',
			timeZone
		}).formatToParts(new Date(iso));
		const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
		const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
		return `${Number(hour)} h ${minute}`;
	}

	const serviceLabel = (kind: 'lunch' | 'dinner') => (kind === 'lunch' ? 'Déjeuner' : 'Dîner');
</script>

<!-- Walk-ins and Invitations: the guests, then how many groups, small. -->
{#snippet category(c: { parties: number; guests: number })}
	{c.guests}{#if c.parties > 0}<span class="ml-1 text-xs font-normal text-muted-foreground"
			>({c.parties} {c.parties === 1 ? 'groupe' : 'groupes'})</span
		>{/if}
{/snippet}

<div class="space-y-4">
	<!-- Totaux du Jour -->
	<section aria-label="Totaux du jour" class="rounded-lg border border-border-card bg-background p-4">
		<h2 class="text-sm font-semibold text-foreground">Totaux du jour</h2>
		<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm tabular-nums sm:grid-cols-3">
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Attendus</dt><dd class="whitespace-nowrap font-semibold text-foreground">{attendance.totals.booked}</dd></div>
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Arrivés</dt><dd class="whitespace-nowrap font-semibold text-foreground">{attendance.totals.arrived}</dd></div>
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">À venir</dt><dd class="whitespace-nowrap font-semibold text-foreground">{attendance.totals.stillToCome}</dd></div>
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">No-shows</dt><dd class="whitespace-nowrap font-semibold text-foreground">{attendance.totals.noShows}</dd></div>
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Walk-ins</dt><dd class="whitespace-nowrap font-semibold text-foreground">{@render category(attendance.totals.walkIns)}</dd></div>
			<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Invitations</dt><dd class="whitespace-nowrap font-semibold text-foreground">{@render category(attendance.totals.comps)}</dd></div>
		</dl>
	</section>

	{#if attendance.services.length === 0}
		<div class="rounded-lg border border-border-card bg-background p-8 text-center">
			<p class="text-muted-foreground">Aucun service ce jour.</p>
		</div>
	{/if}

	{#each attendance.services as service (service.kind)}
		<section
			aria-label="{serviceLabel(service.kind)} : totaux"
			class="rounded-lg border border-border-card bg-background p-4"
		>
			<h2 class="text-sm font-semibold text-foreground">
				{serviceLabel(service.kind)}
				<span class="font-normal text-muted-foreground tabular-nums">
					· {service.totals.booked} attendus, {service.totals.arrived} arrivés, {service.totals.stillToCome} à venir
				</span>
			</h2>
			<ul class="mt-3 space-y-3">
				{#each service.seatings as seating (seating.id)}
					<li class="rounded-lg border border-border-card bg-background px-3 py-2.5">
						<div class="flex items-baseline justify-between gap-2">
							<p class="text-sm font-semibold text-foreground">
								{timeLabel(seating.startTime)}
								{#if seating.ended}<span class="ml-1 font-normal text-muted-foreground">terminée</span>{/if}
							</p>
							{#if seating.seatsLeft !== null}
								<p class="text-sm font-semibold tabular-nums {seating.seatsLeft < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}">
									{seating.seatsLeft}
									place{Math.abs(seating.seatsLeft) > 1 ? 's' : ''} restante{Math.abs(seating.seatsLeft) > 1 ? 's' : ''}
								</p>
							{/if}
						</div>
						<dl class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
							<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Attendus</dt><dd class="whitespace-nowrap font-medium text-foreground">{seating.booked}</dd></div>
							<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Arrivés</dt><dd class="whitespace-nowrap font-medium text-foreground">{seating.arrived}</dd></div>
							<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">À venir</dt><dd class="whitespace-nowrap font-medium text-foreground">{seating.stillToCome}</dd></div>
							{#if seating.ended}
								<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">No-shows</dt><dd class="whitespace-nowrap font-medium text-foreground">{seating.noShows}</dd></div>
							{/if}
							<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Walk-ins</dt><dd class="whitespace-nowrap font-medium text-foreground">{@render category(seating.walkIns)}</dd></div>
							<div class="flex justify-between gap-2"><dt class="whitespace-nowrap text-muted-foreground">Invitations</dt><dd class="whitespace-nowrap font-medium text-foreground">{@render category(seating.comps)}</dd></div>
						</dl>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
