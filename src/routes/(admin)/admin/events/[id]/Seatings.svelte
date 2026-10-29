<script lang="ts">
	// « Séances » tab: the Days and their meals as a programme type with
	// exceptions (two panels), then each Seating's details in the shared
	// Seatings editor (issue 019/020/021), in one form saved with the
	// `saveSeatings` action. The programme is read from the Days and writes
	// into the same drafts: nothing of it is stored.
	// The Seatings follow the picked Days and meals live: a meal picked
	// here before saving gets a placeholder id, which `serviceRefs` maps to
	// its Day and meal for the server.
	// On a Draft the tab saves itself as a whole, once valid (issue 019,
	// ADR 0010); a save coming back takes its ids and generated English
	// into the drafts without undoing what was typed meanwhile.
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { reportSave } from '$lib/utils/editor-save-form';
	import { adoptSavedSeatings, keepEdits } from '$lib/utils/editor-refresh';
	import { AUTOSAVE_ATTRIBUTE, handleTabResult } from './editor-forms';
	import type { PickedDay } from '$lib/components/admin/DaysServicesPicker.svelte';
	import ProgrammeEditor from '$lib/components/admin/schedule/ProgrammeEditor.svelte';
	import {
		BLANK_INFO,
		EMPTY_MEAL,
		KINDS,
		Programme,
		infoAt,
		type Kind,
		type MealPlan,
		type ScheduleSource,
		type SeatingInfo,
		type Wording,
	} from '$lib/components/admin/schedule/programme.svelte';
	import { Users } from 'lucide-svelte';
	import SeatingsEditor, {
		newDraftSeating,
		type DraftSeating,
		newSeatingService,
		toSeatingDrafts,
		type DraftSeatingService,
	} from '$lib/components/admin/SeatingsEditor.svelte';
	import type { EditorService } from '$lib/types/seatings-editor';
	import { clockOf, dayOf, DEFAULT_EVENT_TIME_ZONE, formatDayKey } from '$lib/utils/event-time';
	import type { SeatingsValues } from '$lib/utils/event-warnings-live';

	let {
		data,
		timeZone = data.event?.timeZone,
		services = $bindable(toSeatingDrafts(data.schedule ?? [])),
	}: {
		data: {
			days?: PickedDay[];
			schedule?: EditorService[];
			venueCapacity?: number | null;
			event?: {
				visibility?: string;
				timeZone?: string;
				bookingOpensAt?: Date | string | null;
				bookingClosesHoursBefore?: number | null;
			} | null;
		};
		/** Clock the Seatings are typed on: the Event's saved Time Zone. */
		timeZone?: string;
		services?: DraftSeatingService[];
	} = $props();

	const toast = getToastContext();

	function pickedDaysOf(source: PickedDay[] | undefined): PickedDay[] {
		return (source ?? []).map((day) => ({ date: day.date, kinds: [...day.kinds] }));
	}

	let days: PickedDay[] = $state(pickedDaysOf(data.days));
	let schedule: ReturnType<typeof ProgrammeEditor> | undefined = $state();
	let venueCapacity: number | null = $state(data.venueCapacity ?? null);
	let saving = $state(false);

	// The Booking Window (issue 035): the opening is typed and shown on the
	// Event's clock (`YYYY-MM-DDTHH:MM`), whatever the Admin's own zone.
	function openingInputOf(event: typeof data.event): string {
		if (!event?.bookingOpensAt) return '';
		const zone = event.timeZone ?? DEFAULT_EVENT_TIME_ZONE;
		return `${dayOf(event.bookingOpensAt, zone)}T${clockOf(event.bookingOpensAt, zone)}`;
	}
	let bookingOpensAt = $state(openingInputOf(data.event));
	let bookingClosesHoursBefore: number | null = $state(data.event?.bookingClosesHoursBefore ?? null);
	let editor: ReturnType<typeof SeatingsEditor> | undefined = $state();

	// Drafts of meals unpicked since the last save, so picking one back
	// restores what it had (its saved Seatings, or what was typed).
	let dropped = new Map<string, DraftSeatingService>();
	// Placeholder ids of meals not saved yet, kept while they stay picked.
	let placeholders = new Map<string, string>();
	const keyOf = (date: string, kind: 'lunch' | 'dinner') => `${date}:${kind}`;

	function placeholderId(date: string, kind: 'lunch' | 'dinner'): string {
		const key = keyOf(date, kind);
		let id = placeholders.get(key);
		if (!id) {
			id = crypto.randomUUID();
			placeholders.set(key, id);
		}
		return id;
	}

	/** The meal's draft, made (or taken back from the set-aside ones) now
	 * rather than when the Days are next followed, so it can be filled. */
	function ensureService(date: string, kind: Kind): DraftSeatingService {
		const key = keyOf(date, kind);
		const found = services.find((service) => keyOf(service.date, service.kind) === key);
		if (found) return found;
		const service = dropped.get(key) ?? newSeatingService(placeholderId(date, kind), date, kind);
		dropped.delete(key);
		services.push(service);
		return services.at(-1)!;
	}

	const findService = (date: string, kind: Kind) => services.find((service) => service.date === date && service.kind === kind);
	const byStart = (a: { start: string }, b: { start: string }) => a.start.localeCompare(b.start);

	const infoOf = (seating: DraftSeating): SeatingInfo => ({
		titleFr: seating.titleFr,
		titleEn: seating.titleEn,
		descriptionFr: seating.descriptionFr,
		descriptionEn: seating.descriptionEn,
		badge: seating.badgeType,
	});

	function applyInfo(seating: DraftSeating, info: SeatingInfo) {
		seating.titleFr = info.titleFr;
		seating.titleEn = info.titleEn;
		seating.descriptionFr = info.descriptionFr;
		seating.descriptionEn = info.descriptionEn;
		seating.badgeType = info.badge;
	}

	/** Start times a Seating with Reservations kept although removed. */
	let kept: string | null = $state(null);

	const source: ScheduleSource = {
		get days() {
			return days.map((day) => day.date).sort();
		},
		meal(date, kind): MealPlan {
			const served = days.some((day) => day.date === date && day.kinds.includes(kind));
			const service = served ? findService(date, kind) : undefined;
			if (!service) return { ...EMPTY_MEAL, served };
			const own = service.seatings.find((seating) => seating.capacityOverridden);
			const first = service.seatings[0];
			return {
				...EMPTY_MEAL,
				served,
				starts: service.seatings.map((seating) => seating.start).filter(Boolean).sort(),
				duration: service.duration,
				capacity: own ? own.capacity : null,
				published: first?.published ?? true,
				waitlist: first?.allowWaitlist ?? false,
				seatings: Object.fromEntries(service.seatings.map((seating) => [seating.start, infoOf(seating)])),
			};
		},
		write(date, kind, field, value) {
			if (field === 'served') {
				const day = days.find((d) => d.date === date);
				if (!day) return;
				const kinds = new Set(day.kinds);
				if (value) kinds.add(kind);
				else kinds.delete(kind);
				day.kinds = KINDS.filter((k) => kinds.has(k));
				if (value) ensureService(date, kind);
				return;
			}
			const service = findService(date, kind) ?? (field === 'starts' || field === 'duration' ? ensureService(date, kind) : undefined);
			if (!service) return;
			if (field === 'duration') service.duration = value as number | null;
			else if (field === 'capacity') {
				for (const seating of service.seatings) {
					seating.capacityOverridden = value !== null;
					seating.capacity = value as number | null;
				}
			} else if (field === 'published' || field === 'waitlist') {
				for (const seating of service.seatings) {
					if (field === 'published') seating.published = value as boolean;
					else seating.allowWaitlist = value as boolean;
				}
			} else if (field === 'seatings') {
				const infos = value as Record<string, SeatingInfo>;
				for (const seating of service.seatings) applyInfo(seating, infos[seating.start] ?? BLANK_INFO);
			} else if (field === 'starts') {
				const target = new Set(value as string[]);
				const blocked = service.seatings.filter((seating) => !target.has(seating.start) && seating.reservationCount > 0);
				if (blocked.length) kept = `${blocked.map((seating) => seating.start.replace(':', 'h')).join(', ')} (${date})`;
				const staying = service.seatings.filter((seating) => target.has(seating.start) || seating.reservationCount > 0);
				const latest = staying.at(-1) ?? service.seatings.at(-1);
				const have = new Set(staying.map((seating) => seating.start));
				for (const start of target) if (!have.has(start)) staying.push(newDraftSeating(start, latest));
				service.seatings = staying.sort(byStart);
			}
		},
		renameStart(date, kind, from, to) {
			const service = findService(date, kind);
			const seating = service?.seatings.find((s) => s.start === from);
			if (!service || !seating) return;
			seating.start = to;
			// Custom ends are no longer edited: the Seating takes the duration.
			seating.endOverridden = false;
			seating.end = '';
			service.seatings.sort(byStart);
		},
		addDays(dates, plan) {
			const kinds = KINDS.filter((kind) => plan[kind].served);
			days = [...days, ...dates.map((date) => ({ date, kinds: [...kinds] }))].sort((a, b) => a.date.localeCompare(b.date));
			for (const date of dates) {
				for (const kind of kinds) {
					const service = ensureService(date, kind);
					if (service.seatings.length > 0) continue;
					service.duration = plan[kind].duration;
					service.seatings = plan[kind].starts.map((start) => {
						const seating = newDraftSeating(start);
						seating.published = plan[kind].published;
						seating.allowWaitlist = plan[kind].waitlist;
						applyInfo(seating, infoAt(plan[kind], start));
						return seating;
					});
				}
			}
		},
		removeDays(dates) {
			const gone = new Set(dates);
			days = days.filter((day) => !gone.has(day.date));
		},
	};

	const programme = new Programme(source, 'seances');

	const words: Wording = {
		menuName: () => '',
		price: () => '',
		get venueCapacity() {
			return venueCapacity;
		},
	};

	// Follow the Days picker: a newly picked meal gets an empty draft, a
	// meal still picked keeps its draft, an unpicked one is set aside.
	$effect(() => {
		const picked = days.flatMap((day) => day.kinds.map((kind) => ({ date: day.date, kind })));
		untrack(() => {
			const current = new Map(services.map((service) => [keyOf(service.date, service.kind), service]));
			const pickedKeys = new Set(picked.map(({ date, kind }) => keyOf(date, kind)));
			for (const [key, service] of current) {
				if (!pickedKeys.has(key)) dropped.set(key, service);
			}
			services = picked.map(({ date, kind }) => {
				const key = keyOf(date, kind);
				return current.get(key) ?? dropped.get(key) ?? newSeatingService(placeholderId(date, kind), date, kind);
			});
		});
	});

	// Only the meals not saved yet need mapping; the others carry their id.
	const serviceRefs = $derived(
		JSON.stringify(
			services
				.filter((service) => placeholders.get(keyOf(service.date, service.kind)) === service.serviceId)
				.map((service) => ({ ref: service.serviceId, date: service.date, kind: service.kind }))
		)
	);

	// The Days cannot use browser validity (the payload is a hidden input).
	// A Draft may have no Days (ADR 0010); a published Event cannot drop
	// every saved Day.
	function pickedDaysError(): { message: string; date?: string } | null {
		if (days.length === 0 && (data.days?.length ?? 0) > 0 && data.event?.visibility !== 'draft') {
			return { message: 'Sélectionnez au moins un jour sur le calendrier.' };
		}
		const empty = days.find((day) => day.kinds.length === 0);
		if (empty) {
			return {
				date: empty.date,
				message: `Le ${formatDayKey(empty.date, 'fr', { weekday: 'long', day: 'numeric', month: 'long' })} n’a ni déjeuner ni dîner : servez-en un, ou retirez ce jour.`,
			};
		}
		return null;
	}

	/** The first thing that keeps the tab from saving; `id: null` is the
	 * calendar, or the Day named by `date`. */
	function blockingField(): { id: string | null; message: string; date?: string } | null {
		const dayError = pickedDaysError();
		if (dayError !== null) return { id: null, ...dayError };
		return editor?.firstBlockingField() ?? null;
	}

	/** The panel's control for a field the Seatings editor names
	 * (`seating-<key>-start`, `service-<id>-duration`…): the Day is
	 * selected and the meal opened. */
	function panelTarget(id: string): { date: string; kind: Kind; control: string } | null {
		for (const service of services) {
			if (id === `service-${service.serviceId}-duration`) return { date: service.date, kind: service.kind, control: 'duration' };
			for (const seating of service.seatings) {
				if (id === `seating-${seating.key}-capacity`) return { date: service.date, kind: service.kind, control: 'capacity' };
				if (id.startsWith(`seating-${seating.key}-`)) return { date: service.date, kind: service.kind, control: `start-${seating.start}` };
			}
		}
		return null;
	}

	function focusField(field: { id: string | null; date?: string }) {
		if (field.id === null) {
			if (field.date) schedule?.select([field.date]);
			else schedule?.focusDays();
			return;
		}
		let id = field.id;
		if (id === 'venue-capacity') schedule?.showProgramme();
		const target = panelTarget(id);
		if (target) {
			schedule?.select([target.date], target.kind);
			id = `seatings-programme-sel-${target.kind}-${target.control}`;
		}
		requestAnimationFrame(() => document.getElementById(id)?.focus());
	}

	// A Draft's autosave refused (issue 019): what blocks it shows in the
	// tab, following what is typed, until fixed — without a toast or moving
	// the cursor while the Admin types. An explicit save says it with a
	// toast and goes to the field.
	let refused = $state(false);
	const shownBlocking = $derived(refused ? blockingField() : null);

	const windowFields = () => ({ venueCapacity, bookingOpensAt, bookingClosesHoursBefore });

	function saveSeatingsEnhance({ cancel, formElement }: { cancel: () => void; formElement: HTMLFormElement }) {
		const blocking = blockingField();
		if (blocking) {
			cancel();
			reportSave(formElement, { ok: false, reason: 'invalid', message: blocking.message });
			if (formElement.closest(`[${AUTOSAVE_ATTRIBUTE}]`)) {
				refused = true;
				return;
			}
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => focusField(blocking));
			return;
		}
		refused = false;
		saving = true;
		const sent = { services: $state.snapshot(services), fields: windowFields() };
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Séances enregistrées', formElement, () => {
				const seatingIds = (result as { data?: { seatingIds?: Record<string, string[]> } }).data?.seatingIds;
				adoptSaved(sent, seatingIds);
			});
		};
	}

	/**
	 * Take what a save made into the drafts, keeping what was typed since it
	 * started (issue 019): the Days, Seatings and settings stay as typed;
	 * meals and Seatings saved take their ids, Reservation counts and
	 * generated English. A follow-up save then sends them under their ids.
	 */
	function adoptSaved(
		sent: { services: DraftSeatingService[]; fields: ReturnType<typeof windowFields> },
		seatingIds: Record<string, string[]> | undefined
	) {
		const saved = toSeatingDrafts(data.schedule ?? []);
		const savedMeals = new Set(saved.map((service) => keyOf(service.date, service.kind)));
		for (const key of [...placeholders.keys()]) if (savedMeals.has(key)) placeholders.delete(key);
		const picked = new Set(services.map((service) => keyOf(service.date, service.kind)));
		for (const key of [...dropped.keys()]) if (picked.has(key)) dropped.delete(key);
		adoptSavedSeatings([...services, ...dropped.values()], sent.services, saved, seatingIds, (date, kind) =>
			placeholderId(date, kind as 'lunch' | 'dinner')
		);
		({ venueCapacity, bookingOpensAt, bookingClosesHoursBefore } = keepEdits(sent.fields, windowFields(), {
			venueCapacity: data.venueCapacity ?? null,
			bookingOpensAt: openingInputOf(data.event),
			bookingClosesHoursBefore: data.event?.bookingClosesHoursBefore ?? null,
		}));
	}

	/** Back to the saved Days, Seatings and Booking Window — a published
	 * Event's « Annuler » (issue 020): the editor's drafts, the meals set
	 * aside and the placeholder ids go with them. A save keeps the drafts
	 * (`adoptSaved`). */
	export function restore() {
		refused = false;
		dropped = new Map();
		placeholders = new Map();
		days = pickedDaysOf(data.days);
		services = toSeatingDrafts(data.schedule ?? []);
		venueCapacity = data.venueCapacity ?? null;
		kept = null;
		programme.reinfer();
		bookingOpensAt = openingInputOf(data.event);
		bookingClosesHoursBefore = data.event?.bookingClosesHoursBefore ?? null;
	}

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it as it is typed (issue 021). */
	export function warningValues(): SeatingsValues {
		return { services, bookingOpensAt, bookingClosesHoursBefore };
	}
