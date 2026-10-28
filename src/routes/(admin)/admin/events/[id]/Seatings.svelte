<script lang="ts">
	// « Séances » tab: the Days picker and the shared Seatings editor
	// (issue 019/020/021) in one form, saved with the `saveSeatings` action.
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
	import DaysServicesPicker, { type PickedDay } from '$lib/components/admin/DaysServicesPicker.svelte';
	import SeatingsEditor, {
		newSeatingService,
		toSeatingDrafts,
		type DraftSeatingService,
	} from '$lib/components/admin/SeatingsEditor.svelte';
	import type { EditorService } from '$lib/types/seatings-editor';
	import { clockOf, dayOf, DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';
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
	let daysPicker: ReturnType<typeof DaysServicesPicker> | undefined = $state();
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
	function pickedDaysError(): string | null {
		if (days.length === 0 && (data.days?.length ?? 0) > 0 && data.event?.visibility !== 'draft') {
			return 'Sélectionnez au moins un jour sur le calendrier.';
		}
		if (days.some((day) => day.kinds.length === 0)) {
			return 'Cochez au moins un repas (déjeuner ou dîner) pour chaque jour sélectionné.';
		}
		return null;
	}

	/** The first thing that keeps the tab from saving; `id: null` is the
	 * Days picker. */
	function blockingField(): { id: string | null; message: string } | null {
		const dayError = pickedDaysError();
		if (dayError !== null) return { id: null, message: dayError };
		return editor?.firstBlockingField() ?? null;
	}

	function focusField(field: { id: string | null }) {
		if (field.id === null) daysPicker?.focus();
		else document.getElementById(field.id)?.focus();
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
	<DaysServicesPicker bind:this={daysPicker} bind:days idPrefix="event-days" {timeZone} />

	<input type="hidden" name="serviceRefs" value={serviceRefs} />
	<SeatingsEditor bind:this={editor} bind:services bind:venueCapacity {timeZone} />

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
