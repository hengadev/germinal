<script lang="ts">
	import { Upload, X, Image as ImageIcon, AlertCircle, RefreshCw, GripVertical } from 'lucide-svelte';
	import type { Media } from '$lib/types/media';

	interface Props {
		mode: 'single' | 'multiple';
		accept?: string;
		maxFiles?: number;
		maxSizeMB?: number;
		existingMedia?: Media[];
		entityType: 'talent' | 'event';
		onUpload: (media: Media[]) => void;
		onRemove: (mediaId: string) => void;
		onReorder?: (mediaIds: string[]) => void;
	}

	let {
		mode,
		accept = 'image/*',
		maxFiles,
		maxSizeMB = 10,
		existingMedia = [],
		entityType,
		onUpload,
		onRemove,
		onReorder
	}: Props = $props();

	// Track current uploaded media (new uploads + existing)
	let uploadedMedia: Array<Media & { isNew?: boolean }> = $state(
		existingMedia.map((m) => ({ ...m, isNew: false }))
	);

	// Track files currently being uploaded
	interface UploadProgress {
		file: File;
		progress: number;
		error?: string;
		preview?: string;
		media?: Media;
	}

	let uploadingFiles: UploadProgress[] = $state([]);
	let isDragOver = $state(false);
	let fileInput: HTMLInputElement;

	// Allowed MIME types for validation
	const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

	function getAllowedMimeTypes(): string[] {
		if (accept === 'image/*') return allowedImageTypes;
		if (accept === 'video/*') return allowedVideoTypes;
		return [...allowedImageTypes, ...allowedVideoTypes];
	}

	function validateFile(file: File): string | null {
		// Check file type
		const allowedTypes = getAllowedMimeTypes();
		if (!allowedTypes.includes(file.type)) {
			return `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`;
		}

		// Check file size
		const maxBytes = maxSizeMB * 1024 * 1024;
		if (file.size > maxBytes) {
			return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${maxSizeMB}MB`;
		}

		// Check file count for multiple mode (only when a limit is set)
		if (mode === 'multiple' && maxFiles !== undefined) {
			const currentTotal = uploadedMedia.length + uploadingFiles.length;
			if (currentTotal >= maxFiles) {
				return `Maximum ${maxFiles} fichiers autorisés`;
			}
		}

		return null; // Valid
	}

	async function uploadFile(file: File, progress: UploadProgress): Promise<Media> {
		// Check for mock data mode
		const useMockData = import.meta.env.VITE_USE_MOCK_DATA === 'true';

		if (useMockData) {
			// Simulate upload delay
			await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
			progress.progress = 100;

			// Return mock media
			return {
				id: crypto.randomUUID(),
				url: `https://picsum.photos/seed/${Date.now()}/800/600`,
				s3Key: `mock/${entityType}/${crypto.randomUUID()}.webp`,
				mimeType: 'image/webp',
				size: file.size,
				type: 'image',
				eventId: null,
				talentId: null,
				isCover: false,
				createdAt: new Date()
			};
		}

		// Real upload using XMLHttpRequest for progress tracking
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			const formData = new FormData();
			formData.append('file', file);
			formData.append('entityType', entityType);
			// Don't set entityId - will be set when form is submitted

			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) {
					progress.progress = Math.round((e.loaded / e.total) * 100);
				}
			};

			xhr.onload = () => {
				if (xhr.status === 200 || xhr.status === 201) {
					try {
						const response = JSON.parse(xhr.responseText);
						if (response.success && response.media && response.media.length > 0) {
							resolve(response.media[0]);
						} else {
							reject(new Error('Invalid response from server'));
						}
					} catch (e) {
						reject(new Error('Failed to parse server response'));
					}
				} else if (xhr.status === 401) {
					reject(new Error('Session expired. Please log in again.'));
				} else {
					reject(new Error(xhr.responseText || 'Upload failed'));
				}
			};

			xhr.onerror = () => reject(new Error('Network error during upload'));
			xhr.onabort = () => reject(new Error('Upload cancelled'));

			xhr.open('POST', '/api/media/upload');
			xhr.send(formData);
		});
	}

	function createPreview(file: File): string {
		return URL.createObjectURL(file);
	}

	async function handleFiles(files: FileList | File[]) {
		const filesArray = Array.from(files);

		for (const file of filesArray) {
			// Validate file
			const error = validateFile(file);
			if (error) {
				uploadingFiles = [
					...uploadingFiles,
					{ file, progress: 0, error, preview: createPreview(file) }
				];
				continue;
			}

			// Create progress tracker
			const progress: UploadProgress = {
				file,
				progress: 0,
				preview: createPreview(file)
			};
			uploadingFiles = [...uploadingFiles, progress];

			// Upload file
			try {
				const media = await uploadFile(file, progress);
				progress.media = media;

				// Add to uploaded media
				const newMedia = { ...media, isNew: true };
				uploadedMedia = [...uploadedMedia, newMedia];
				onUpload([newMedia]);

				// Remove from uploading list after a short delay
				setTimeout(() => {
					uploadingFiles = uploadingFiles.filter((p) => p !== progress);
				}, 500);
			} catch (err) {
				progress.error = err instanceof Error ? err.message : 'Upload failed';
			}
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;

		if (e.dataTransfer?.files) {
			handleFiles(e.dataTransfer.files);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
	}

	function handleClick() {
		fileInput?.click();
	}

	function handleInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			handleFiles(target.files);
			target.value = ''; // Reset input to allow selecting same file again
		}
	}

	function handleRemove(mediaId: string) {
		uploadedMedia = uploadedMedia.filter((m) => m.id !== mediaId);
		onRemove(mediaId);
	}

	function handleRetry(progress: UploadProgress) {
		// Remove error and retry upload
		uploadingFiles = uploadingFiles.filter((p) => p !== progress);
		handleFiles([progress.file]);
	}

	function handleDragStart(e: DragEvent, index: number) {
		if (!onReorder) return;
		e.dataTransfer!.setData('text/plain', index.toString());
	}

	function handleDragOverItem(e: DragEvent, index: number) {
		if (!onReorder) return;
		e.preventDefault();
	}

	function handleDropItem(e: DragEvent, targetIndex: number) {
		if (!onReorder) return;
		e.preventDefault();
		const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'));

		if (fromIndex !== targetIndex) {
			const newMedia = [...uploadedMedia];
			const [moved] = newMedia.splice(fromIndex, 1);
			newMedia.splice(targetIndex, 0, moved);
			uploadedMedia = newMedia;
			onReorder(newMedia.map((m) => m.id));
		}
	}

	// Sync with existingMedia prop changes
	$effect(() => {
		uploadedMedia = existingMedia.map((m) => ({ ...m, isNew: false }));
	});
