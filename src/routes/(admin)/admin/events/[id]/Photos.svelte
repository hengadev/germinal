<script lang="ts">
	import { enhance } from '$app/forms';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import type { ActionData, PageData } from './$types';
	import type { Media } from '$lib/types/media';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const existingCoverMedia = data.event.coverMedia ? [data.event.coverMedia] : [];
	const existingGalleryMedia = (data.event.media || []).filter(
		(m: Media) => m.id !== data.event.coverMediaId
	);

	let coverMediaId = $state(data.event.coverMediaId ?? null);
	let galleryMediaIds = $state(existingGalleryMedia.map((m: Media) => m.id));
	let removedIds: string[] = $state([]);

	const originalCoverId = data.event.coverMediaId ?? null;
	const originalGalleryIds = existingGalleryMedia.map((m: Media) => m.id);

	function handleCoverUpload(uploaded: Media[]) {
		if (uploaded.length > 0) {
			coverMediaId = uploaded[0].id;
		}
	}

	function handleCoverRemove(mediaId: string) {
		removedIds = [...removedIds, mediaId];
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
		// Only mark for deletion if it's an existing (already-saved) media record
		if (originalGalleryIds.includes(mediaId) || originalCoverId === mediaId) {
			removedIds = [...removedIds, mediaId];
		}
		galleryMediaIds = galleryMediaIds.filter((mid: string) => mid !== mediaId);
		if (coverMediaId === mediaId) {
			coverMediaId = galleryMediaIds.length > 0 ? galleryMediaIds[0] : null;
		}
	}

	function handleGalleryReorder(mediaIds: string[]) {
		galleryMediaIds = mediaIds;
	}
</script>

<div class="bg-white rounded-lg border border-border-card p-6 lg:p-8">
	<form method="POST" action="?/updateMedia" use:enhance class="space-y-8">

		<!-- Cover Photo -->
		<div>
			<h2 class="text-base font-semibold text-dark-900 mb-1">Photo de couverture</h2>
			<p class="text-sm text-dark-400 mb-4">
				Photo principale affichée dans les listes et en en-tête de l'événement.
			</p>
			<MediaUpload
				mode="single"
				entityType="event"
				existingMedia={existingCoverMedia}
				maxSizeMB={10}
				onUpload={handleCoverUpload}
				onRemove={handleCoverRemove}
			/>
			<input type="hidden" name="coverMediaId" value={coverMediaId ?? ''} />
		</div>

		<!-- Gallery -->
		<div>
			<h2 class="text-base font-semibold text-dark-900 mb-1">Galerie</h2>
			<p class="text-sm text-dark-400 mb-4">
				Photos supplémentaires. Glissez pour réorganiser.
			</p>
			<MediaUpload
				mode="multiple"
				entityType="event"
				existingMedia={existingGalleryMedia}
				maxSizeMB={10}
				onUpload={handleGalleryUpload}
				onRemove={handleGalleryRemove}
				onReorder={handleGalleryReorder}
			/>
			<input type="hidden" name="galleryMediaIds" value={JSON.stringify(galleryMediaIds)} />
			<input type="hidden" name="removedIds" value={JSON.stringify(removedIds)} />
		</div>

		<div class="pt-4 border-t border-border-card">
			<button
				type="submit"
				class="px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium"
			>
				Enregistrer les photos
			</button>
		</div>
	</form>
</div>
