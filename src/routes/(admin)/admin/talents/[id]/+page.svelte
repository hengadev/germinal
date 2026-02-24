<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, User, Briefcase, FileText, Link as LinkIcon } from 'lucide-svelte';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import type { ActionData, PageData } from './$types';
	import type { Media } from '$lib/types/media';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	// Show toast on form changes
	$effect(() => {
		if (form?.success) {
			toast.success("Succès", form.success || "Modifications enregistrées");
		}
	});

	$effect(() => {
		if (form?.error) {
			toast.error("Erreur", form.error);
		}
	});

	let firstName = $state(data.talent.firstName);
	let lastName = $state(data.talent.lastName);
	let roleEn = $state(data.talent.roleEn || "");
	let roleFr = $state(data.talent.roleFr || "");
	let bioEn = $state(data.talent.bioEn || "");
	let bioFr = $state(data.talent.bioFr || "");
	let city = $state(data.talent.city || "");
	let country = $state(data.talent.country || "");
	let quoteEn = $state(data.talent.quoteEn || "");
	let quoteFr = $state(data.talent.quoteFr || "");
	let specializationsEn = $state<string[]>(
		data.talent.specializationsEn ? JSON.parse(data.talent.specializationsEn) : []
	);
	let specializationsFr = $state<string[]>(
		data.talent.specializationsFr ? JSON.parse(data.talent.specializationsFr) : []
	);
	let instagram = $state(data.talent.socialLinks?.instagram || '');
	let linkedin = $state(data.talent.socialLinks?.linkedin || '');
	let twitter = $state(data.talent.socialLinks?.twitter || '');
	let website = $state(data.talent.socialLinks?.website || '');
	let published = $state(data.talent.published);

	// Media upload state
	const existingProfileMedia = data.talent.profileMedia
		? [data.talent.profileMedia]
		: [];
	let profileMediaId = $state(data.talent.profileMedia?.id ?? null);
	let mediaAction: 'unchanged' | 'replaced' | 'removed' = $state('unchanged');
	let newMediaId: string | null = $state(null);

	function handleUpload(media: Media[]) {
		if (media.length > 0) {
			newMediaId = media[0].id;
			mediaAction = 'replaced';
		}
	}

	function handleSupprimer(mediaId: string) {
		if (profileMediaId === mediaId) {
			mediaAction = 'removed';
			newMediaId = null;
		}
	}
</script>

