<script lang="ts">
	// « Essentiel » tab (issue 036): titles, subtitles and descriptions —
	// nothing required (ADR 0008) — and the Internal Notes (issue 039).
	// Saved with `updateEvent`, which only touches the fields posted here.
	// The Visibility, Spotlight and Portfolio are a
	// « Publication » control of their own (ADR 0010): posted to their own
	// action the moment they change, so saving the text above — or any later
	// autosave of it — can never publish the Event.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import { keepEdits } from '$lib/utils/editor-refresh';
	import Modal from '$lib/components/ui/Modal.svelte';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';
	import { Type, FileText, Lock } from 'lucide-svelte';
	import { VISIBILITIES, VISIBILITY_LABELS, canBeSpotlight, canJoinPortfolio, type Visibility } from '$lib/utils/event-access';
	import type { EventWarning } from '$lib/utils/event-warnings';
	import type { EssentielValues } from '$lib/utils/event-warnings-live';

	let {
		event,
		lastSeatingStart = null,
		warnings = [],
	}: {
		event: EditorEvent;
		/** Start of the Event's last Seating, for the Portfolio rule (issue 044). */
		lastSeatingStart?: Date | string | null;
		/** What is missing for publishing (issue 038), for the confirmation
		 * shown when the Event leaves Brouillon. */
		warnings?: EventWarning[];
	} = $props();

	const toast = getToastContext();
	let saving = $state(false);

	// The English may have been generated from the French on save: it is
	// taken back, unless edited since the save started (issue 018).
	const english = () => ({ titleEn, subtitleEn, descriptionEn });
	function saveEnhance() {
		saving = true;
		const sent = english();
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées', formElement, () => {
				({ titleEn, subtitleEn, descriptionEn } = keepEdits(sent, english(), {
					titleEn: event?.titleEn ?? '',
					subtitleEn: event?.subtitleEn ?? '',
					descriptionEn: event?.descriptionEn ?? '',
				}));
			});
		};
	}

	let titleEn = $state(event?.titleEn ?? "");
	let titleFr = $state(event?.titleFr ?? "");
	let descriptionEn = $state(event?.descriptionEn ?? "");
	let descriptionFr = $state(event?.descriptionFr ?? "");
	let subtitleEn = $state(event?.subtitleEn ?? "");
	let subtitleFr = $state(event?.subtitleFr ?? "");
	let internalNotes = $state(event?.internalNotes ?? "");

	// --- Publication (ADR 0010) ------------------------------------------
	// Choosing a Visibility, or toggling Spotlight or Portfolio, saves at
	// once through its own action; the text form above never posts them.
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
		canJoinPortfolio({ visibility, isPortfolio, lastSeatingStart: lastSeatingStart ? new Date(lastSeatingStart) : null }, new Date())
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

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it as it is typed (issue 021). */
	export function warningValues(): EssentielValues {
		return { titleEn, titleFr, descriptionEn, descriptionFr };
	}
</script>

