<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Calendar, MapPin, Type, FileText, Tag } from 'lucide-svelte';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import type { ActionData } from './$types';
	import type { Media } from '$lib/types/media';
	import type { PageData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	function createEventEnhance() {
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Événement créé');
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			}
		};
	}

	let titleEn = $state('');
	let titleFr = $state('');
	let slug = $state('');
	let descriptionEn = $state('');
	let descriptionFr = $state('');
	let subtitleEn = $state('');
	let subtitleFr = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let location = $state('');
	let venueName = $state('');
	let streetAddress = $state('');
	let district = $state('');
	let city = $state('');
	let postalCode = $state('');
	let country = $state('');
	let collaborators = $state<Array<{name: string, role: string}>>([]);
	let timings = $state<Array<{label: string, time: string}>>([]);
	let curatorEn = $state('');
	let curatorFr = $state('');
	let materialsEn = $state('');
	let materialsFr = $state('');
	let admissionInfoEn = $state('');
	let admissionInfoFr = $state('');
	let published = $state(false);
	let isSpotlight = $state(false);
	let categoryId = $state<string>('');

	// Media upload state
	let coverMediaId: string | null = $state(null);
	let galleryMediaIds: string[] = $state([]);

	function handleCoverUpload(media: Media[]) {
		if (media.length > 0) {
			coverMediaId = media[0].id;
		}
	}

	function handleCoverRemove(mediaId: string) {
		if (coverMediaId === mediaId) {
			coverMediaId = null;
		}
	}

	function handleGalleryUpload(media: Media[]) {
		const newIds = media.map(m => m.id);
		galleryMediaIds = [...galleryMediaIds, ...newIds];
		// First gallery image becomes cover if no explicit cover
		if (!coverMediaId && galleryMediaIds.length > 0) {
			coverMediaId = galleryMediaIds[0];
		}
	}

	function handleGalleryRemove(mediaId: string) {
		galleryMediaIds = galleryMediaIds.filter(id => id !== mediaId);
		if (coverMediaId === mediaId) {
			// Set new cover from remaining gallery
			coverMediaId = galleryMediaIds.length > 0 ? galleryMediaIds[0] : null;
		}
	}

	function handleGalleryReorder(mediaIds: string[]) {
		galleryMediaIds = mediaIds;
	}

	// Auto-generate slug from English title
	$effect(() => {
		if (titleEn && !slug) {
			slug = titleEn
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		}
	});
</script>

<svelte:head>
	<title>Nouvel Événement | Tableau de bord Admin</title>
</svelte:head>