<svelte:head>
	<title>Modifier le Talent | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="max-w-3xl mx-auto">
		<div class="mb-8">
			<a
				href="/admin/talents"
				class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors mb-4"
			>
				<ArrowLeft size={20} />
				<span>Retour aux Talents</span>
			</a>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Modifier le Talent</h1>
			<p class="text-dark-400">
				Updating "{data.talent.firstName} {data.talent.lastName}"
			</p>
		</div>

		{#if form?.error}
			<div class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
				<p class="text-sm font-medium">{form.error}</p>
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
				<p class="text-sm font-medium">{form.success}</p>
			</div>
		{/if}

		<div class="bg-white rounded-lg border border-border-card p-6 lg:p-8">
			<form method="POST" use:enhance class="space-y-6">
				<!-- Photo de Profil Section -->
				<div class="form-section">
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Photo de Profil
					</label>
					<p class="text-xs text-dark-400 mb-3">
						{existingProfileMedia.length > 0 ? 'Replace or remove the current profile photo' : 'Upload a profile photo for this talent'}
					</p>
					<MediaUpload
						mode="single"
						entityType="talent"
						existingMedia={existingProfileMedia}
						maxSizeMB={5}
						onUpload={handleUpload}
						onSupprimer={handleSupprimer}
					/>
					<input type="hidden" name="mediaAction" value={mediaAction} />
					<input type="hidden" name="existingMediaId" value={profileMediaId ?? ''} />
					<input type="hidden" name="newMediaId" value={newMediaId ?? ''} />
				</div>

				<!-- Name -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<label for="firstName" class="block text-sm font-medium text-dark-700 mb-2">
							Prénom <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<User
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="firstName"
								name="firstName"
								type="text"
								bind:value={firstName}
								required
								placeholder="Sarah"
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>

					<div>
						<label for="lastName" class="block text-sm font-medium text-dark-700 mb-2">
							Nom <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<User
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="lastName"
								name="lastName"
								type="text"
								bind:value={lastName}
								required
								placeholder="Johnson"
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>
				</div>

				<!-- Role (English) -->
				<div>
					<label for="roleEn" class="block text-sm font-medium text-dark-700 mb-2">
						Rôle (Anglais) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Briefcase
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="roleEn"
							name="roleEn"
							type="text"
							bind:value={roleEn}
							required
							placeholder="Lead Vocalist & Songwriter"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Role (French) -->
				<div>
					<label for="roleFr" class="block text-sm font-medium text-dark-700 mb-2">
						Rôle (Français) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Briefcase
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="roleFr"
							name="roleFr"
							type="text"
							bind:value={roleFr}
							required
							placeholder="Chanteur principal et auteur-compositeur"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Bio (English) -->
				<div>
					<label for="bioEn" class="block text-sm font-medium text-dark-700 mb-2">
						Bio (Anglais) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="bioEn"
							name="bioEn"
							bind:value={bioEn}
							required
							rows="5"
							placeholder="Tell us about this talent..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Bio (French) -->
				<div>
					<label for="bioFr" class="block text-sm font-medium text-dark-700 mb-2">
						Bio (Français) <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="bioFr"
							name="bioFr"
							bind:value={bioFr}
							required
							rows="5"
							placeholder="Parlez-nous de ce talent..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Location -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Emplacement (Optionnel)</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="city" class="block text-sm font-medium text-dark-600 mb-2">
								Ville
							</label>
							<input
								id="city"
								name="city"
								type="text"
								bind:value={city}
								placeholder="Tokyo"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
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
								placeholder="Japan"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
					</div>
				</div>

				<!-- Quote (English) -->
				<div>
					<label for="quoteEn" class="block text-sm font-medium text-dark-700 mb-2">
						Citation Personnelle (Anglais) (Optionnel)
					</label>
					<textarea
						id="quoteEn"
						name="quoteEn"
						bind:value={quoteEn}
						rows="2"
						placeholder="A meaningful quote or tagline..."
						class="w-full px-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
					></textarea>
				</div>

				<!-- Quote (French) -->
				<div>
					<label for="quoteFr" class="block text-sm font-medium text-dark-700 mb-2">
						Citation Personnelle (Français) (Optionnel)
					</label>
					<textarea
						id="quoteFr"
						name="quoteFr"
						bind:value={quoteFr}
						rows="2"
						placeholder="Une citation significative ou une phrase accrocheuse..."
						class="w-full px-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
					></textarea>
				</div>

				<!-- Specializations (English) -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Spécialisations (Anglais) (Optionnel)
					</label>
					<p class="text-xs text-dark-400 mb-3">Add up to 5 specializations</p>

					<div class="space-y-2">
						{#each specializationsEn as spec, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={specializationsEn[i]}
									placeholder="e.g., Spatial Audio Installation"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => specializationsEn = specializationsEn.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Supprimer
								</button>
							</div>
						{/each}

						{#if specializationsEn.length < 5}
							<button
								type="button"
								onclick={() => specializationsEn = [...specializationsEn, ""]}
								class="text-sm text-dark-600 hover:text-dark-900 font-medium"
							>
								+ Ajouter une Spécialisation
							</button>
						{/if}
					</div>

					<input type="hidden" name="specializationsEn" value={JSON.stringify(specializationsEn.filter(s => s.trim()))} />
				</div>

				<!-- Specializations (French) -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Spécialisations (Français) (Optionnel)
					</label>
					<p class="text-xs text-dark-400 mb-3">Ajoutez jusqu'à 5 spécialisations</p>

					<div class="space-y-2">
						{#each specializationsFr as spec, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={specializationsFr[i]}
									placeholder="ex: Installation audio spatiale"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => specializationsFr = specializationsFr.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Supprimer
								</button>
							</div>
						{/each}

						{#if specializationsFr.length < 5}
							<button
								type="button"
								onclick={() => specializationsFr = [...specializationsFr, ""]}
								class="text-sm text-dark-600 hover:text-dark-900 font-medium"
							>
								+ Ajouter une Spécialisation
							</button>
						{/if}
					</div>

					<input type="hidden" name="specializationsFr" value={JSON.stringify(specializationsFr.filter(s => s.trim()))} />
				</div>

				<!-- Social Links -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Liens Sociaux (Optionnel)</h3>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="instagram" class="block text-sm font-medium text-dark-600 mb-2">
								Instagram
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="instagram"
									name="instagram"
									type="url"
									bind:value={instagram}
									placeholder="https://instagram.com/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="linkedin" class="block text-sm font-medium text-dark-600 mb-2">
								LinkedIn
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="linkedin"
									name="linkedin"
									type="url"
									bind:value={linkedin}
									placeholder="https://linkedin.com/in/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="twitter" class="block text-sm font-medium text-dark-600 mb-2">
								Twitter
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="twitter"
									name="twitter"
									type="url"
									bind:value={twitter}
									placeholder="https://twitter.com/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="website" class="block text-sm font-medium text-dark-600 mb-2">
								Website
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="website"
									name="website"
									type="url"
									bind:value={website}
									placeholder="https://example.com"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Publié Status -->
				<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
					<input
						id="published"
						name="published"
						type="checkbox"
						bind:checked={published}
						value="true"
						class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label for="published" class="block text-sm font-medium text-dark-900 cursor-pointer">
							Publié
						</label>
						<p class="text-xs text-dark-400">
							Décochez pour sauvegarder comme brouillon
						</p>
					</div>
				</div>

				<!-- Submit Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border-card">
					<button
						type="submit"
						class="flex-1 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium"
					>
						Mettre à jour le Talent
					</button>
					<a
						href="/admin/talents"
						class="flex-1 px-6 py-3 bg-white border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium text-center"
					>
						Annuler
					</a>
				</div>
			</form>
		</div>
	</div>
</div>
