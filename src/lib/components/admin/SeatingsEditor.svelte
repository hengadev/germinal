<script module lang="ts">
	// Seatings editor (issue 020): the Event's Days → Services → Seatings.
	// Each Service gets a default Seating duration and its Seatings, typed as
	// start times. End times are filled from the duration and can be
	// overridden per Seating. Invalid times and overlapping Seatings are
	// flagged before saving, with the same helpers the server checks the
	// payload with.
	// Capacity (issue 021): the Event's Venue Capacity is set at the top and
	// inherited by every Seating, which may override it with its own. Left
	// blank, inheriting Seatings take any number of Reservations (ADR 0009).
	//
	// Fields only: the host page owns the drafts and the <form>. The editor
	// posts its payload as `services` and the Venue Capacity as
	// `venueCapacity`; call `firstBlockingField()` before submitting.
	// Used by the event page's « Dates & séances » tab and the new-event
	// form, each below the Days picker it follows; a Service picked there
	// but not saved yet has a placeholder `serviceId` the server swaps for
	// the real id.
	import {
		DEFAULT_SERVICE_DURATION_MINUTES,
		parseTimeOfDay,
		type ServiceKind,
	} from '$lib/utils/seating-times';
	import type { EditorService, SeatingBadge } from '$lib/types/seatings-editor';

	export interface DraftSeating {
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

	export interface DraftSeatingService {
		serviceId: string;
		date: string;
		kind: ServiceKind;
		duration: number | null;
		seatings: DraftSeating[];
	}

	let nextKey = 0;

	export function toSeatingDrafts(schedule: EditorService[]): DraftSeatingService[] {
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
					soldSeats: seating.heldSeats,
					detailsOpen: false,
				};
			}),
		}));
	}

	/** A Service just picked on the Days picker: default duration, no Seating. */
	export function newSeatingService(serviceId: string, date: string, kind: ServiceKind): DraftSeatingService {
		return { serviceId, date, kind, duration: DEFAULT_SERVICE_DURATION_MINUTES[kind], seatings: [] };
	}
</script>

