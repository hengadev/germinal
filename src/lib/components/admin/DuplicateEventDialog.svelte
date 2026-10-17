<script lang="ts">
	// « Dupliquer » (issue 046): asks for the copy's Days first — the Days
	// picker, each new Day pre-ticked with the meals the source serves —
	// then creates the Draft « Copie de … » and opens it. Used by the
	// Events list and the Event page; both post to the list's action.
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '$lib/components/ui/Modal.svelte';
	import DaysServicesPicker, { type PickedDay, type PickerServiceKind } from './DaysServicesPicker.svelte';
	import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';

	let {
		isOpen = $bindable(false),
		eventId,
		eventTitle,
		servedKinds = [],
		timeZone = DEFAULT_EVENT_TIME_ZONE,
	}: {
		isOpen?: boolean;
		eventId: string | null;
		eventTitle: string;
		/** The meals the source serves, pre-ticked on each new Day. */
		servedKinds?: PickerServiceKind[];
		timeZone?: string;
	} = $props();

	let days: PickedDay[] = $state([]);
	let error: string | null = $state(null);
	let submitting = $state(false);

	// Each opening starts from no Day picked.
	$effect(() => {
		if (isOpen) {
			days = [];
			error = null;
		}
	});

	function duplicateEnhance() {
		submitting = true;
		return async ({ result }: { result: ActionResult }) => {
			submitting = false;
			if (result.type === 'redirect') {
				isOpen = false;
				await goto(result.location);
			} else if (result.type === 'failure') {
				error = (result.data as { error?: string } | undefined)?.error ?? 'La duplication de l’événement a échoué.';
			} else if (result.type === 'error') {
				error = 'La duplication de l’événement a échoué.';
			}
		};
	}
</script>

<Modal
	bind:isOpen
	title="Dupliquer l’événement"
	description="Choisissez les jours de la copie de « {eventTitle} ». Elle reprend les textes, le lieu, les menus, les tarifs, l’acompte, la politique de remboursement et le programme ; chaque déjeuner et dîner reçoit les séances du premier déjeuner ou dîner de l’original. La copie est un brouillon, sans visuels, photos, réservations, codes promo, tâches ni équipe."
>
	<form method="POST" action="/admin/events?/duplicateEvent" use:enhance={duplicateEnhance} class="space-y-6">
		<input type="hidden" name="id" value={eventId ?? ''} />
		<DaysServicesPicker bind:days idPrefix="duplicate-days" {timeZone} defaultKinds={servedKinds} />

		{#if error}
			<p role="alert" class="text-sm font-medium text-red-700">{error}</p>
		{/if}

		<div class="flex w-full justify-end gap-3">
			<button
				type="button"
				onclick={() => (isOpen = false)}
				class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium"
			>
				Annuler
			</button>
			<button
				type="submit"
				disabled={submitting || days.length === 0}
				class="px-6 py-2.5 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{submitting ? 'Duplication…' : 'Créer la copie'}
			</button>
		</div>
	</form>
</Modal>