</script>

<div class="media-upload">
	<!-- Hidden file input — always in the DOM so fileInput binding is never undefined -->
	<input
		bind:this={fileInput}
		type="file"
		{accept}
		multiple={mode === 'multiple'}
		onchange={handleInputChange}
		class="hidden-input"
		aria-hidden="true"
	/>

	<!-- Upload Zone -->
	{#if mode === 'single' && uploadedMedia.length > 0}
		<!-- Single mode with existing upload - show replace button -->
		<div class="media-grid">
			{#each uploadedMedia as media (media.id)}
				<div class="media-item">
					<img src={media.url} alt="Uploaded media" class="media-preview" />
					<button
						type="button"
						class="remove-btn"
						onclick={() => handleRemove(media.id)}
						aria-label="Remove media"
					>
						<X size={16} />
					</button>
					<div class="media-badge">Couverture</div>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class="replace-btn"
			onclick={handleClick}
			class:loading={uploadingFiles.length > 0}
		>
			{#if uploadingFiles.length > 0}
				<RefreshCw size={16} class="animate-spin" />
				Envoi en cours...
			{:else}
				<Upload size={16} />
				Remplacer la photo
			{/if}
		</button>
	{:else if mode === 'single' || maxFiles === undefined || uploadedMedia.length < maxFiles}
		<div
			class="upload-zone"
			class:drag-over={isDragOver}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onclick={handleClick}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && handleClick()}
		>
			<Upload size={32} class="upload-icon" />
			<p class="upload-text">
				{mode === 'single' ? 'Cliquer ou glisser une photo' : maxFiles !== undefined ? `Cliquer ou glisser des fichiers (max ${maxFiles})` : 'Cliquer ou glisser des fichiers'}
			</p>
			<p class="upload-hint">Max {maxSizeMB}Mo par fichier</p>
		</div>
	{/if}

	<!-- Upload Progress -->
	{#if uploadingFiles.length > 0}
		<div class="upload-progress-list">
			{#each uploadingFiles as progress (progress.file.name)}
				<div class="upload-progress-item" class:error={!!progress.error}>
					{#if progress.preview}
						<img src={progress.preview} alt="" class="progress-preview" />
					{:else}
						<div class="progress-placeholder">
							<ImageIcon size={24} />
						</div>
					{/if}
					<div class="progress-info">
						<p class="progress-name">{progress.file.name}</p>
						{#if progress.error}
							<p class="progress-error">
								<AlertCircle size={14} />
								{progress.error}
							</p>
							<button type="button" class="retry-btn" onclick={() => handleRetry(progress)}>
								<RefreshCw size={14} />
								Réessayer
							</button>
						{:else}
							<div class="progress-bar-container">
								<div class="progress-bar" style="width: {progress.progress}%"></div>
							</div>
							<p class="progress-percent">{progress.progress}%</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Uploaded Media Grid (for multiple mode) -->
	{#if mode === 'multiple' && uploadedMedia.length > 0}
		<div class="media-grid">
			{#each uploadedMedia as media, index (media.id)}
				<div
					class="media-item"
					draggable={!!onReorder}
					ondragstart={(e) => handleDragStart(e, index)}
					ondragover={(e) => handleDragOverItem(e, index)}
					ondrop={(e) => handleDropItem(e, index)}
				>
					<img src={media.url} alt="Uploaded media" class="media-preview" />
					<button
						type="button"
						class="remove-btn"
						onclick={() => handleRemove(media.id)}
						aria-label="Remove media"
					>
						<X size={16} />
					</button>
					{#if index === 0}
						<div class="media-badge cover-badge">Couverture</div>
					{:else}
						<div class="media-badge">{index + 1}</div>
					{/if}
					{#if onReorder}
						<div class="drag-handle">
							<GripVertical size={16} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.media-upload {
		width: 100%;
	}

	/* Upload Zone */
	.upload-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		border: 2px dashed #e5e7eb;
		border-radius: 0.5rem;
		background-color: #f9fafb;
		cursor: pointer;
		transition: all 0.2s;
		min-height: 150px;
	}

	.upload-zone:hover {
		border-color: #d1d5db;
		background-color: #f3f4f6;
	}

	.upload-zone.drag-over {
		border-color: #3b82f6;
		background-color: #eff6ff;
	}

	.upload-zone:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.upload-icon {
		color: #9ca3af;
		margin-bottom: 0.5rem;
	}

	.upload-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin: 0;
	}

	.upload-hint {
		font-size: 0.75rem;
		color: #9ca3af;
		margin: 0.25rem 0 0 0;
	}

	.hidden-input {
		display: none;
	}

	/* Upload Progress */
	.upload-progress-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.upload-progress-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.upload-progress-item.error {
		background-color: #fef2f2;
		border-color: #fecaca;
	}

	.progress-preview {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.progress-placeholder {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #e5e7eb;
		border-radius: 0.25rem;
		color: #9ca3af;
		flex-shrink: 0;
	}

	.progress-info {
		flex: 1;
		min-width: 0;
	}

	.progress-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin: 0 0 0.25rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.progress-error {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: #dc2626;
		margin: 0 0 0.25rem 0;
	}

	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: #dc2626;
		background-color: white;
		border: 1px solid #fecaca;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-btn:hover {
		background-color: #fef2f2;
	}

	.progress-bar-container {
		height: 4px;
		background-color: #e5e7eb;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background-color: #3b82f6;
		transition: width 0.3s;
	}

	.progress-percent {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0.25rem 0 0 0;
	}

	/* Media Grid */
	.media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.media-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 0.5rem;
		overflow: hidden;
		background-color: #f3f4f6;
		cursor: grab;
	}

	.media-item:active {
		cursor: grabbing;
	}

	.media-preview {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.remove-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.6);
		color: white;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.remove-btn:hover {
		background-color: rgba(220, 38, 38, 0.9);
	}

	.media-badge {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		padding: 0.125rem 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		color: white;
		background-color: rgba(0, 0, 0, 0.6);
		border-radius: 0.25rem;
	}

	.media-badge.cover-badge {
		background-color: #3b82f6;
	}

	.drag-handle {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(255, 255, 255, 0.8);
		border-radius: 0.25rem;
		color: #6b7280;
	}

	/* Replace Button */
	.replace-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		background-color: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.replace-btn:hover {
		background-color: #f9fafb;
		border-color: #9ca3af;
	}

	.replace-btn.loading {
		opacity: 0.7;
		cursor: not-allowed;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>