<script lang="ts">
	import { AlertTriangle, CalendarDays, ChevronDown, Plus, RotateCcw, Trash2, Users } from 'lucide-svelte';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';
	import {
		endAfterDuration,
		formatTimeOfDay,
		reviewServiceSeatings,
		type SeatingReview,
	} from '$lib/utils/seating-times';
	import {
		DEFAULT_EVENT_TIME_ZONE,
		formatDayKey,
		serviceKindOfMinutes,
		wallClockToInstant,
	} from '$lib/utils/event-time';
	import { derivedSeatingTitle } from '$lib/utils/seating-title';
	import {
		reviewSeatingTemplate,
		startsToAdd,
		type SeatingTemplateError,
	} from '$lib/utils/seating-template';
	import type { ServiceSeatingsPayload } from '$lib/types/seatings-editor';

	let {
		services = $bindable(),
		venueCapacity = $bindable(),
		timeZone = DEFAULT_EVENT_TIME_ZONE,
	}: {
		services: DraftSeatingService[];
		venueCapacity: number | null;
		/** The Event's Time Zone: times are typed and shown on its clock. */
		timeZone?: string;
	} = $props();

	/** Untitled Seating's label, read on the Event's clock. */
	function derivedTitle(date: string, kind: ServiceKind, startMinutes: number, locale: 'en' | 'fr'): string {
		return derivedSeatingTitle(
			wallClockToInstant(date, startMinutes, timeZone),
			{ timeZone, dayDate: date, serviceKind: kind },
			locale
		);
	}

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
		return formatDayKey(date, 'fr');
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

		service.seatings.push(blankSeating(start, template));
		const key = service.seatings.at(-1)!.key;
		requestAnimationFrame(() => document.getElementById(`seating-${key}-start`)?.focus());
	}

	/** A new Seating at `start`, inheriting the Venue Capacity; publication
	 * and waitlist copied from `template` (the meal's latest Seating). */
	function blankSeating(start: string, template: DraftSeating | undefined): DraftSeating {
		return {
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
		};
	}

	// « Séances par repas »: start times and a duration typed once per meal
	// kind, applied to every lunch or every dinner. Applying only adds the
	// starts a Service lacks and sets its default duration; existing
	// Seatings are never removed.
	const KINDS: ServiceKind[] = ['lunch', 'dinner'];
	const MEAL_PLURAL = { lunch: 'Déjeuners', dinner: 'Dîners' } as const;

	interface MealTemplate {
		starts: string[];
		duration: number | null;
		/** Why the last apply was refused, or what it did. */
		message: { tone: 'error' | 'done'; text: string } | null;
	}

	let templates: Record<ServiceKind, MealTemplate> = $state({
		lunch: { starts: [DEFAULT_START.lunch], duration: DEFAULT_SERVICE_DURATION_MINUTES.lunch, message: null },
		dinner: { starts: [DEFAULT_START.dinner], duration: DEFAULT_SERVICE_DURATION_MINUTES.dinner, message: null },
	});

	const kindsPicked = $derived(KINDS.filter((kind) => services.some((service) => service.kind === kind)));

	/** Services grouped by Day, by date: each Day lists its meals' indexes in `services`. */
	const serviceDays = $derived.by(() => {
		const byDate = new Map<string, Partial<Record<ServiceKind, number>>>();
		services.forEach((service, index) => {
			const meals = byDate.get(service.date) ?? {};
			meals[service.kind] = index;
			byDate.set(service.date, meals);
		});
		return [...byDate.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, meals]) => ({ date, meals }));
	});

	function addTemplateStart(kind: ServiceKind) {
		const template = templates[kind];
		// Next turn-over after the latest start, when it stays in the meal.
		const latest = Math.max(-1, ...template.starts.map((start) => parseTimeOfDay(start) ?? -1));
		const next = latest >= 0 && template.duration ? latest + template.duration : null;
		const fits = next !== null && endAfterDuration(next, template.duration ?? 0) !== null && serviceKindOfMinutes(next) === kind;
		template.starts.push(fits ? formatTimeOfDay(next) : DEFAULT_START[kind]);
		const index = template.starts.length - 1;
		requestAnimationFrame(() => document.getElementById(`template-${kind}-start-${index}`)?.focus());
	}

	function templateErrorMessage(kind: ServiceKind, error: SeatingTemplateError, starts: string[]): string {
		switch (error.reason) {
			case 'empty':
				return 'Ajoutez au moins une heure de début.';
			case 'duration':
				return 'Durée invalide : saisissez un nombre entier de minutes, entre 1 et 1440.';
			case 'start':
				return 'Saisissez chaque heure de début au format HH:MM.';
			case 'meal':
				return kind === 'lunch'
					? 'Une séance du déjeuner doit commencer avant 16h00.'
					: 'Une séance du dîner doit commencer à partir de 16h00.';
			case 'midnight':
				return `Avec cette durée, la séance de ${starts[error.index]} dépasserait minuit.`;
		}
	}

	function applyTemplate(kind: ServiceKind) {
		const template = templates[kind];
		const review = reviewSeatingTemplate(kind, template.starts, template.duration);
		if (!review.ok) {
			template.message = { tone: 'error', text: templateErrorMessage(kind, review.error, template.starts) };
			const fieldId = 'index' in review.error
				? `template-${kind}-start-${review.error.index}`
				: review.error.reason === 'duration' ? `template-${kind}-duration` : `template-${kind}-add`;
			requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
			return;
		}
		let added = 0;
		let meals = 0;
		for (const service of services) {
			if (service.kind !== kind) continue;
			meals++;
			service.duration = template.duration;
			const latest = service.seatings.at(-1);
			for (const start of startsToAdd(service.seatings.map((seating) => seating.start), review.startMinutes)) {
				service.seatings.push(blankSeating(formatTimeOfDay(start), latest));
				added++;
			}
			service.seatings.sort((a, b) => (parseTimeOfDay(a.start) ?? Infinity) - (parseTimeOfDay(b.start) ?? Infinity));
		}
		const mealLabel = `${meals} ${MEAL_PLURAL[kind].toLowerCase()}`;
		template.message = {
			tone: 'done',
			text: added === 0
				? `Les ${mealLabel} ont déjà ces séances ; leur durée par défaut est mise à jour.`
				: `${added} séance${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} sur ${mealLabel}. Enregistrez pour les créer.`,
		};
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
	export function firstBlockingField(): { id: string; message: string } | null {
		// Blank means no limit (ADR 0009).
		if (venueCapacity != null && !isValidCapacity(venueCapacity)) {
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
							? `Une séance du déjeuner doit commencer avant 16h00 (${label}).`
							: `Une séance du dîner doit commencer à partir de 16h00 (${label}).`,
					};
				}
				if (!seating.capacityOverridden) {
					if (venueCapacity != null && venueCapacity < seating.soldSeats) {
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

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const LABEL_CLASS = 'block text-xs font-medium text-foreground-alt mb-1';
</script>

<div class="space-y-6">
	<input type="hidden" name="services" value={payload} />

	<section class="bg-background rounded-lg border border-border-card p-4 lg:p-6" aria-labelledby="venue-capacity-title">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h3 id="venue-capacity-title" class="text-lg font-semibold text-foreground">Capacité du lieu</h3>
				<p id="venue-capacity-help" class="text-sm text-muted-foreground">
					Nombre de places mises en vente à chaque séance — vous pouvez dépasser la jauge de la salle pour
					compenser les absences. Laissez vide pour ne pas limiter les réservations. Chaque séance en
					hérite, sauf si vous lui donnez sa propre capacité.
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
						placeholder="Sans limite"
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

	{#if services.length === 0}
		<div class="bg-background rounded-lg border border-border-card p-12 text-center">
			<CalendarDays size={48} class="mx-auto mb-4 text-muted-foreground" />
			<h3 class="text-xl font-semibold text-foreground mb-2">Aucun jour ni repas pour le moment</h3>
			<p class="text-muted-foreground">
				Choisissez d’abord les jours et les repas (déjeuner, dîner) sur le calendrier ci-dessus, puis
				ajoutez leurs séances ici.
			</p>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			Pour chaque repas, saisissez les heures de début des séances : la fin est calculée à partir de la durée
			par défaut et reste modifiable. Les heures sont celles du lieu, dans le fuseau horaire de l’événement. Une séance sans titre est affichée avec son
			repas, son jour et son heure. Le menu et le prix se règlent par repas dans l’onglet « Menus &amp;
			tarifs ».
		</p>

		<section class="bg-background rounded-lg border border-border-card" aria-labelledby="seating-templates-title">
			<header class="p-4 lg:p-6 border-b border-border-card">
				<h3 id="seating-templates-title" class="text-lg font-semibold text-foreground">Séances par repas</h3>
				<p class="text-sm text-muted-foreground">
					Saisissez une fois les séances d’un repas, puis appliquez-les à tous les jours qui le proposent. Les
					séances déjà présentes sont conservées et une même heure n’est pas ajoutée deux fois ; la durée
					devient la durée par défaut de ces repas. Ajustez ensuite jour par jour ci-dessous si besoin.
				</p>
			</header>
			<div class="divide-y divide-border-card">
				{#each kindsPicked as kind (kind)}
					{@const template = templates[kind]}
					{@const dayCount = services.filter((service) => service.kind === kind).length}
					<div class="px-4 lg:px-6 py-4 space-y-3">
						<p class="text-sm font-medium text-foreground">
							{MEAL_PLURAL[kind]}
							<span class="font-normal text-muted-foreground">— {dayCount} jour{dayCount > 1 ? 's' : ''}</span>
						</p>
						<div class="flex flex-wrap items-end gap-3">
							{#each template.starts as _, index (index)}
								<div>
									<label for="template-{kind}-start-{index}" class={LABEL_CLASS}>Séance {index + 1}</label>
									<div class="flex items-center gap-1">
										<input
											id="template-{kind}-start-{index}"
											type="time"
											bind:value={template.starts[index]}
											class="{INPUT_CLASS} w-28"
										/>
										{#if template.starts.length > 1}
											<button
												type="button"
												onclick={() => template.starts.splice(index, 1)}
												aria-label="Retirer la séance {index + 1}"
												title="Retirer cette heure"
												class="shrink-0 inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-red-600 hover:bg-muted"
											>
												<Trash2 size={14} />
											</button>
										{/if}
									</div>
								</div>
							{/each}
							<button
								id="template-{kind}-add"
								type="button"
								onclick={() => addTemplateStart(kind)}
								class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted"
							>
								<Plus size={14} />
								Ajouter une heure
							</button>
							<div class="w-36">
								<label for="template-{kind}-duration" class={LABEL_CLASS}>Durée (minutes)</label>
								<input
									id="template-{kind}-duration"
									type="number"
									inputmode="numeric"
									bind:value={template.duration}
									class={INPUT_CLASS}
								/>
							</div>
							<button
								type="button"
								onclick={() => applyTemplate(kind)}
								class="px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90"
							>
								Appliquer à tous les {MEAL_PLURAL[kind].toLowerCase()}
							</button>
						</div>
						<p aria-live="polite" class="text-xs {template.message?.tone === 'error' ? 'text-red-600' : 'text-muted-foreground'}">
							{template.message?.text ?? ''}
						</p>
					</div>
				{/each}
			</div>
		</section>

		{#each serviceDays as day (day.date)}
			<section class="bg-background rounded-lg border border-border-card" aria-labelledby="day-{day.date}-title">
				<h3 id="day-{day.date}-title" class="px-4 lg:px-6 py-3 text-lg font-semibold text-foreground first-letter:uppercase">
					{dayLabel(day.date)}
				</h3>
				<div class={kindsPicked.length > 1 ? 'lg:grid lg:grid-cols-2' : ''}>
					{#each kindsPicked as kind (kind)}
						{@const serviceIndex = day.meals[kind]}
						{@const columnBorder = `border-t border-border-card ${kind === 'dinner' && kindsPicked.length > 1 ? 'lg:border-l' : ''}`}
						{#if serviceIndex === undefined}
							<p class="hidden lg:block {columnBorder} px-4 lg:px-6 py-4 text-sm text-muted-foreground">
								Pas de {MEAL_LABEL[kind].toLowerCase()} ce jour.
							</p>
						{:else}
							{@const service = services[serviceIndex]}
							{@const serviceReviews = reviews[serviceIndex] ?? []}
							<div class="@container flex flex-col {columnBorder}" role="group" aria-labelledby="service-{service.serviceId}-title">
								<header class="flex flex-wrap items-end justify-between gap-3 px-4 lg:px-6 py-3 border-b border-border-card">
									<h4 id="service-{service.serviceId}-title" class="text-base font-semibold text-foreground">
										{MEAL_LABEL[service.kind]}
									</h4>
									<div class="w-44">
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

								<div class="flex-1 divide-y divide-border-card">
									{#if service.seatings.length === 0}
										<p class="px-4 lg:px-6 py-4 text-sm text-muted-foreground">Aucune séance pour ce repas.</p>
									{/if}

									{#each service.seatings as seating, seatingIndex (seating.key)}
										{@const review = serviceReviews[seatingIndex]}
										{@const timeError = review ? timeErrorMessage(review) : null}
										{@const derived = review?.startMinutes != null
											? derivedTitle(service.date, service.kind, review.startMinutes, 'fr')
											: ''}
										<div class="px-4 lg:px-6 py-4 space-y-3">
											<div class="grid grid-cols-2 gap-3 @md:grid-cols-3 @md:items-end @3xl:grid-cols-[7rem_9rem_9rem_auto_auto_1fr]">
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
															placeholder="Sans limite"
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
												<label class="flex items-center gap-2 text-sm text-foreground-alt @md:pb-2">
													<input type="checkbox" bind:checked={seating.published} class="size-4" />
													Publiée
												</label>
												<label class="flex items-center gap-2 text-sm text-foreground-alt @md:pb-2">
													<input type="checkbox" bind:checked={seating.allowWaitlist} class="size-4" />
													Liste d’attente
												</label>
												<div class="col-span-2 @md:col-span-1 flex items-center justify-end gap-1 @md:pb-1">
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
															? 'Une séance du déjeuner doit commencer avant 16h00.'
															: 'Une séance du dîner doit commencer à partir de 16h00.'}
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
												<div class="grid gap-3 @xl:grid-cols-2">
													<div>
														<label for="seating-{seating.key}-titleFr" class={LABEL_CLASS}>Titre (facultatif)</label>
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
														<label for="seating-{seating.key}-descriptionFr" class={LABEL_CLASS}>Description (facultative)</label>
														<textarea
															id="seating-{seating.key}-descriptionFr"
															rows="2"
															bind:value={seating.descriptionFr}
															class="{INPUT_CLASS} resize-none"
														></textarea>
													</div>
												</div>
												<EnglishVersion>
													<div class="grid gap-3 @xl:grid-cols-2">
														<div>
															<label for="seating-{seating.key}-titleEn" class={LABEL_CLASS}>Titre (anglais, facultatif)</label>
															<input
																id="seating-{seating.key}-titleEn"
																type="text"
																maxlength="255"
																bind:value={seating.titleEn}
																placeholder={review?.startMinutes != null
																	? derivedTitle(service.date, service.kind, review.startMinutes, 'en')
																	: ''}
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
													</div>
												</EnglishVersion>
												<div class="grid grid-cols-2 gap-3 @xl:w-1/2">
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
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/each}

		{#if overlapCount > 0}
			<p class="flex items-center gap-1.5 text-sm text-amber-700" role="status">
				<AlertTriangle size={16} class="shrink-0" />
				{overlapCount} séance{overlapCount > 1 ? 's' : ''} en chevauchement — vérifiez avant d’enregistrer.
			</p>
		{/if}
	{/if}
</div>
