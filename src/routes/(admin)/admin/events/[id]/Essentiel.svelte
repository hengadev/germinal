<script lang="ts">
	// « Essentiel » tab (issue 036): titles, subtitles and descriptions —
	// nothing required (ADR 0008) — and, on a saved Event, its Visibility,
	// Spotlight and Portfolio. Saved with `updateEvent`, which only touches
	// the fields posted here.
	import { enhance } from '$app/forms';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Type, FileText } from 'lucide-svelte';
	import { VISIBILITIES, VISIBILITY_LABELS, canBeSpotlight, canJoinPortfolio, type Visibility } from '$lib/utils/event-access';
	import type { EventWarning } from '$lib/utils/event-warnings';

	let {
		event,
		lastSeatingStart = null,
		warnings = [],
	}: {
		event: EditorEvent | null;
		/** Start of the Event's last Seating, for the Portfolio rule (issue 044). */
		lastSeatingStart?: Date | string | null;
		/** What is missing for publishing (issue 038), for the confirmation
		 * shown when the Event leaves Brouillon. */
		warnings?: EventWarning[];
	} = $props();

	const toast = getToastContext();
	let saving = $state(false);

	// Publishing confirmation (issue 038, ADR 0008): taking a Brouillon out
	// of Draft with points missing asks first (« Publier quand même » /
	// « Annuler »); with nothing missing, it goes straight through.
	let formEl: HTMLFormElement | undefined = $state();
	let publishDialogOpen = $state(false);
	let publishConfirmed = $state(false);
	let publishDialogWasOpen = false;

	// Closing the dialog without publishing (Annuler, Échap) leaves the
	// Event in Brouillon, as it was.
	$effect(() => {
		if (publishDialogOpen) {
			publishDialogWasOpen = true;
			return;
		}
		if (publishDialogWasOpen && !publishConfirmed) {
			visibility = 'draft';
		}
		publishDialogWasOpen = false;
	});

	function saveEnhance({ cancel }: { cancel: () => void }) {
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
		saving = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			publishConfirmed = false;
			saving = false;
			await handleTabResult(result, toast, 'Modifications enregistrées');
		};
	}

	function publishAnyway() {
		publishDialogOpen = false;
		publishConfirmed = true;
		formEl?.requestSubmit();
	}

	function cancelPublish() {
		publishDialogOpen = false;
	}

	let titleEn = $state(event?.titleEn ?? "");
	let titleFr = $state(event?.titleFr ?? "");
	let descriptionEn = $state(event?.descriptionEn ?? "");
	let descriptionFr = $state(event?.descriptionFr ?? "");
	let subtitleEn = $state(event?.subtitleEn ?? "");
	let subtitleFr = $state(event?.subtitleFr ?? "");
	let visibility = $state<Visibility>(event?.visibility ?? 'draft');
	let isSpotlight = $state(event?.isSpotlight ?? false);
	// Only a Public Event can be the Spotlight: choosing Brouillon or Privé
	// clears it (issue 032).
	const spotlightAllowed = $derived(canBeSpotlight({ visibility }));
	$effect(() => {
		if (!spotlightAllowed) isSpotlight = false;
	});

	const VISIBILITY_HINTS: Record<Visibility, string> = {
		draft: 'Visible des seuls administrateurs. Sa page publique répond « introuvable ».',
		private: 'Visible et réservable par toute personne ayant son lien, mais jamais listé, ni indexé, ni mis à la une.',
		public: 'Visible et réservable par tous ; peut être mis à la une.',
	};
	let isPortfolio = $state(event?.isPortfolio ?? false);
	// The Portfolio (issue 044): an Event joins it only once its last
	// Seating has started — until then the choice is the server's to refuse.
	const portfolioJoinable = $derived(
		canJoinPortfolio({ visibility, isPortfolio, lastSeatingStart: lastSeatingStart ? new Date(lastSeatingStart) : null }, new Date())
	);
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
    <form bind:this={formEl} method="POST" action="?/updateEvent" use:enhance={saveEnhance} class="space-y-6">
 <!-- Titre (Anglais) -->
 <div>
 <label for="titleEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Titre (Anglais)
 </label>
 <div class="relative">
 <Type
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="titleEn"
 name="titleEn"
 type="text"
 bind:value={titleEn}
 placeholder="Summer Music Festival 2026"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Titre (Français) -->
 <div>
 <label for="titleFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Titre (Français)
 </label>
 <div class="relative">
 <Type
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="titleFr"
 name="titleFr"
 type="text"
 bind:value={titleFr}
 placeholder="Festival de musique d'été 2026"
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
                />
            </div>
        </div>

        <!-- Description (Anglais) -->
        <div>
            <label for="descriptionEn" class="block text-sm font-medium text-foreground-alt mb-2">
                Description (Anglais)
            </label>
            <div class="relative">
                <FileText
                    size={18}
                    class="absolute left-3 top-3 text-muted-foreground"
                />
                <textarea
                    id="descriptionEn"
                    name="descriptionEn"
                    bind:value={descriptionEn}
                    rows="5"
                    placeholder="Describe your event..."
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
                ></textarea>
            </div>
        </div>

        <!-- Description (Français) -->
        <div>
            <label for="descriptionFr" class="block text-sm font-medium text-foreground-alt mb-2">
                Description (Français)
            </label>
            <div class="relative">
                <FileText
                    size={18}
                    class="absolute left-3 top-3 text-muted-foreground"
                />
                <textarea
                    id="descriptionFr"
                    name="descriptionFr"
                    bind:value={descriptionFr}
                    rows="5"
                    placeholder="Décrivez votre événement..."
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
                ></textarea>
            </div>
        </div>

        <!-- Sous-titre (Anglais) -->
        <div>
            <label for="subtitleEn" class="block text-sm font-medium text-foreground-alt mb-2">
                Sous-titre (Anglais) (Optionnel)
            </label>
            <div class="relative">
                <FileText
                    size={18}
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    id="subtitleEn"
                    name="subtitleEn"
                    type="text"
                    bind:value={subtitleEn}
                    placeholder="A short tagline for the event..."
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
                />
            </div>
        </div>

        <!-- Sous-titre (Français) -->
        <div>
            <label for="subtitleFr" class="block text-sm font-medium text-foreground-alt mb-2">
                Sous-titre (Français) (Optionnel)
            </label>
            <div class="relative">
                <FileText
                    size={18}
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    id="subtitleFr"
                    name="subtitleFr"
                    type="text"
                    bind:value={subtitleFr}
                    placeholder="Une courte phrase accrocheuse pour l'événement..."
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>


        <!-- A new Event is created as a Draft (issue 032): its Visibility is
             set once it has been saved. -->
        {#if event}
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
                class="w-5 h-5 text-indigo-900 border-indigo-300 rounded focus:ring-indigo-900 disabled:opacity-50"
            />
            <div>
                <label for="isPortfolio" class="block text-sm font-medium text-indigo-900 cursor-pointer">
                    Inclure dans la galerie Portfolio
                </label>
                <p class="text-xs text-indigo-600">
                    Les événements du Portfolio apparaissent dans « Projets » et la galerie de la page d’accueil, les plus récents d’abord. Une image de couverture est requise.
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

        {/if}

        <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border-card">
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
