<script lang="ts">
	import { enhance } from '$app/forms';
	import { deserialize } from '$app/forms';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { Media } from '$lib/types/media';
	import { handleTabResult } from './editor-forms';
	import { visualsOf } from '$lib/utils/event-photos';

	const toast = getToastContext();

	// « Visuels » tab. On a new Event (`event` null) the uploads are not
	// linked to any Event yet: the first save creates the Draft with them
	// (issue 036). It shows only the Visuals, never the Event Photos of the
	// « Portfolio » tab (issue 045).
	let {
		event,
		onAltChange,
	}: {
		event: { id: string; coverMediaId: string | null; coverMedia?: Media | null; media?: Media[] } | null;
		/** An image's alt texts were saved (issue 043): the editor's
		 * warnings follow them. */
		onAltChange?: (mediaId: string, alt: { altEn: string | null; altFr: string | null }) => void;
	} = $props();

	const existingCoverMedia = event?.coverMedia ? [event.coverMedia] : [];
	const existingGalleryMedia = visualsOf(event?.media).filter(
		(m: Media) => m && m.id !== event?.coverMediaId
	);

	let coverMediaId = $state(event?.coverMediaId ?? null);
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
	}

	function handleCoverRemove(_mediaId: string) {
		coverMediaId = null;
	}

	function handleGalleryUpload(uploaded: Media[]) {
		const newIds = uploaded.map((m) => m.id);
		galleryMediaIds = [...galleryMediaIds, ...newIds];
		if (!coverMediaId && galleryMediaIds.length > 0) {
			coverMediaId = galleryMediaIds[0];
		}
	}

	function handleGalleryRemove(mediaId: string) {
		galleryMediaIds = galleryMediaIds.filter((mid: string) => mid !== mediaId);
		if (coverMediaId === mediaId) {
			coverMediaId = galleryMediaIds.length > 0 ? galleryMediaIds[0] : null;
		}
	}

	function handleGalleryReorder(mediaIds: string[]) {
		galleryMediaIds = mediaIds;
	}
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
	<form method="POST" action="?/updateMedia" use:enhance={() => {
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
				entityId={event?.id}
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
				entityId={event?.id}
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

		<div class="pt-4 border-t border-border-card">
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
