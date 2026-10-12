<script lang="ts">
	// Seatings editor (issue 020): the Event's Days → Services → Seatings.
	// Days and meals are picked in « Vue d'ensemble »; here each Service gets
	// a default Seating duration and its Seatings, typed as start times. End
	// times are filled from the duration and can be overridden per Seating.
	// Invalid times and overlapping Seatings are flagged before saving, with
	// the same helpers the server checks the payload with.
	// Capacity (issue 021): the Event's Venue Capacity is set at the top and
	// inherited by every Seating, which may override it with its own.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { AlertTriangle, CalendarDays, ChevronDown, Plus, RotateCcw, Trash2, Users } from 'lucide-svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import {
		formatTimeOfDay,
		parseTimeOfDay,
		reviewServiceSeatings,
		type SeatingReview,
	} from '$lib/utils/seating-times';
	import { derivedSeatingTitle } from '$lib/utils/seating-title';
	import type {
		EditorService,
		SeatingBadge,
		ServiceSeatingsPayload,
	} from '$lib/types/seatings-editor';

	let { data }: { data: { schedule?: EditorService[]; venueCapacity?: number | null } } = $props();

	const toast = getToastContext();

	interface DraftSeating {
		key: number;
		id: string | null;
		start: string;
		/** Typed end; only used when `endOverridden`. */
		end: string;
		endOverridden: boolean;
		titleEn: string;
		titleFr: string;
		descriptionEn: string;
		descriptionFr: string;
		/** The Seating's own capacity; only used when `capacityOverridden`,
		 * otherwise the Seating inherits the Venue Capacity. */
		capacity: number | null;
		capacityOverridden: boolean;
		published: boolean;
		allowWaitlist: boolean;
		badgeType: SeatingBadge;
		reservationCount: number;
		/** Seats held (pending, processing, confirmed) — capacity cannot go below. */
		soldSeats: number;
		detailsOpen: boolean;
	}

	interface DraftService {
		serviceId: string;
		date: string;
		kind: 'lunch' | 'dinner';
		duration: number | null;
		seatings: DraftSeating[];
	}

	let nextKey = 0;

	function toDrafts(schedule: EditorService[]): DraftService[] {
		return schedule.map((service) => ({
			serviceId: service.serviceId,
			date: service.date,
			kind: service.kind,
			duration: service.defaultDurationMinutes,
			seatings: service.seatings.map((seating) => {
				const start = parseTimeOfDay(seating.start);
				const end = parseTimeOfDay(seating.end);
				// An end matching the default duration stays "auto" so it
				// follows later duration changes.
				const filled = start !== null && end !== null && end - start === service.defaultDurationMinutes;
				return {
					key: nextKey++,
					id: seating.id,
					start: seating.start,
					end: seating.end,
					endOverridden: !filled,
					titleEn: seating.titleEn ?? '',
					titleFr: seating.titleFr ?? '',
					descriptionEn: seating.descriptionEn ?? '',
					descriptionFr: seating.descriptionFr ?? '',
					capacity: seating.capacityOverridden ? seating.totalCapacity : null,
					capacityOverridden: seating.capacityOverridden,
					published: seating.published,
					allowWaitlist: seating.allowWaitlist,
					badgeType: seating.badgeType,
					reservationCount: seating.reservationCount,
					soldSeats: Math.max(0, seating.totalCapacity - seating.availableCapacity),
					detailsOpen: false,
				};
			}),
		}));
	}

	let services: DraftService[] = $state(toDrafts(data.schedule ?? []));
	let venueCapacity: number | null = $state(data.venueCapacity ?? null);
	let saving = $state(false);

	const reviews: SeatingReview[][] = $derived(
		services.map((service) =>
			reviewServiceSeatings(
				service.kind,
				service.duration ?? 0,
				service.seatings.map((seating) => ({
					start: seating.start,
					end: seating.endOverridden ? seating.end : null,
				}))
			)
		)
	);

	const overlapCount = $derived(
		reviews.flat().filter((review) => review.overlapsPreviousEndingAt !== null).length
	);

	const payload = $derived(
		JSON.stringify(
			services.map((service): ServiceSeatingsPayload => ({
				serviceId: service.serviceId,
				defaultDurationMinutes: service.duration ?? 0,
				seatings: service.seatings.map((seating) => ({
					id: seating.id,
					start: seating.start,
					end: seating.endOverridden ? seating.end : null,
					titleEn: seating.titleEn.trim() || null,
					titleFr: seating.titleFr.trim() || null,
					descriptionEn: seating.descriptionEn.trim() || null,
					descriptionFr: seating.descriptionFr.trim() || null,
					capacityOverride: seating.capacityOverridden ? (seating.capacity ?? 0) : null,
					published: seating.published,
					allowWaitlist: seating.allowWaitlist,
					badgeType: seating.badgeType,
				})),
			}))
		)
	);

	const MEAL_LABEL = { lunch: 'Déjeuner', dinner: 'Dîner' } as const;
	const DEFAULT_START = { lunch: '12:00', dinner: '19:30' } as const;

	function dayLabel(date: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
		}).format(new Date(`${date}T12:00:00Z`));
	}

	function frClock(minutes: number): string {
		return formatTimeOfDay(minutes).replace(':', 'h');
	}

	/** The end shown in a row: the override, else the one filled from the duration. */
	function shownEnd(seating: DraftSeating, review: SeatingReview | undefined): string {
		if (seating.endOverridden) return seating.end;
		return review?.endMinutes != null ? formatTimeOfDay(review.endMinutes) : '';
	}

	function addSeating(serviceIndex: number) {
		const service = services[serviceIndex];
		const serviceReviews = reviews[serviceIndex] ?? [];
		// Start the new Seating when the latest one ends (a clean turn-over)
		// and copy its settings; it inherits the Venue Capacity and is priced
		// from its Service (« Menus & tarifs »).
		let latestEnd: number | null = null;
		let template: DraftSeating | undefined = service.seatings.at(-1);
		for (const [index, seating] of service.seatings.entries()) {
			const end = serviceReviews[index]?.endMinutes ?? null;
			if (end !== null && (latestEnd === null || end > latestEnd)) {
				latestEnd = end;
				template = seating;
			}
		}
		const start = latestEnd !== null ? formatTimeOfDay(latestEnd) : DEFAULT_START[service.kind];

		service.seatings.push({
			key: nextKey++,
			id: null,
			start,
			end: '',
			endOverridden: false,
			titleEn: '',
			titleFr: '',
			descriptionEn: '',
			descriptionFr: '',
			capacity: null,
			capacityOverridden: false,
			published: template?.published ?? true,
			allowWaitlist: template?.allowWaitlist ?? false,
			badgeType: 'none',
			reservationCount: 0,
			soldSeats: 0,
			detailsOpen: false,
		});
		const key = service.seatings.at(-1)!.key;
		requestAnimationFrame(() => document.getElementById(`seating-${key}-start`)?.focus());
	}

	function removeSeating(serviceIndex: number, seatingIndex: number) {
		services[serviceIndex].seatings.splice(seatingIndex, 1);
	}

	function overrideEnd(seating: DraftSeating, value: string) {
		seating.end = value;
		seating.endOverridden = true;
	}

	function resetEnd(seating: DraftSeating) {
		seating.endOverridden = false;
		seating.end = '';
	}

	function overrideCapacity(seating: DraftSeating, value: number) {
		seating.capacity = Number.isNaN(value) ? null : value;
		seating.capacityOverridden = true;
	}

	function resetCapacity(seating: DraftSeating) {
		seating.capacityOverridden = false;
		seating.capacity = null;
	}

	function isValidCapacity(value: number | null): value is number {
		return value !== null && Number.isInteger(value) && value >= 1 && value <= 10000;
	}

	const inheritingCount = $derived(
		services.reduce((count, service) => count + service.seatings.filter((seating) => !seating.capacityOverridden).length, 0)
	);
	const overriddenCount = $derived(
		services.reduce((count, service) => count + service.seatings.filter((seating) => seating.capacityOverridden).length, 0)
	);

	function timeErrorMessage(review: SeatingReview): string | null {
		switch (review.timeError) {
			case 'start':
				return 'Saisissez une heure de début au format HH:MM.';
			case 'end':
				return 'La fin doit être après le début, le même jour.';
			case 'midnight':
				return 'Avec la durée par défaut, cette séance dépasserait minuit : saisissez une fin.';
			default:
				return null;
		}
	}

	/** First field that blocks the save, with the message to show. */
	function firstBlockingField(): { id: string; message: string } | null {
		if (!isValidCapacity(venueCapacity)) {
			return {
				id: 'venue-capacity',
				message: 'Capacité du lieu invalide : saisissez un nombre entier de places, entre 1 et 10 000.',
			};
		}
		for (const [serviceIndex, service] of services.entries()) {
			const label = `${MEAL_LABEL[service.kind].toLowerCase()} du ${dayLabel(service.date)}`;
			if (
				service.duration === null ||
				!Number.isInteger(service.duration) ||
				service.duration < 1 ||
				service.duration > 1440
			) {
				return {
					id: `service-${service.serviceId}-duration`,
					message: `Durée par défaut invalide pour le ${label} (entre 1 et 1440 minutes).`,
				};
			}
			for (const [seatingIndex, seating] of service.seatings.entries()) {
				const review = reviews[serviceIndex][seatingIndex];
				const timeError = timeErrorMessage(review);
				if (timeError) {
					return {
						id: `seating-${seating.key}-${review.timeError === 'start' ? 'start' : 'end'}`,
						message: `${timeError} (${label})`,
					};
				}
				if (review.mealMismatch) {
					return {
						id: `seating-${seating.key}-start`,
						message: service.kind === 'lunch'
							? `Une séance du déjeuner doit commencer avant 16:00 UTC (${label}).`
							: `Une séance du dîner doit commencer à partir de 16:00 UTC (${label}).`,
					};
				}
				if (!seating.capacityOverridden) {
					if (venueCapacity < seating.soldSeats) {
						return {
							id: 'venue-capacity',
							message: `La capacité du lieu ne peut pas descendre sous les ${seating.soldSeats} places déjà réservées d’une séance qui en hérite (${label}).`,
						};
					}
				} else {
					const capacity = seating.capacity;
					if (!isValidCapacity(capacity)) {
						return {
							id: `seating-${seating.key}-capacity`,
							message: `Capacité invalide (entre 1 et 10 000 places) pour une séance du ${label}.`,
						};
					}
					if (capacity < seating.soldSeats) {
						return {
							id: `seating-${seating.key}-capacity`,
							message: `La capacité ne peut pas descendre sous les ${seating.soldSeats} places déjà réservées (${label}).`,
						};
					}
				}
			}
		}
		return null;
	}

	function saveSeatingsEnhance({ cancel }: { cancel: () => void }) {
		const blocking = firstBlockingField();
		if (blocking) {
			cancel();
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Séances enregistrées');
				await invalidateAll();
				services = toDrafts(data.schedule ?? []);
				venueCapacity = data.venueCapacity ?? null;
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			} else if (result.type === 'error') {
				toast.error('Erreur', 'Une erreur est survenue');
			}
		};
	}

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const LABEL_CLASS = 'block text-xs font-medium text-foreground-alt mb-1';
</script>

