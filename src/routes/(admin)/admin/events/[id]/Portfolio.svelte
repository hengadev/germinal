<script lang="ts">
	// « Portfolio » tab (issue 045, ADR 0007): what the Event's project page
	// shows once it is in the Portfolio — the Recap, in French and English,
	// and the Event Photos taken at the Event, one of them the project
	// cover. Event Photos are kept apart from the announcement Visuals
	// (« Visuels »): each tab shows only its own. Joining the Portfolio
	// itself is set in « Essentiel », once the Event is over.
	import { enhance, deserialize } from '$app/forms';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { Media } from '$lib/types/media';
	import type { EventWarning } from '$lib/utils/event-warnings';
	import { eventPhotosOf } from '$lib/utils/event-photos';
	import { mediaAlt } from '$lib/utils/media-alt';
	import { canJoinPortfolio } from '$lib/utils/event-access';
	import { handleTabResult, type EditorEvent } from './editor-forms';
	import { keepEdits } from '$lib/utils/editor-refresh';
	import { reportChange } from '$lib/utils/editor-save-form';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';

	let {
		event,
		lastSeatingStart = null,
		warnings = [],
		onAltChange,
	}: {
		event: EditorEvent;
		/** When the Event's last Seating starts: until then the tab is locked. */
		lastSeatingStart?: Date | string | null;
		/** The Portfolio list (issue 045): warnings only, never blocking. */
		warnings?: EventWarning[];
		onAltChange?: (mediaId: string, alt: { altEn: string | null; altFr: string | null }) => void;
	} = $props();

	const toast = getToastContext();

	// ---- Recap -------------------------------------------------------------
	let recapFr = $state(event?.recapFr ?? '');
	let recapEn = $state(event?.recapEn ?? '');
	let savingRecap = $state(false);

	// The English may have been generated from the French on save: it is
	// taken back, unless edited since the save started (issue 018).
	function recapEnhance() {
		savingRecap = true;
		const sent = { recapEn };
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			savingRecap = false;
			await handleTabResult(result, toast, 'Récap enregistré', formElement, () => {
				({ recapEn } = keepEdits(sent, { recapEn }, { recapEn: event?.recapEn ?? '' }));
			});
		};
	}

	// ---- Event Photos ------------------------------------------------------
	const existingPhotos = eventPhotosOf(event?.media);
	let photos: Media[] = $state([...existingPhotos]);
	let coverId: string | null = $state(existingPhotos.find((photo) => photo.isCover)?.id ?? null);
	let savingPhotos = $state(false);
	let photosFormEl: HTMLFormElement | undefined = $state();

	function handleUpload(uploaded: Media[]) {
		photos = [...photos, ...uploaded];
		// The first photo becomes the cover until another is chosen.
		if (!coverId && photos.length > 0) coverId = photos[0].id;
		reportChange(photosFormEl);
	}

	function handleRemove(mediaId: string) {
		photos = photos.filter((photo) => photo.id !== mediaId);
		if (coverId === mediaId) coverId = photos[0]?.id ?? null;
		reportChange(photosFormEl);
	}

	function handleReorder(mediaIds: string[]) {
		photos = mediaIds
			.map((id) => photos.find((photo) => photo.id === id))
			.filter((photo): photo is Media => photo !== undefined);
		reportChange(photosFormEl);
	}

	function photosEnhance() {
		savingPhotos = true;
		return async ({ result, formElement }: { result: import('@sveltejs/kit').ActionResult; formElement: HTMLFormElement }) => {
			savingPhotos = false;
			await handleTabResult(result, toast, 'Photos de l’événement enregistrées', formElement);
		};
	}

	// Removing a saved photo deletes it at once, after confirmation.
	let pendingDeleteId: string | null = $state(null);
	let resolveDelete: ((ok: boolean) => void) | null = null;
	let showDeleteModal = $derived(pendingDeleteId !== null);

	function beforeRemove(mediaId: string): Promise<boolean> {
		pendingDeleteId = mediaId;
		return new Promise((resolve) => {
			resolveDelete = resolve;
		});
	}

	async function confirmDelete() {
		const mediaId = pendingDeleteId!;
		pendingDeleteId = null;
		const fd = new FormData();
		fd.set('mediaId', mediaId);
		try {
			const res = await fetch('?/deletePhoto', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				toast.success('Succès', 'Photo supprimée');
				resolveDelete?.(true);
			} else {
				const errData = (result as { data?: { error?: string } }).data;
				toast.error('Erreur', errData?.error ?? 'Échec de la suppression');
				resolveDelete?.(false);
			}
		} catch {
			toast.error('Erreur', 'Échec de la suppression');
			resolveDelete?.(false);
		}
		resolveDelete = null;
	}

	function closeDeleteModal() {
		resolveDelete?.(false);
		pendingDeleteId = null;
		resolveDelete = null;
	}

	const inPortfolio = $derived(event?.isPortfolio === true);
	// The Recap and Event Photos are written after the Event (ADR 0007): the
	// tab stays visible so the feature is known, but opens once it is over.
	const over = $derived(
		canJoinPortfolio(
			{ visibility: event?.visibility ?? 'draft', lastSeatingStart: lastSeatingStart ? new Date(lastSeatingStart) : null },
			new Date()
		)
	);
