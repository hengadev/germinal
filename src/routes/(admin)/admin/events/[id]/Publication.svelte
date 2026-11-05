<script lang="ts">
	// « Publication » control (ADR 0010, issue 077): Visibility, Spotlight
	// and Portfolio, posted to their own action the moment they change.
	// It lives in the editor's header, reachable from every tab — in one
	// of three toggleable looks (`?pub=a|b|c`, default a):
	//   a — a status pill that opens the full controls in a popover;
	//   b — an inline segmented control with small toggles under it;
	//   c — a slim sticky bar under the header row.
	// Not a unit of the editor's save controller (`data-editor-skip`): its
	// changes are saved here, never marking a tab modified.
	import { enhance } from '$app/forms';
	import { Popover } from 'bits-ui';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import { Sparkles, LayoutGrid } from 'lucide-svelte';
	import {
		VISIBILITIES,
		VISIBILITY_LABELS,
		canBeSpotlight,
		canJoinPortfolio,
		type Visibility,
	} from '$lib/utils/event-access';
	import type { EventWarning } from '$lib/utils/event-warnings';

	let {
		event,
		lastSeatingStart = null,
		warnings = [],
		variant = 'a',
	}: {
		event: EditorEvent;
		/** Start of the Event's last Seating, for the Portfolio rule (issue 044). */
		lastSeatingStart?: Date | string | null;
		/** What is missing for publishing (issue 038), for the confirmation
		 * shown when the Event leaves Brouillon. */
		warnings?: EventWarning[];
		variant?: 'a' | 'b' | 'c';
	} = $props();

	const uid = $props.id();

	const toast = getToastContext();
	let publicationFormEl: HTMLFormElement | undefined = $state();
	let publishing = $state(false);
	let visibility = $state<Visibility>(event?.visibility ?? 'draft');
	let isSpotlight = $state(event?.isSpotlight ?? false);
	let isPortfolio = $state(event?.isPortfolio ?? false);

	// Only a Public Event can be the Spotlight: choosing Brouillon or Privé
	// clears it (issue 032).
	const spotlightAllowed = $derived(canBeSpotlight({ visibility }));

	// The Portfolio (issue 044): an Event joins it only once its last
	// Seating has started — until then the choice is the server's to refuse.
	const portfolioJoinable = $derived(
		canJoinPortfolio(
			{ visibility, isPortfolio, lastSeatingStart: lastSeatingStart ? new Date(lastSeatingStart) : null },
			new Date()
		)
	);

	const VISIBILITY_HINTS: Record<Visibility, string> = {
		draft: 'Visible des seuls administrateurs. Sa page publique répond « introuvable ».',
		private: 'Visible et réservable par toute personne ayant son lien, mais jamais listé, ni indexé, ni mis à la une.',
		public: 'Visible et réservable par tous ; peut être mis à la une.',
	};

	// Back to what is saved — after a refused Publication save (the page
	// data was never refreshed) or a cancelled publishing.
	function resetPublication() {
		visibility = event?.visibility ?? 'draft';
		isSpotlight = event?.isSpotlight ?? false;
		isPortfolio = event?.isPortfolio ?? false;
	}

	// Publishing confirmation (issue 038, ADR 0008): taking a Brouillon out
	// of Draft with points missing asks first (« Publier quand même » /
	// « Annuler »); with nothing missing, it goes straight through.
	let publishDialogOpen = $state(false);
	let publishConfirmed = $state(false);
	let publishDialogWasOpen = false;

	// Closing the dialog without publishing (Annuler, Échap) leaves the
	// Event a Brouillon, as it was. The confirmation flag is consumed here:
	// « Publier quand même » closes the dialog and submits, so the revert
	// must not run for that close.
	$effect(() => {
		if (publishDialogOpen) {
			publishDialogWasOpen = true;
			return;
		}
		if (publishDialogWasOpen && !publishConfirmed) {
			visibility = event?.visibility ?? 'draft';
		}
		publishDialogWasOpen = false;
		publishConfirmed = false;
	});

	function chooseVisibility(option: Visibility) {
		visibility = option;
		// Clearing the Spotlight with the Visibility (issue 032) applies to
		// this save, not on the next render.
		if (!canBeSpotlight({ visibility: option })) isSpotlight = false;
		publicationFormEl?.requestSubmit();
	}

	function publicationEnhance({
		formData,
		cancel,
	}: {
		formData: FormData;
		cancel: () => void;
	}) {
		if (
			!publishConfirmed &&
			event?.visibility === 'draft' &&
			visibility !== 'draft' &&
			warnings.length > 0
		) {
			cancel();
			publishDialogOpen = true;
			return;
		}
		// The control's state, not the DOM, decides what is posted: the
		// radios and checkboxes may not have re-rendered yet when the change
		// submits the form.
		formData.set('visibility', visibility);
		formData.set('isSpotlight', spotlightAllowed && isSpotlight ? 'true' : 'false');
		formData.set('isPortfolio', isPortfolio ? 'true' : 'false');
		publishing = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			publishing = false;
			// No form passed: this save is not the save controller's to hear.
			await handleTabResult(result, toast, 'Publication enregistrée');
			// Follow what the server saved — or, after a refusal, what is
			// still saved — not what was clicked.
			resetPublication();
		};
	}

	function publishAnyway() {
		publishDialogOpen = false;
		publishConfirmed = true;
		publicationFormEl?.requestSubmit();
	}

	function cancelPublish() {
		publishDialogOpen = false;
	}
