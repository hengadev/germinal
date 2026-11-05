<script lang="ts">
	import { enhance } from '$app/forms';
	import { deserialize } from '$app/forms';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { Media } from '$lib/types/media';
	import { handleTabResult } from './editor-forms';
	import { reportChange } from '$lib/utils/editor-save-form';
	import { visualsOf } from '$lib/utils/event-photos';
	import type { VisualsValues } from '$lib/utils/event-warnings-live';

	const toast = getToastContext();

	// « Visuels » tab. It shows only the Visuals, never the Event Photos of
	// the « Portfolio » tab (issue 045).
	let {
		event,
		onAltChange,
	}: {
		event: {
			id: string;
			coverMediaId: string | null;
			coverMedia?: Media | null;
			media?: Media[];
			coverVideoId?: string | null;
			coverVideo?: Media | null;
			coverVideoPortrait?: boolean;
			coverShowsTitle?: boolean;
		};
		/** An image's alt texts were saved (issue 043): the editor's
		 * warnings follow them. */
		onAltChange?: (mediaId: string, alt: { altEn: string | null; altFr: string | null }) => void;
	} = $props();

	// What the uploaders start from: replaced as a whole to put them back
	// as saved (« Annuler », issue 020).
	const savedCoverOf = (saved: typeof event) => (saved.coverMedia ? [saved.coverMedia] : []);
	const savedGalleryOf = (saved: typeof event) =>
		visualsOf(saved.media).filter((m: Media) => m && m.id !== saved.coverMediaId && m.id !== saved.coverVideoId);
	let existingCoverMedia = $state.raw(savedCoverOf(event));
	let existingGalleryMedia = $state.raw(savedGalleryOf(event));

	// The announcement video (issue 078): its Media when one is set, and
	// whether it is portrait, read from the file in the browser.
	let coverVideo = $state.raw<Media | null>(event.coverVideo ?? null);
	let coverVideoPortrait = $state(event.coverVideoPortrait ?? false);
	let coverShowsTitle = $state(event.coverShowsTitle ?? false);

	function handleVideoUpload(uploaded: Media[]) {
		if (uploaded.length > 0) {
			coverVideo = uploaded[0];
			// The shape is read from the <video> preview once its metadata
			// loads (onVideoMetadata below).
			coverVideoPortrait = false;
		}
		reportChange(formEl);
	}

	function handleVideoRemove() {
		coverVideo = null;
		coverVideoPortrait = false;
		reportChange(formEl);
	}

	function onVideoMetadata(e: Event) {
		const video = e.currentTarget as HTMLVideoElement;
		coverVideoPortrait = video.videoHeight > video.videoWidth;
		reportChange(formEl);
	}

	function handleCoverShowsTitleChange(e: Event) {
		coverShowsTitle = (e.currentTarget as HTMLInputElement).checked;
		reportChange(formEl);
	}

	let formEl: HTMLFormElement | undefined = $state();
	let coverMediaId = $state(event.coverMediaId ?? null);
	let galleryMediaIds = $state(existingGalleryMedia.map((m: Media) => m.id));

	// Delete confirmation modal state
	let pendingDeleteId: string | null = $state(null);
	let resolveDelete: ((ok: boolean) => void) | null = null;
	let showDeleteModal = $derived(pendingDeleteId !== null);

	async function beforeRemove(mediaId: string): Promise<boolean> {
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

	function handleCoverUpload(uploaded: Media[]) {
		if (uploaded.length > 0) {
			coverMediaId = uploaded[0].id;
		}
		reportChange(formEl);
	}

	function handleCoverRemove(_mediaId: string) {
		coverMediaId = null;
		reportChange(formEl);
	}

	function handleGalleryUpload(uploaded: Media[]) {
		const newIds = uploaded.map((m) => m.id);
		galleryMediaIds = [...galleryMediaIds, ...newIds];
		if (!coverMediaId && galleryMediaIds.length > 0) {
			coverMediaId = galleryMediaIds[0];
		}
		reportChange(formEl);
	}

	function handleGalleryRemove(mediaId: string) {
		galleryMediaIds = galleryMediaIds.filter((mid: string) => mid !== mediaId);
		if (coverMediaId === mediaId) {
			coverMediaId = galleryMediaIds.length > 0 ? galleryMediaIds[0] : null;
		}
		reportChange(formEl);
	}

	function handleGalleryReorder(mediaIds: string[]) {
		galleryMediaIds = mediaIds;
		reportChange(formEl);
	}

	/** Back to the saved Visuals (a published Event's « Annuler », issue
	 * 020). Uploads and deletions are stored at once: the page data is
	 * reloaded first, so they show as they are. */
	export function restore() {
		existingCoverMedia = savedCoverOf(event);
		existingGalleryMedia = savedGalleryOf(event);
		coverMediaId = event.coverMediaId ?? null;
		galleryMediaIds = existingGalleryMedia.map((m: Media) => m.id);
		coverVideo = event.coverVideo ?? null;
		coverVideoPortrait = event.coverVideoPortrait ?? false;
		coverShowsTitle = event.coverShowsTitle ?? false;
	}

	/** What this tab holds now, saved or not: « À vérifier » and the tab
	 * marks follow it (issue 021). */
	export function warningValues(): VisualsValues {
		return { coverMediaId, galleryMediaIds };
	}
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
	<form bind:this={formEl} method="POST" action="?/updateMedia" use:enhance={() => {
		return async ({ result, formElement }) => {
			await handleTabResult(result, toast, 'Photos mises à jour', formElement);
		};
	}} class="space-y-8">

		<!-- Cover Photo -->
		<div>
			<h2 class="text-base font-semibold text-foreground mb-1">Photo de couverture</h2>
			<p class="text-sm text-muted-foreground mb-4">
				Photo principale affichée dans les listes et en en-tête de l'événement.
			</p>
			<MediaUpload
				mode="single"
				entityType="event"
				entityId={event.id}
				role="visual"
				existingMedia={existingCoverMedia}
				maxSizeMB={10}
				onUpload={handleCoverUpload}
				onRemove={handleCoverRemove}
				onBeforeRemove={event ? beforeRemove : undefined}
				{onAltChange}
			/>
			<input type="hidden" name="coverMediaId" value={coverMediaId ?? ''} />
		</div>

		<!-- Announcement video (issue 078) -->
		<div>
			<h2 class="text-base font-semibold text-foreground mb-1">Vidéo d’annonce</h2>
			<p class="text-sm text-muted-foreground mb-4">
				Lue en boucle et sans son en tête de la page de l’événement, devant la couverture.
				La couverture sert d’image d’attente.
			</p>
			{#if coverVideo}
				<div class="mb-4">
					<video
						src={coverVideo.url}
						class="w-full max-h-64 rounded-md border border-border-card"
						muted
						controls
						onloadedmetadata={onVideoMetadata}
					></video>
					<p class="text-xs text-muted-foreground mt-1">
						{coverVideoPortrait ? 'Format vertical (portrait)' : 'Format horizontal (paysage)'}
					</p>
					<button
						type="button"
						onclick={handleVideoRemove}
						class="mt-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
					>
						Retirer la vidéo
					</button>
				</div>
			{/if}
			<MediaUpload
				mode="single"
				accept="video/*"
				entityType="event"
				entityId={event.id}
				role="visual"
				maxSizeMB={100}
				onUpload={handleVideoUpload}
				onRemove={handleVideoRemove}
			/>
			<input type="hidden" name="coverVideoId" value={coverVideo?.id ?? ''} />
			<input type="hidden" name="coverVideoPortrait" value={coverVideoPortrait ? 'true' : 'false'} />
			<label class="flex items-start gap-2 mt-6 text-sm text-foreground cursor-pointer">
				<input
					type="checkbox"
					class="mt-0.5"
					checked={coverShowsTitle}
					onchange={handleCoverShowsTitleChange}
				/>
				<span>
					La couverture montre déjà le nom de l’événement
					<span class="block text-xs text-muted-foreground font-normal">
						Elle est alors montrée en entier, et le titre n’est pas répété dessus.
					</span>
				</span>
			</label>
			<input type="hidden" name="coverShowsTitle" value={coverShowsTitle ? 'true' : 'false'} />
		</div>

		<!-- Gallery -->
		<div>
			<h2 class="text-base font-semibold text-foreground mb-1">Galerie</h2>
			<p class="text-sm text-muted-foreground mb-4">
				Photos supplémentaires. Glissez pour réorganiser. Le texte alternatif de chaque
				image, en français et en anglais, est enregistré dès qu’un champ est quitté.
			</p>
			<MediaUpload
				mode="multiple"
				entityType="event"
				entityId={event.id}
				role="visual"
				existingMedia={existingGalleryMedia}
				maxSizeMB={10}
				onUpload={handleGalleryUpload}
				onRemove={handleGalleryRemove}
				onReorder={handleGalleryReorder}
				onBeforeRemove={event ? beforeRemove : undefined}
				{onAltChange}
			/>
			<input type="hidden" name="galleryMediaIds" value={JSON.stringify(galleryMediaIds)} />
		</div>

		<!-- Hidden on a Draft, which saves itself (issue 018). -->
		<div data-editor-save class="pt-4 border-t border-border-card">
			<button
				type="submit"
				class="px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium"
			>
				Enregistrer les photos
			</button>
		</div>
	</form>
</div>

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