</script>

{#if !over}
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<h2 class="text-lg font-semibold text-foreground mb-1">Portfolio</h2>
		<p class="text-sm text-foreground-alt">Disponible une fois l’événement terminé.</p>
		<p class="text-sm text-muted-foreground mt-2">
			{#if lastSeatingStart}
				Le récap et les photos de l’événement s’ajoutent après sa dernière séance, prévue le
				{new Date(lastSeatingStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
			{:else}
				Le récap et les photos de l’événement s’ajoutent après sa dernière séance ; renseignez d’abord ses
				dates dans « Dates & séances ». Pour un événement passé, saisissez ses vraies dates : l’onglet s’ouvre aussitôt.
			{/if}
		</p>
	</div>
{:else}

<div class="space-y-6">
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<h2 class="text-lg font-semibold text-foreground mb-1">Portfolio</h2>
		<p class="text-sm text-muted-foreground">
			{#if inPortfolio}
				Cet événement est dans le Portfolio : sa page publique présente le projet — récap, photos de
				l’événement, générique, dates et lieu — à la place du texte d’annonce, des séances et des tarifs.
			{:else}
				Une fois l’événement dans le Portfolio (à cocher dans « Essentiel », une fois sa dernière séance
				commencée), sa page publique présente ce récap et ces photos à la place de l’annonce.
			{/if}
		</p>

		{#if warnings.length > 0}
			<!-- The Portfolio list (issue 045): warnings only, adding to the
			     Portfolio is never refused for them. -->
			<div class="mt-5 border-t border-border-card pt-4" aria-label="À vérifier pour le Portfolio">
				<p class="text-sm font-medium text-foreground mb-2">À vérifier pour le Portfolio</p>
				<ul class="space-y-1.5 text-sm text-foreground-alt list-disc pl-5">
					{#each warnings as warning (warning.code)}
						<li>{warning.message}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<!-- Recap -->
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<form method="POST" action="?/updateEvent" data-editor-form="recap" use:enhance={recapEnhance} class="space-y-6">
			<div>
				<h3 class="text-base font-semibold text-foreground mb-1">Récap</h3>
				<p class="text-xs text-muted-foreground">
					Ce qui s’est passé, écrit après l’événement. La page du projet s’ouvre sur ce texte ; une ligne
					vide sépare les paragraphes, le premier est mis en avant.
				</p>
			</div>

			<div>
				<label for="recapFr" class="block text-sm font-medium text-foreground-alt mb-2">Récap</label>
				<textarea
					id="recapFr"
					name="recapFr"
					bind:value={recapFr}
					rows="7"
					class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
				></textarea>
			</div>

			<EnglishVersion>
				<div>
					<label for="recapEn" class="block text-sm font-medium text-foreground-alt mb-2">Récap (Anglais)</label>
					<textarea
						id="recapEn"
						name="recapEn"
						bind:value={recapEn}
						rows="7"
						class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-y"
					></textarea>
					<p class="text-xs text-muted-foreground mt-2">Une langue manquante retombe sur l’autre.</p>
				</div>
			</EnglishVersion>

			<!-- Hidden on a Draft, which saves itself (issue 018). -->
			<div data-editor-save class="flex pt-4 border-t border-border-card">
				<button
					type="submit"
					disabled={savingRecap}
					class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
				>
					{savingRecap ? 'Enregistrement…' : 'Enregistrer le récap'}
				</button>
			</div>
		</form>
	</div>

	<!-- Event Photos -->
	<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
		<form bind:this={photosFormEl} method="POST" action="?/updateEventPhotos" data-editor-form="event-photos" use:enhance={photosEnhance} class="space-y-6">
			<div>
				<h3 class="text-base font-semibold text-foreground mb-1">Photos de l’événement</h3>
				<p class="text-xs text-muted-foreground">
					Les photos prises pendant l’événement, distinctes des visuels d’annonce. Le texte alternatif de
					chaque image, en français et en anglais, est enregistré dès qu’un champ est quitté.
				</p>
			</div>

			<MediaUpload
				mode="multiple"
				entityType="event"
				entityId={event?.id}
				role="event_photo"
				existingMedia={existingPhotos}
				maxSizeMB={10}
				onUpload={handleUpload}
				onRemove={handleRemove}
				onReorder={handleReorder}
				onBeforeRemove={event ? beforeRemove : undefined}
				{onAltChange}
			/>

			{#if photos.length > 0}
				<fieldset>
					<legend class="text-sm font-medium text-foreground-alt mb-1">Couverture du projet</legend>
					<p class="text-xs text-muted-foreground mb-3">
						Ouvre la page du projet et le représente dans « Projets » et la galerie de la page d’accueil.
					</p>
					<div class="flex flex-wrap gap-3">
						{#each photos as photo (photo.id)}
							<label class="relative cursor-pointer">
								<input type="radio" name="eventPhotoCoverChoice" value={photo.id} bind:group={coverId} class="peer sr-only" />
								{#if photo.type === 'video'}
									<video src={photo.url} muted class="size-20 object-cover rounded-md border-2 border-transparent peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2"></video>
								{:else}
									<img
										src={photo.url}
										alt={mediaAlt(photo, 'fr', 'Photo de l’événement')}
										class="size-20 object-cover rounded-md border-2 border-transparent opacity-70 peer-checked:opacity-100 peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2"
									/>
								{/if}
								{#if coverId === photo.id}
									<span class="absolute bottom-1 left-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">Couverture</span>
								{/if}
							</label>
						{/each}
					</div>
				</fieldset>
			{/if}

			<input type="hidden" name="eventPhotoIds" value={JSON.stringify(photos.map((photo) => photo.id))} />
			<input type="hidden" name="eventPhotoCoverId" value={coverId ?? ''} />

			<!-- Hidden on a Draft, which saves itself (issue 018). -->
			<div data-editor-save class="flex pt-4 border-t border-border-card">
				<button
					type="submit"
					disabled={savingPhotos}
					class="sm:ml-auto px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-60"
				>
					{savingPhotos ? 'Enregistrement…' : 'Enregistrer les photos'}
				</button>
			</div>
		</form>
	</div>
</div>
{/if}

<Modal bind:isOpen={showDeleteModal} title="Supprimer la photo" description="Cette action est irréversible. La photo sera définitivement supprimée.">
	<div class="flex justify-end gap-3 mt-4">
		<button
			type="button"
			onclick={closeDeleteModal}
			class="px-4 py-2 text-sm font-medium text-foreground-alt bg-background border border-border-card rounded-lg hover:bg-surface transition-colors"
		>
			Annuler
		</button>
		<button
			type="button"
			onclick={confirmDelete}
			class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
		>
			Supprimer
		</button>
	</div>
</Modal>