</script>

{#snippet segmentOptions(compact = false)}
	{#each VISIBILITIES as option, i (option)}
		<label
			for="{uid}-visibility-{option}"
			class="flex-1 flex items-center justify-center gap-1.5 px-3 {compact ? 'py-1' : 'py-1.5'} text-sm font-medium cursor-pointer
				border border-border-input {i === 0 ? 'rounded-l-md' : ''} {i === VISIBILITIES.length - 1 ? 'rounded-r-md' : ''} {i > 0 ? '-ml-px' : ''} whitespace-nowrap transition-colors
				{visibility === option ? 'bg-foreground text-background z-10' : 'bg-background text-foreground-alt hover:bg-muted'}"
			title={VISIBILITY_HINTS[option]}
		>
			<input
				id="{uid}-visibility-{option}"
				type="radio"
				name="visibility"
				form="{uid}-publication"
				value={option}
				bind:group={visibility}
				onchange={() => chooseVisibility(option)}
				class="sr-only"
			/>
			{VISIBILITY_LABELS[option]}
		</label>
	{/each}
{/snippet}

{#snippet toggles(compact = false)}
	<!-- Spotlight Status (amber) -->
	<label
		for="{uid}-isSpotlight"
		class="flex items-center gap-2 {compact ? 'text-xs' : 'text-sm'} text-amber-900 cursor-pointer"
	>
		<input
			id="{uid}-isSpotlight"
			name="isSpotlight"
			form="{uid}-publication"
			type="checkbox"
			bind:checked={isSpotlight}
			value="true"
			disabled={!spotlightAllowed}
			onchange={() => publicationFormEl?.requestSubmit()}
			class="w-4 h-4 text-amber-900 border-amber-300 rounded focus:ring-amber-900 disabled:opacity-50"
		/>
		<Sparkles size={14} aria-hidden="true" class="text-amber-500" />
		<span>À la une</span>
		{#if !spotlightAllowed}
			<span class="text-amber-600">(public seulement)</span>
		{/if}
	</label>
	<!-- Portfolio Status (indigo) -->
	<label
		for="{uid}-isPortfolio"
		class="flex items-center gap-2 {compact ? 'text-xs' : 'text-sm'} text-indigo-900 cursor-pointer"
	>
		<input
			id="{uid}-isPortfolio"
			name="isPortfolio"
			form="{uid}-publication"
			type="checkbox"
			bind:checked={isPortfolio}
			value="true"
			disabled={!portfolioJoinable}
			onchange={() => publicationFormEl?.requestSubmit()}
			class="w-4 h-4 text-indigo-900 border-indigo-300 rounded focus:ring-indigo-900 disabled:opacity-50"
		/>
		<LayoutGrid size={14} aria-hidden="true" class="text-indigo-500" />
		<span>Portfolio</span>
		{#if !portfolioJoinable}
			<span class="text-indigo-600">(après la dernière séance)</span>
		{/if}
	</label>
{/snippet}

{#snippet formBody(compact = false)}
	<!-- The controls post through the one form below (`form=`), which stays
	     mounted when the popover closes — « Publier quand même » submits it
	     after the confirmation dialog has taken the popover's place. -->
	<div class="flex {compact ? 'flex-col sm:flex-row sm:items-center gap-2 sm:gap-4' : 'flex-col gap-3'}">
		{#if compact}
			<div class="flex items-center gap-2" role="group" aria-label="Visibilité">
				<div class="inline-flex rounded-md overflow-hidden w-full sm:w-auto">
					{@render segmentOptions(true)}
				</div>
				{#if publishing}<span class="text-xs text-muted-foreground" aria-live="polite">Enregistrement…</span>{/if}
			</div>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				{@render toggles(true)}
			</div>
		{:else}
			<fieldset>
				<legend class="sr-only">Visibilité</legend>
				<div class="flex rounded-md overflow-hidden border border-border-input">
					{@render segmentOptions(false)}
				</div>
			</fieldset>
			<div class="flex flex-col gap-2">
				{@render toggles(false)}
			</div>
		{/if}
	</div>
{/snippet}

<!-- The control's state, not the DOM, decides what is posted (see
     publicationEnhance), so the form itself holds no field. -->
<form
	id="{uid}-publication"
	bind:this={publicationFormEl}
	method="POST"
	action="?/updatePublication"
	use:enhance={publicationEnhance}
	data-editor-skip
	hidden
></form>

{#if variant === 'a'}
	<!-- A — status pill + popover -->
	<Popover.Root>
		<Popover.Trigger
			class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-input bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
			title="Publication — modifier la visibilité, la mise à la une, le Portfolio"
		>
			<span
				aria-hidden="true"
				class="inline-block size-2 rounded-full {visibility === 'public' ? 'bg-green-600' : visibility === 'private' ? 'bg-amber-500' : 'bg-muted-foreground/50'}"
			></span>
			{VISIBILITY_LABELS[visibility]}
			{#if spotlightAllowed && isSpotlight}<Sparkles size={13} aria-hidden="true" class="text-amber-500" aria-label="À la une" />{/if}
			{#if isPortfolio}<LayoutGrid size={13} aria-hidden="true" class="text-indigo-500" aria-label="Portfolio" />{/if}
			{#if publishing}<span class="text-xs text-muted-foreground" aria-live="polite">…</span>{/if}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				side="bottom"
				align="end"
				sideOffset={8}
				aria-label="Publication"
				class="back-office z-[10000] w-[min(26rem,calc(100vw-2rem))] border border-border-input rounded-lg p-4 bg-background shadow-lg"
			>
				<p class="text-base font-semibold text-foreground mb-1">
					Publication
					{#if publishing}
						<span class="text-sm font-normal text-muted-foreground" aria-live="polite">— enregistrement…</span>
					{/if}
				</p>
				<p class="text-xs text-muted-foreground mb-3">
					Chaque choix s’enregistre à l’instant, indépendamment du reste de l’événement.
				</p>
				<div class="space-y-3">
					{@render formBody(false)}
					<p class="text-xs text-muted-foreground">
						{VISIBILITY_HINTS[visibility]}
						{#if !portfolioJoinable}
							{#if lastSeatingStart}
								Un événement ne rejoint le Portfolio qu’une fois sa dernière séance commencée, prévue le {new Date(lastSeatingStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
							{:else}
								Un événement ne rejoint le Portfolio qu’une fois sa dernière séance commencée ; celui-ci n’a pas encore de séance.
							{/if}
						{/if}
					</p>
				</div>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{:else if variant === 'b'}
	<!-- B — inline segmented control + small toggles -->
	<div class="flex flex-col items-start sm:items-end gap-2">
		<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publication</p>
		{@render formBody(true)}
	</div>
{:else}
	<!-- C — slim sticky bar under the header row -->
	<div class="-mx-1 px-1 py-2 bg-background border-b border-border-card">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Publication
				{#if publishing}<span class="normal-case text-muted-foreground" aria-live="polite">— enregistrement…</span>{/if}
			</p>
			{@render formBody(true)}
		</div>
	</div>
{/if}

<!-- Publishing confirmation (issue 038, ADR 0008): leaving Brouillon with
     points missing shows them here; the Admin decides (ADR 0008). -->
<Modal
	bind:isOpen={publishDialogOpen}
	title="Publier cet événement ?"
	description="Avant de quitter le brouillon, il reste des points à vérifier :"
>
	<ul class="my-2 space-y-1.5 text-sm text-foreground-alt list-disc pl-5">
		{#each warnings as warning, i (i)}
			<li>{warning.message}</li>
		{/each}
	</ul>
	<p class="text-sm text-muted-foreground">
		Publier reste possible : rien n’est bloquant, la décision vous appartient.
	</p>
	<div class="flex justify-end gap-3 mt-4">
		<button
			type="button"
			onclick={cancelPublish}
			class="px-4 py-2 text-sm font-medium text-foreground-alt bg-background border border-border-card rounded-lg hover:bg-surface transition-colors"
		>
			Annuler
		</button>
		<button
			type="button"
			onclick={publishAnyway}
			class="px-4 py-2 text-sm font-medium text-background bg-foreground rounded-lg hover:opacity-90 transition-colors"
		>
			Publier quand même
		</button>
	</div>
</Modal>