<div class="px-4 py-8 lg:py-12">
		<div class="mb-8">
			<a
				href="/admin/events"
				class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors mb-4"
			>
				<ArrowLeft size={20} />
				<span>Retour aux Événements</span>
			</a>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Créer un Nouvel Événement</h1>
			<p class="text-dark-400">
				Remplissez les détails pour créer un nouvel événement
			</p>
		</div>

		<div class="bg-white rounded-lg border border-border-card p-6 lg:p-8">
			<form method="POST" use:enhance={createEventEnhance()} class="space-y-6">
				<!-- Cover Photo Section -->
				<div class="form-section">
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Photo de Couverture
					</label>
					<p class="text-xs text-dark-400 mb-3">Image principale affichée dans les listes d'événements</p>
					<MediaUpload
						mode="single"
						entityType="event"
						maxSizeMB={10}
						onUpload={handleCoverUpload}
						onRemove={handleCoverRemove}
					/>
					<input type="hidden" name="coverMediaId" value={coverMediaId ?? ''} />
				</div>

				<!-- Gallery Section -->
				<div class="form-section">
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Galerie de l'Événement
					</label>
					<p class="text-xs text-dark-400 mb-3">Jusqu'à 10 photos supplémentaires. Glissez pour réorganiser. La première image deviendra la couverture si aucune couverture explicite n'est définie.</p>
					<MediaUpload
						mode="multiple"
						maxFiles={10}
						entityType="event"
						maxSizeMB={10}
						onUpload={handleGalleryUpload}
						onReorder={handleGalleryReorder}
						onRemove={handleGalleryRemove}
					/>
					<input type="hidden" name="galleryMediaIds" value={JSON.stringify(galleryMediaIds)} />
				</div>

				<!-- Title (English) -->
				<div>
					<label for="titleEn" class="block text-sm font-medium text-dark-700 mb-2">
						Titre (Anglais) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Type
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="titleEn"
							name="titleEn"
							type="text"
							bind:value={titleEn}
							required
							placeholder="Summer Music Festival 2026"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Title (French) -->
				<div>
					<label for="titleFr" class="block text-sm font-medium text-dark-700 mb-2">
						Titre (Français) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Type
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="titleFr"
							name="titleFr"
							type="text"
							bind:value={titleFr}
							required
							placeholder="Festival de musique d'été 2026"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Slug -->
				<div>
					<label for="slug" class="block text-sm font-medium text-dark-700 mb-2">
						Slug <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Type
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="slug"
							name="slug"
							type="text"
							bind:value={slug}
							required
							pattern="[a-z0-9-]+"
							placeholder="summer-music-festival-2026"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent font-mono text-sm"
						/>
					</div>
					<p class="mt-1 text-xs text-dark-400">
						URL-friendly version of the title (lowercase, hyphens only)
					</p>
				</div>

				<!-- Description (English) -->
				<div>
					<label for="descriptionEn" class="block text-sm font-medium text-dark-700 mb-2">
						Description (Anglais) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="descriptionEn"
							name="descriptionEn"
							bind:value={descriptionEn}
							required
							rows="5"
							placeholder="Describe your event..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Description (French) -->
				<div>
					<label for="descriptionFr" class="block text-sm font-medium text-dark-700 mb-2">
						Description (Français) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="descriptionFr"
							name="descriptionFr"
							bind:value={descriptionFr}
							required
							rows="5"
							placeholder="Décrivez votre événement..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Category Selection -->
				<div>
					<label for="categoryId" class="block text-sm font-medium text-dark-700 mb-2">
						Catégorie (Optionnel)
					</label>
					<div class="relative">
						<Tag
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<select
							id="categoryId"
							name="categoryId"
							bind:value={categoryId}
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent appearance-none bg-white"
						>
							<option value="">Aucune catégorie</option>
							{#each (data.categories || []) as category}
								<option value={category.id}>{category.displayNameFr} ({category.displayNameEn})</option>
							{/each}
						</select>
					</div>
					<p class="mt-1 text-xs text-dark-400">
						Lier cet événement à une catégorie existante
					</p>
				</div>

				<!-- Subtitle (English) -->
				<div>
					<label for="subtitleEn" class="block text-sm font-medium text-dark-700 mb-2">
						Sous-titre (Anglais) (Optionnel)
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="subtitleEn"
							name="subtitleEn"
							type="text"
							bind:value={subtitleEn}
							placeholder="A short tagline for the event..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Subtitle (French) -->
				<div>
					<label for="subtitleFr" class="block text-sm font-medium text-dark-700 mb-2">
						Sous-titre (Français) (Optionnel)
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="subtitleFr"
							name="subtitleFr"
							type="text"
							bind:value={subtitleFr}
							placeholder="Une courte phrase accrocheuse pour l'événement..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Dates -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<label for="startDate" class="block text-sm font-medium text-dark-700 mb-2">
							Date de Début <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<Calendar
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="startDate"
								name="startDate"
								type="datetime-local"
								bind:value={startDate}
								required
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>

					<div>
						<label for="endDate" class="block text-sm font-medium text-dark-700 mb-2">
							Date de Fin <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<Calendar
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="endDate"
								name="endDate"
								type="datetime-local"
								bind:value={endDate}
								required
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>
				</div>

				<!-- Location -->
				<div>
					<label for="location" class="block text-sm font-medium text-dark-700 mb-2">
						Lieu <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<MapPin
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="location"
							name="location"
							type="text"
							bind:value={location}
							required
							placeholder="Central Park, New York"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Venue Details -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Détails du Lieu (Optionnel)</h3>

					<div>
						<label for="venueName" class="block text-sm font-medium text-dark-600 mb-2">
							Nom du Lieu
						</label>
						<input
							id="venueName"
							name="venueName"
							type="text"
							bind:value={venueName}
							placeholder="e.g., Central Convention Center"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="streetAddress" class="block text-sm font-medium text-dark-600 mb-2">
							Adresse Rue
						</label>
						<input
							id="streetAddress"
							name="streetAddress"
							type="text"
							bind:value={streetAddress}
							placeholder="e.g., 123 Main Street"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label for="district" class="block text-sm font-medium text-dark-600 mb-2">
								Quartier
							</label>
							<input
								id="district"
								name="district"
								type="text"
								bind:value={district}
								placeholder="e.g., Downtown"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
						<div>
							<label for="city" class="block text-sm font-medium text-dark-600 mb-2">
								Ville
							</label>
							<input
								id="city"
								name="city"
								type="text"
								bind:value={city}
								placeholder="e.g., Tokyo"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
						<div>
							<label for="postalCode" class="block text-sm font-medium text-dark-600 mb-2">
								Code Postal
							</label>
							<input
								id="postalCode"
								name="postalCode"
								type="text"
								bind:value={postalCode}
								placeholder="e.g., 12345"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
					</div>

					<div>
						<label for="country" class="block text-sm font-medium text-dark-600 mb-2">
							Pays
						</label>
						<input
							id="country"
							name="country"
							type="text"
							bind:value={country}
							placeholder="e.g., Japan"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>
				</div>

				<!-- Collaborators -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Collaborateurs (Optionnel)
					</label>
					<p class="text-xs text-dark-400 mb-3">Ajoutez des talents ou partenaires collaborateurs</p>

					<div class="space-y-2">
						{#each collaborators as collab, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={collaborators[i].name}
									placeholder="Nom"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<input
									type="text"
									bind:value={collaborators[i].role}
									placeholder="Rôle"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => collaborators = collaborators.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Supprimer
								</button>
							</div>
						{/each}

						<button
							type="button"
							onclick={() => collaborators = [...collaborators, {name: "", role: ""}]}
							class="text-sm text-dark-600 hover:text-dark-900 font-medium"
						>
							+ Ajouter un Collaborateur
						</button>
					</div>

					<input type="hidden" name="collaborators" value={JSON.stringify(collaborators.filter(c => c.name.trim() && c.role.trim()))} />
				</div>

				<!-- Timings -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Horaires de l'Événement (Optionnel)
					</label>
					<p class="text-xs text-dark-400 mb-3">Ajoutez des informations de programmation pour différentes sessions</p>

					<div class="space-y-2">
						{#each timings as timing, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={timings[i].label}
									placeholder="e.g., Opening Night"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<input
									type="text"
									bind:value={timings[i].time}
									placeholder="e.g., 18:00 - 22:00"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => timings = timings.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Supprimer
								</button>
							</div>
						{/each}

						<button
							type="button"
							onclick={() => timings = [...timings, {label: "", time: ""}]}
							class="text-sm text-dark-600 hover:text-dark-900 font-medium"
						>
							+ Ajouter un Horaire
						</button>
					</div>

					<input type="hidden" name="timings" value={JSON.stringify(timings.filter(t => t.label.trim() && t.time.trim()))} />
				</div>

				<!-- Event Details -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Détails Supplémentaires (Optionnel)</h3>

					<div>
						<label for="curatorEn" class="block text-sm font-medium text-dark-600 mb-2">
							Commissaire (Anglais)
						</label>
						<input
							id="curatorEn"
							name="curatorEn"
							type="text"
							bind:value={curatorEn}
							placeholder="e.g., John Smith"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="curatorFr" class="block text-sm font-medium text-dark-600 mb-2">
							Commissaire (Français)
						</label>
						<input
							id="curatorFr"
							name="curatorFr"
							type="text"
							bind:value={curatorFr}
							placeholder="ex: Jean Smith"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="materialsEn" class="block text-sm font-medium text-dark-600 mb-2">
							Matériaux (Anglais)
						</label>
						<input
							id="materialsEn"
							name="materialsEn"
							type="text"
							bind:value={materialsEn}
							placeholder="e.g., Canvas, Wood, Digital"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="materialsFr" class="block text-sm font-medium text-dark-600 mb-2">
							Matériaux (Français)
						</label>
						<input
							id="materialsFr"
							name="materialsFr"
							type="text"
							bind:value={materialsFr}
							placeholder="ex: Toile, Bois, Numérique"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="admissionInfoEn" class="block text-sm font-medium text-dark-600 mb-2">
							Informations d'Admission (Anglais)
						</label>
						<input
							id="admissionInfoEn"
							name="admissionInfoEn"
							type="text"
							bind:value={admissionInfoEn}
							placeholder="e.g., Free, $25, Members Only"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="admissionInfoFr" class="block text-sm font-medium text-dark-600 mb-2">
							Informations d'Admission (Français)
						</label>
						<input
							id="admissionInfoFr"
							name="admissionInfoFr"
							type="text"
							bind:value={admissionInfoFr}
							placeholder="ex: Gratuit, 25$, Membres seulement"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>
				</div>

				<!-- Published Status -->
				<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
					<input
						id="published"
						name="published"
						type="checkbox"
						value="true"
						bind:checked={published}
						class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label for="published" class="block text-sm font-medium text-dark-900 cursor-pointer">
							Publier immédiatement
						</label>
						<p class="text-xs text-dark-400">
							Décochez pour sauvegarder comme brouillon
						</p>
					</div>
				</div>

				<!-- Spotlight Status -->
				<div class="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
					<input
						id="isSpotlight"
						name="isSpotlight"
						type="checkbox"
						value="true"
						bind:checked={isSpotlight}
						class="w-5 h-5 text-amber-900 border-amber-300 rounded focus:ring-amber-900"
					/>
					<div>
						<label for="isSpotlight" class="block text-sm font-medium text-amber-900 cursor-pointer">
							Marquer comme Événement à la Une
						</label>
						<p class="text-xs text-amber-600">
							Les événements à la une sont mis en vedette sur le site. Un seul événement peut être à la une à la fois.
						</p>
					</div>
				</div>

				<!-- Submit Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border-card">
					<button
						type="submit"
						name="action"
						value="create"
						class="flex-1 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium"
					>
						Créer l'Événement
					</button>
					<a
						href="/admin/events"
						class="flex-1 px-6 py-3 bg-white border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium text-center"
					>
						Annuler
					</a>
				</div>
			</form>
		</div>
</div>
