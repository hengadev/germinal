<script lang="ts">
	// « Séances » tab: the Days picker and the shared Seatings editor
	// (issue 019/020/021) in one form, saved with the `saveSeatings` action.
	// The Seatings follow the picked Days and meals live, as on the
	// new-event form: a meal picked here before saving gets a placeholder
	// id, which `serviceRefs` maps to its Day and meal for the server.
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import DaysServicesPicker, { type PickedDay } from '$lib/components/admin/DaysServicesPicker.svelte';
	import SeatingsEditor, {
		newSeatingService,
		toSeatingDrafts,
		type DraftSeatingService,
	} from '$lib/components/admin/SeatingsEditor.svelte';
	import type { EditorService } from '$lib/types/seatings-editor';

	let {
		data,
		isNew = false,
		timeZone = data.event?.timeZone,
		services = $bindable(toSeatingDrafts(data.schedule ?? [])),
		extend,
	}: {
		data: {
			days?: PickedDay[];
			schedule?: EditorService[];
			venueCapacity?: number | null;
			event?: { timeZone?: string } | null;
		};
		/** A new Event (issue 036): no Day is required, and the first save
		 * creates the Draft. */
		isNew?: boolean;
		/** Clock the Seatings are typed on; a new Event follows the Lieu pick. */
		timeZone?: string;
		services?: DraftSeatingService[];
		/** Adds other tabs' fields to the posted form (new Event). */
		extend?: (formData: FormData) => void;
	} = $props();

	const toast = getToastContext();

	function pickedDaysOf(source: PickedDay[] | undefined): PickedDay[] {
		return (source ?? []).map((day) => ({ date: day.date, kinds: [...day.kinds] }));
	}

	let days: PickedDay[] = $state(pickedDaysOf(data.days));
	let daysPicker: ReturnType<typeof DaysServicesPicker> | undefined = $state();
	let venueCapacity: number | null = $state(data.venueCapacity ?? null);
	let saving = $state(false);
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
	function pickedDaysError(): string | null {
		if (days.length === 0 && !isNew) {
			return 'Sélectionnez au moins un jour sur le calendrier.';
		}
		if (days.some((day) => day.kinds.length === 0)) {
			return 'Cochez au moins un repas (déjeuner ou dîner) pour chaque jour sélectionné.';
		}
		return null;
	}

	function saveSeatingsEnhance({ formData, cancel }: { formData: FormData; cancel: () => void }) {
		const dayError = pickedDaysError();
		if (dayError !== null) {
			cancel();
			toast.error('Erreur', dayError);
			requestAnimationFrame(() => daysPicker?.focus());
			return;
		}
		const blocking = editor?.firstBlockingField() ?? null;
		if (blocking) {
			cancel();
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		extend?.(formData);
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			saving = false;
			if (result.type === 'redirect') {
				// First save of a new Event: on to the Draft's page.
				toast.success('Succès', 'Brouillon créé.');
				await goto(result.location, { invalidateAll: true });
			} else if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Séances enregistrées');
				await invalidateAll();
				dropped = new Map();
				placeholders = new Map();
				days = pickedDaysOf(data.days);
				services = toSeatingDrafts(data.schedule ?? []);
				venueCapacity = data.venueCapacity ?? null;
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			} else if (result.type === 'error') {
				toast.error('Erreur', 'Une erreur est survenue');
			}
		};
	}
</script>

<form id="event-seatings-form" method="POST" action="?/saveSeatings" use:enhance={saveSeatingsEnhance} novalidate class="space-y-8">
	<!-- Days & meals: the Event's dates are derived from its Days (ADR 0005) -->
	<DaysServicesPicker bind:this={daysPicker} bind:days idPrefix="event-days" {timeZone} />

	<input type="hidden" name="serviceRefs" value={serviceRefs} />
	<SeatingsEditor bind:this={editor} bind:services bind:venueCapacity {timeZone} />

	<div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
		<button
			type="submit"
			disabled={saving}
			class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
		>
			{saving ? 'Enregistrement…' : 'Enregistrer les jours et séances'}
		</button>
	</div>
</form>