<div class="space-y-6">
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<form method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
			<div>
				<label for="titleFr" class="block text-sm font-medium text-foreground-alt mb-2">Titre</label>
				<div class="relative">
					<Type size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input id="titleFr" name="titleFr" type="text" bind:value={titleFr} placeholder="Festival de musique d'été 2026" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
				</div>
			</div>
			<div>
				<label for="subtitleFr" class="block text-sm font-medium text-foreground-alt mb-2">Sous-titre (Optionnel)</label>
				<div class="relative">
					<FileText size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input id="subtitleFr" name="subtitleFr" type="text" bind:value={subtitleFr} placeholder="Une courte phrase accrocheuse pour l'événement..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
				</div>
			</div>
			<div>
				<label for="descriptionFr" class="block text-sm font-medium text-foreground-alt mb-2">Description</label>
				<div class="relative">
					<FileText size={18} class="absolute left-3 top-3 text-muted-foreground" />
					<textarea id="descriptionFr" name="descriptionFr" bind:value={descriptionFr} rows="5" placeholder="Décrivez votre événement..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"></textarea>
				</div>
			</div>

			<EnglishVersion>
				<div>
					<label for="titleEn" class="block text-sm font-medium text-foreground-alt mb-2">Titre (Anglais)</label>
					<div class="relative">
						<Type size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input id="titleEn" name="titleEn" type="text" bind:value={titleEn} placeholder="Summer Music Festival 2026" class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
					</div>
				</div>
				<div>
					<label for="subtitleEn" class="block text-sm font-medium text-foreground-alt mb-2">Sous-titre (Anglais)</label>
					<div class="relative">
						<FileText size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input id="subtitleEn" name="subtitleEn" type="text" bind:value={subtitleEn} placeholder="A short tagline for the event..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent" />
					</div>
				</div>
				<div>
					<label for="descriptionEn" class="block text-sm font-medium text-foreground-alt mb-2">Description (Anglais)</label>
					<div class="relative">
						<FileText size={18} class="absolute left-3 top-3 text-muted-foreground" />
						<textarea id="descriptionEn" name="descriptionEn" bind:value={descriptionEn} rows="5" placeholder="Describe your event..." class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"></textarea>
					</div>
				</div>
			</EnglishVersion>

			<!-- Notes internes (issue 039): only Admins ever see them -->
			<div>
				<label for="internalNotes" class="block text-sm font-medium text-foreground-alt mb-2">
					Notes internes (Optionnel)
				</label>
				<div class="relative">
					<Lock
						size={18}
						class="absolute left-3 top-3 text-muted-foreground"
					/>
					<textarea
						id="internalNotes"
						name="internalNotes"
						bind:value={internalNotes}
						rows="4"
						aria-describedby="internalNotesHint"
						placeholder="Contact du lieu, client, budget…"
						class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
					></textarea>
				</div>
				<p id="internalNotesHint" class="mt-1 text-xs text-muted-foreground">
					Visibles des seuls administrateurs : jamais montrées aux invités ni à l’équipe.
				</p>
			</div>

			<!-- Hidden on a Draft, which saves itself (issue 018). -->
			<div data-editor-save class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
				<button
					type="submit"
					disabled={saving}
					class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
				>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</div>
		</form>
	</div>

	<!-- Publication (ADR 0010): every choice saves at once, on its own —
	     never with the text above. Not a unit of the editor's save
	     controller (`data-editor-skip`): its changes are saved here, so they
	     never mark the tab modified nor wait for « Enregistrer ». -->
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<form bind:this={publicationFormEl} method="POST" action="?/updatePublication" use:enhance={publicationEnhance} data-editor-skip class="space-y-6">
			<div>
				<h2 class="text-lg font-semibold text-foreground mb-1">
					Publication
					{#if publishing}
						<span class="text-sm font-normal text-muted-foreground" aria-live="polite">— enregistrement…</span>
					{/if}
				</h2>
				<p class="text-xs text-muted-foreground">
					Chaque choix de visibilité, de mise à la une ou de Portfolio s’enregistre à l’instant, indépendamment du reste de cet onglet.
				</p>
			</div>

			<!-- Visibility (issue 032): taking an Event out of Brouillon publishes it -->
			<fieldset class="p-4 bg-muted rounded-lg">
				<legend class="sr-only">Visibilité</legend>
				<p class="block text-sm font-medium text-foreground mb-3" aria-hidden="true">Visibilité</p>
				<div class="grid gap-3 sm:grid-cols-3">
					{#each VISIBILITIES as option (option)}
						<label class="flex items-start gap-3 cursor-pointer">
							<input
								type="radio"
								name="visibility"
								value={option}
								bind:group={visibility}
								onchange={() => chooseVisibility(option)}
								class="mt-0.5 w-4 h-4 text-foreground border-border-input focus:ring-foreground"
							/>
							<span>
								<span class="block text-sm font-medium text-foreground">{VISIBILITY_LABELS[option]}</span>
								<span class="block text-xs text-muted-foreground">{VISIBILITY_HINTS[option]}</span>
							</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<!-- Spotlight Status -->
			<div class="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
				<input
					id="isSpotlight"
					name="isSpotlight"
					type="checkbox"
					bind:checked={isSpotlight}
					value="true"
					disabled={!spotlightAllowed}
					onchange={() => publicationFormEl?.requestSubmit()}
					class="w-5 h-5 text-amber-900 border-amber-300 rounded focus:ring-amber-900 disabled:opacity-50"
				/>
				<div>
					<label for="isSpotlight" class="block text-sm font-medium text-amber-900 cursor-pointer">
						Marquer comme Événement à la Une
					</label>
					<p class="text-xs text-amber-600">
						Les événements à la une sont mis en avant sur le site. Un seul événement peut être à la une à la fois.
						{#if !spotlightAllowed}Seul un événement Public peut être à la une.{/if}
					</p>
				</div>
			</div>

			<!-- Portfolio Status -->
			<div class="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
				<input
					id="isPortfolio"
					name="isPortfolio"
					type="checkbox"
					bind:checked={isPortfolio}
					value="true"
					disabled={!portfolioJoinable}
					onchange={() => publicationFormEl?.requestSubmit()}
					class="w-5 h-5 text-indigo-900 border-indigo-300 rounded focus:ring-indigo-900 disabled:opacity-50"
				/>
				<div>
					<label for="isPortfolio" class="block text-sm font-medium text-indigo-900 cursor-pointer">
						Inclure dans la galerie Portfolio
					</label>
					<p class="text-xs text-indigo-600">
						Les événements du Portfolio apparaissent dans « Projets » et la galerie de la page d’accueil, les plus récents d’abord ; sa page présente alors le projet — récap et photos de l’événement, à renseigner dans l’onglet « Portfolio ».
						{#if !portfolioJoinable}
							{#if lastSeatingStart}
								Un événement ne rejoint le Portfolio qu’une fois sa dernière séance commencée, prévue le {new Date(lastSeatingStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
							{:else}
								Un événement ne rejoint le Portfolio qu’une fois sa dernière séance commencée ; celui-ci n’a pas encore de séance.
							{/if}
						{/if}
					</p>
				</div>
			</div>

			<!-- Every choice saves on its own; this button only serves
			     keyboards, screen readers and a page without JavaScript. -->
			<button type="submit" class="sr-only">Enregistrer la publication</button>
		</form>
	</div>
</div>

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