{#if services.length === 0}
	<div class="bg-background rounded-lg border border-border-card p-12 text-center">
		<CalendarDays size={48} class="mx-auto mb-4 text-muted-foreground" />
		<h3 class="text-xl font-semibold text-foreground mb-2">Aucun jour ni repas pour le moment</h3>
		<p class="text-muted-foreground">
			Choisissez d’abord les jours et les repas (déjeuner, dîner) dans l’onglet « Vue d’ensemble », puis
			ajoutez leurs séances ici.
		</p>
	</div>
{:else}
	<form method="POST" action="?/saveSeatings" use:enhance={saveSeatingsEnhance} novalidate class="space-y-6">
		<input type="hidden" name="services" value={payload} />

		<section class="bg-background rounded-lg border border-border-card p-4 lg:p-6" aria-labelledby="venue-capacity-title">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h3 id="venue-capacity-title" class="text-lg font-semibold text-foreground">Capacité du lieu</h3>
					<p id="venue-capacity-help" class="text-sm text-muted-foreground">
						Nombre de convives que le lieu accueille à la fois. Chaque séance en hérite, sauf si vous lui
						donnez sa propre capacité.
					</p>
				</div>
				<div class="w-full sm:w-48 shrink-0">
					<label for="venue-capacity" class={LABEL_CLASS}>Places</label>
					<div class="relative">
						<Users size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input
							id="venue-capacity"
							name="venueCapacity"
							type="number"
							inputmode="numeric"
							min="1"
							max="10000"
							step="1"
							required
							bind:value={venueCapacity}
							aria-describedby="venue-capacity-help venue-capacity-usage"
							class="{INPUT_CLASS} pl-9"
						/>
					</div>
				</div>
			</div>
			<p id="venue-capacity-usage" class="mt-3 text-xs text-muted-foreground" aria-live="polite">
				{inheritingCount} séance{inheritingCount > 1 ? 's' : ''} en hérite{inheritingCount > 1 ? 'nt' : ''}
				· {overriddenCount} avec sa propre capacité
			</p>
		</section>

		<p class="text-sm text-muted-foreground">
			Pour chaque repas, saisissez les heures de début des séances : la fin est calculée à partir de la durée
			par défaut et reste modifiable. Les heures sont en UTC. Une séance sans titre est affichée avec son
			repas, son jour et son heure. Le menu et le prix se règlent par repas dans l’onglet « Menus &amp;
			tarifs ».
		</p>

		{#each services as service, serviceIndex (service.serviceId)}
			{@const serviceReviews = reviews[serviceIndex] ?? []}
			<section
				class="bg-background rounded-lg border border-border-card"
				aria-labelledby="service-{service.serviceId}-title"
			>
				<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between p-4 lg:p-6 border-b border-border-card">
					<div>
						<h3 id="service-{service.serviceId}-title" class="text-lg font-semibold text-foreground">
							{MEAL_LABEL[service.kind]}
						</h3>
						<p class="text-sm text-muted-foreground first-letter:uppercase">{dayLabel(service.date)}</p>
					</div>
					<div class="w-full sm:w-48">
						<label for="service-{service.serviceId}-duration" class={LABEL_CLASS}>
							Durée par défaut (minutes)
						</label>
						<input
							id="service-{service.serviceId}-duration"
							type="number"
							min="1"
							max="1440"
							step="5"
							bind:value={service.duration}
							class={INPUT_CLASS}
						/>
					</div>
				</header>

				<div class="divide-y divide-border-card">
					{#if service.seatings.length === 0}
						<p class="px-4 lg:px-6 py-4 text-sm text-muted-foreground">Aucune séance pour ce repas.</p>
					{/if}

					{#each service.seatings as seating, seatingIndex (seating.key)}
						{@const review = serviceReviews[seatingIndex]}
						{@const timeError = review ? timeErrorMessage(review) : null}
						{@const derived = review?.startMinutes != null
							? derivedSeatingTitle(`${service.date}T${formatTimeOfDay(review.startMinutes)}:00Z`, { dayDate: service.date, serviceKind: service.kind }, 'fr')
							: ''}
						<div class="px-4 lg:px-6 py-4 space-y-3">
							<div class="grid grid-cols-2 gap-3 lg:grid-cols-[7rem_9rem_9rem_auto_auto_1fr] lg:items-end">
								<div>
									<label for="seating-{seating.key}-start" class={LABEL_CLASS}>Début</label>
									<input
										id="seating-{seating.key}-start"
										type="time"
										bind:value={seating.start}
										aria-invalid={review?.timeError === 'start' || review?.mealMismatch ? 'true' : undefined}
										aria-describedby="seating-{seating.key}-flags"
										class={INPUT_CLASS}
									/>
								</div>
								<div>
									<label for="seating-{seating.key}-end" class={LABEL_CLASS}>
										Fin {seating.endOverridden ? '(modifiée)' : '(auto)'}
									</label>
									<div class="flex items-center gap-1">
										<input
											id="seating-{seating.key}-end"
											type="time"
											value={shownEnd(seating, review)}
											oninput={(event) => overrideEnd(seating, event.currentTarget.value)}
											aria-invalid={review?.timeError === 'end' || review?.timeError === 'midnight' ? 'true' : undefined}
											aria-describedby="seating-{seating.key}-flags"
											class={INPUT_CLASS}
										/>
										{#if seating.endOverridden}
											<button
												type="button"
												onclick={() => resetEnd(seating)}
												aria-label="Revenir à la durée par défaut"
												title="Revenir à la durée par défaut"
												class="shrink-0 inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
											>
												<RotateCcw size={14} />
											</button>
										{/if}
									</div>
								</div>
								<div>
									<label for="seating-{seating.key}-capacity" class={LABEL_CLASS}>
										Capacité {seating.capacityOverridden ? '(propre)' : '(lieu)'}
									</label>
									<div class="flex items-center gap-1">
										<input
											id="seating-{seating.key}-capacity"
											type="number"
											inputmode="numeric"
											min={Math.max(1, seating.soldSeats)}
											max="10000"
											step="1"
											value={seating.capacityOverridden ? seating.capacity : venueCapacity}
											oninput={(event) => overrideCapacity(seating, event.currentTarget.valueAsNumber)}
											title={seating.capacityOverridden
												? 'Capacité propre à cette séance'
												: 'Capacité du lieu — saisissez une valeur pour donner à cette séance sa propre capacité'}
											class={INPUT_CLASS}
										/>
										{#if seating.capacityOverridden}
											<button
												type="button"
												onclick={() => resetCapacity(seating)}
												aria-label="Revenir à la capacité du lieu"
												title="Revenir à la capacité du lieu"
												class="shrink-0 inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
											>
												<RotateCcw size={14} />
											</button>
										{/if}
									</div>
								</div>
								<label class="flex items-center gap-2 text-sm text-foreground-alt lg:pb-2">
									<input type="checkbox" bind:checked={seating.published} class="size-4" />
									Publiée
								</label>
								<label class="flex items-center gap-2 text-sm text-foreground-alt lg:pb-2">
									<input type="checkbox" bind:checked={seating.allowWaitlist} class="size-4" />
									Liste d’attente
								</label>
								<div class="col-span-2 lg:col-span-1 flex items-center justify-end gap-1 lg:pb-1">
									<button
										type="button"
										onclick={() => (seating.detailsOpen = !seating.detailsOpen)}
										aria-expanded={seating.detailsOpen}
										aria-controls="seating-{seating.key}-details"
										class="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded-md text-foreground-alt hover:bg-muted"
									>
										Détails
										<ChevronDown size={14} class={seating.detailsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
									</button>
									<button
										type="button"
										onclick={() => removeSeating(serviceIndex, seatingIndex)}
										disabled={seating.reservationCount > 0}
										aria-label="Supprimer cette séance"
										title={seating.reservationCount > 0
											? 'Cette séance a des réservations : elle ne peut pas être supprimée.'
											: 'Supprimer cette séance'}
										class="inline-flex items-center justify-center size-8 rounded-md text-red-600 hover:bg-red-50 disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed"
									>
										<Trash2 size={16} />
									</button>
								</div>
							</div>

							<div id="seating-{seating.key}-flags" aria-live="polite" class="space-y-1">
								{#if timeError}
									<p class="flex items-center gap-1.5 text-xs text-red-600">
										<AlertTriangle size={14} class="shrink-0" />{timeError}
									</p>
								{/if}
								{#if review?.mealMismatch}
									<p class="flex items-center gap-1.5 text-xs text-red-600">
										<AlertTriangle size={14} class="shrink-0" />
										{service.kind === 'lunch'
											? 'Une séance du déjeuner doit commencer avant 16:00 UTC.'
											: 'Une séance du dîner doit commencer à partir de 16:00 UTC.'}
									</p>
								{/if}
								{#if review?.overlapsPreviousEndingAt != null}
									<p class="flex items-center gap-1.5 text-xs text-amber-700">
										<AlertTriangle size={14} class="shrink-0" />
										Chevauchement : commence avant la fin de la séance précédente ({frClock(review.overlapsPreviousEndingAt)}).
									</p>
								{/if}
								{#if seating.reservationCount > 0}
									<p class="text-xs text-muted-foreground">
										{seating.reservationCount} réservation{seating.reservationCount > 1 ? 's' : ''}
										{#if seating.soldSeats > 0}· {seating.soldSeats} place{seating.soldSeats > 1 ? 's' : ''} réservée{seating.soldSeats > 1 ? 's' : ''}{/if}
									</p>
								{/if}
							</div>

							<div id="seating-{seating.key}-details" hidden={!seating.detailsOpen} class="space-y-3 pt-2">
								<div class="grid gap-3 lg:grid-cols-2">
									<div>
										<label for="seating-{seating.key}-titleEn" class={LABEL_CLASS}>Titre (anglais, facultatif)</label>
										<input
											id="seating-{seating.key}-titleEn"
											type="text"
											maxlength="255"
											bind:value={seating.titleEn}
											placeholder={review?.startMinutes != null
												? derivedSeatingTitle(`${service.date}T${formatTimeOfDay(review.startMinutes)}:00Z`, { dayDate: service.date, serviceKind: service.kind }, 'en')
												: ''}
											class={INPUT_CLASS}
										/>
									</div>
									<div>
										<label for="seating-{seating.key}-titleFr" class={LABEL_CLASS}>Titre (français, facultatif)</label>
										<input
											id="seating-{seating.key}-titleFr"
											type="text"
											maxlength="255"
											bind:value={seating.titleFr}
											placeholder={derived}
											class={INPUT_CLASS}
										/>
									</div>
									<div>
										<label for="seating-{seating.key}-descriptionEn" class={LABEL_CLASS}>Description (anglais, facultative)</label>
										<textarea
											id="seating-{seating.key}-descriptionEn"
											rows="2"
											bind:value={seating.descriptionEn}
											class="{INPUT_CLASS} resize-none"
										></textarea>
									</div>
									<div>
										<label for="seating-{seating.key}-descriptionFr" class={LABEL_CLASS}>Description (français, facultative)</label>
										<textarea
											id="seating-{seating.key}-descriptionFr"
											rows="2"
											bind:value={seating.descriptionFr}
											class="{INPUT_CLASS} resize-none"
										></textarea>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-3 lg:w-1/2">
									<div class="col-span-2 lg:col-span-1">
										<label for="seating-{seating.key}-badge" class={LABEL_CLASS}>Badge</label>
										<select id="seating-{seating.key}-badge" bind:value={seating.badgeType} class={INPUT_CLASS}>
											<option value="none">Aucun</option>
											<option value="featured">En vedette</option>
											<option value="vip">VIP</option>
											<option value="popular">Populaire</option>
											<option value="best_value">Meilleur rapport</option>
											<option value="limited">Places limitées</option>
										</select>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<div class="px-4 lg:px-6 py-3 border-t border-border-card">
					<button
						type="button"
						onclick={() => addSeating(serviceIndex)}
						class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted"
					>
						<Plus size={16} />
						Ajouter une séance
					</button>
				</div>
			</section>
		{/each}

		<div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
			{#if overlapCount > 0}
				<p class="flex items-center gap-1.5 text-sm text-amber-700 sm:mr-auto" role="status">
					<AlertTriangle size={16} class="shrink-0" />
					{overlapCount} séance{overlapCount > 1 ? 's' : ''} en chevauchement — vérifiez avant d’enregistrer.
				</p>
			{/if}
			<button
				type="submit"
				disabled={saving}
				class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
			>
				{saving ? 'Enregistrement…' : 'Enregistrer les séances'}
			</button>
		</div>
	</form>
{/if}