</script>

<!-- Why a Draft's autosave is held back (issue 019). -->
<div aria-live="polite">
	{#if shownBlocking}
		{@const field = shownBlocking}
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
			<p><span class="font-medium">Non enregistré :</span> {field.message}</p>
			<button type="button" onclick={() => focusField(field)} class="underline underline-offset-2 hover:text-red-900 transition-colors cursor-pointer">
				Corriger
			</button>
		</div>
	{/if}
</div>

<form data-editor-form="seatings" method="POST" action="?/saveSeatings" use:enhance={saveSeatingsEnhance} novalidate class="space-y-8">
	<!-- Days & meals: the Event's dates are derived from its Days (ADR 0005) -->
	<input type="hidden" name="days" value={JSON.stringify(days)} />
	<input type="hidden" name="serviceRefs" value={serviceRefs} />
	<input type="hidden" name="venueCapacity" value={venueCapacity ?? ''} />

	{#if kept}
		<p class="flex flex-wrap items-baseline gap-x-3 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm" role="status">
			<span>Gardée{kept.includes(',') ? 's' : ''}, car déjà réservée{kept.includes(',') ? 's' : ''} : séance de {kept}. Annulez d’abord ses réservations.</span>
			<button type="button" onclick={() => (kept = null)} class="underline underline-offset-2 cursor-pointer">OK</button>
		</p>
	{/if}

	<ProgrammeEditor bind:this={schedule} {programme} {words} idPrefix="seatings-programme">
		{#snippet programmeExtra()}
			<div class="flex flex-wrap items-end gap-x-4 gap-y-1">
				<div>
					<label for="venue-capacity" class="block text-xs font-medium text-foreground-alt mb-1">Places par séance</label>
					<div class="relative">
						<Users size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<input
							id="venue-capacity"
							type="number"
							inputmode="numeric"
							min="1"
							max="10000"
							step="1"
							placeholder="Sans limite"
							bind:value={venueCapacity}
							aria-describedby="venue-capacity-help"
							class="w-36 pl-9 pr-3 py-2 border border-border-input rounded-lg bg-background text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
						/>
					</div>
				</div>
				<p id="venue-capacity-help" class="pb-2 text-xs text-muted-foreground">Capacité du lieu, pour chaque séance. Vide : sans limite.</p>
			</div>
		{/snippet}
	</ProgrammeEditor>

	<!-- The payload and its checks; every field is on the programme above -->
	<SeatingsEditor bind:this={editor} bind:services bind:venueCapacity {timeZone} layout="none" />

	<!-- Booking Window (issue 035): both optional; empty keeps bookings open
	     from publication until each Seating starts. -->
	<section class="bg-background rounded-lg border border-border-card p-4 lg:p-6" aria-labelledby="booking-window-title">
		<h3 id="booking-window-title" class="text-lg font-semibold text-foreground">Ouverture des réservations</h3>
		<p class="text-sm text-muted-foreground">
			Laissez vide pour ouvrir les réservations dès la publication et les fermer au début de chaque séance.
		</p>
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<div>
				<label for="booking-opens-at" class="block text-xs font-medium text-foreground-alt mb-1">
					Ouverture (heure de l’événement, {data.event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE})
				</label>
				<input
					id="booking-opens-at"
					name="bookingOpensAt"
					type="datetime-local"
					bind:value={bookingOpensAt}
					aria-describedby="booking-opens-at-help"
					class="w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
				<p id="booking-opens-at-help" class="mt-1 text-xs text-muted-foreground">
					Avant cette date, les séances et les prix sont affichés, sans réservation ni liste d’attente.
				</p>
			</div>
			<div>
				<label for="booking-closes-hours" class="block text-xs font-medium text-foreground-alt mb-1">
					Clôture (heures avant chaque séance)
				</label>
				<input
					id="booking-closes-hours"
					name="bookingClosesHoursBefore"
					type="number"
					inputmode="numeric"
					min="0"
					max="8760"
					step="1"
					placeholder="0"
					bind:value={bookingClosesHoursBefore}
					aria-describedby="booking-closes-hours-help"
					class="w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
				/>
				<p id="booking-closes-hours-help" class="mt-1 text-xs text-muted-foreground">
					Par exemple 24 : les réservations d’une séance ferment la veille, à la même heure.
				</p>
			</div>
		</div>
	</section>

	<!-- Hidden on a Draft, which saves itself (issue 019), and on a published
	     Event, which saves through its bar (issue 020). -->
	<div data-editor-save class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
		<button
			type="submit"
			disabled={saving}
			class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
		>
			{saving ? 'Enregistrement…' : 'Enregistrer les jours et séances'}
		</button>
	</div>
</form>
