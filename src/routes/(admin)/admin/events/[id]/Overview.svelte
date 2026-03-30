<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { Calendar, MapPin, Type, FileText } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	function updateEventEnhance() {
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Événement mis à jour');
				goto('/admin/events');
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			}
		};
	}

	let titleEn = $state(data.event.titleEn || "");
	let titleFr = $state(data.event.titleFr || "");
	let slug = $state(data.event.slug);
	let descriptionEn = $state(data.event.descriptionEn || "");
	let descriptionFr = $state(data.event.descriptionFr || "");
	let subtitleEn = $state(data.event.subtitleEn || "");
	let subtitleFr = $state(data.event.subtitleFr || "");
	let startDate = $state(
		new Date(data.event.startDate).toISOString().slice(0, 16)
	);
	let endDate = $state(
		new Date(data.event.endDate).toISOString().slice(0, 16)
	);
	let locationEn = $state(data.event.locationEn);
	let locationFr = $state(data.event.locationFr);
	let venueNameEn = $state(data.event.venueNameEn || "");
	let venueNameFr = $state(data.event.venueNameFr || "");
	let streetAddressEn = $state(data.event.streetAddressEn || "");
	let streetAddressFr = $state(data.event.streetAddressFr || "");
	let districtEn = $state(data.event.districtEn || "");
	let districtFr = $state(data.event.districtFr || "");
	let cityEn = $state(data.event.cityEn || "");
	let cityFr = $state(data.event.cityFr || "");
	let postalCode = $state(data.event.postalCode || "");
	let countryEn = $state(data.event.countryEn || "");
	let countryFr = $state(data.event.countryFr || "");
	let collaborators = $state<Array<{talentId: string, name: string, role: string}>>(
		data.event.collaborators ? JSON.parse(data.event.collaborators) : []
	);
	let timings = $state<Array<{label: string, time: string}>>(
		data.event.timings ? JSON.parse(data.event.timings) : []
	);
	let curatorEn = $state(data.event.curatorEn || "");
	let curatorFr = $state(data.event.curatorFr || "");
	let materialsEn = $state(data.event.materialsEn || "");
	let materialsFr = $state(data.event.materialsFr || "");
	let admissionInfoEn = $state(data.event.admissionInfoEn || "");
	let admissionInfoFr = $state(data.event.admissionInfoFr || "");
	let published = $state(data.event.published);
	let isSpotlight = $state(data.event.isSpotlight ?? false);
</script>

<div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
 <form method="POST" action="?/updateEvent" use:enhance={updateEventEnhance} class="space-y-6">
 <!-- Title (English) -->
 <div>
 <label for="titleEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Title (English) <span class="text-red-500">*</span>
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
 required
 placeholder="Summer Music Festival 2026"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Title (French) -->
 <div>
 <label for="titleFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Title (French) <span class="text-red-500">*</span>
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
 required
 placeholder="Festival de musique d'été 2026"
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
                />
            </div>
        </div>

        <!-- Slug -->
        <div>
            <label for="slug" class="block text-sm font-medium text-foreground-alt mb-2">
                Slug <span class="text-red-500">*</span>
            </label>
            <div class="relative">
                <Type
                    size={18}
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    id="slug"
                    name="slug"
                    type="text"
                    bind:value={slug}
                    required
                    pattern="[a-z0-9-]+"
                    placeholder="summer-music-festival-2026"
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent font-mono text-sm"
                />
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
                Version URL du titre (minuscules, tirets uniquement)
            </p>
        </div>

        <!-- Description (English) -->
        <div>
            <label for="descriptionEn" class="block text-sm font-medium text-foreground-alt mb-2">
                Description (English) <span class="text-red-500">*</span>
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
                    required
                    rows="5"
                    placeholder="Describe your event..."
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
                ></textarea>
            </div>
        </div>

        <!-- Description (French) -->
        <div>
            <label for="descriptionFr" class="block text-sm font-medium text-foreground-alt mb-2">
                Description (French) <span class="text-red-500">*</span>
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
                    required
                    rows="5"
                    placeholder="Décrivez votre événement..."
                    class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
                ></textarea>
            </div>
        </div>

        <!-- Subtitle (English) -->
        <div>
            <label for="subtitleEn" class="block text-sm font-medium text-foreground-alt mb-2">
                Subtitle (English) (Optional)
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

        <!-- Subtitle (French) -->
        <div>
            <label for="subtitleFr" class="block text-sm font-medium text-foreground-alt mb-2">
                Subtitle (French) (Optional)
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

 <!-- Dates -->
 <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label for="startDate" class="block text-sm font-medium text-foreground-alt mb-2">
 Date de Début <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <Calendar
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="startDate"
 name="startDate"
 type="datetime-local"
 bind:value={startDate}
 required
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <div>
 <label for="endDate" class="block text-sm font-medium text-foreground-alt mb-2">
 Date de Fin <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <Calendar
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="endDate"
 name="endDate"
 type="datetime-local"
 bind:value={endDate}
 required
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>
 </div>

 <!-- Lieu (English) -->
 <div>
 <label for="locationEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Lieu (Anglais) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <MapPin
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="locationEn"
 name="locationEn"
 type="text"
 bind:value={locationEn}
 required
 placeholder="Central Park, New York"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Lieu (French) -->
 <div>
 <label for="locationFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Lieu (Français) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <MapPin
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="locationFr"
 name="locationFr"
 type="text"
 bind:value={locationFr}
 required
 placeholder="Central Park, New York"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Venue Details -->
 <div class="space-y-4">
 <h3 class="text-sm font-medium text-foreground-alt">Détails du Lieu (Optionnel)</h3>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label for="venueNameEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Nom du Lieu (Anglais)
 </label>
 <input
 id="venueNameEn"
 name="venueNameEn"
 type="text"
 bind:value={venueNameEn}
 placeholder="ex: Central Convention Center"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="venueNameFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Nom du Lieu (Français)
 </label>
 <input
 id="venueNameFr"
 name="venueNameFr"
 type="text"
 bind:value={venueNameFr}
 placeholder="ex: Centre de Conventions Central"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label for="streetAddressEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Adresse Rue (Anglais)
 </label>
 <input
 id="streetAddressEn"
 name="streetAddressEn"
 type="text"
 bind:value={streetAddressEn}
 placeholder="ex: 123 Main Street"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="streetAddressFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Adresse Rue (Français)
 </label>
 <input
 id="streetAddressFr"
 name="streetAddressFr"
 type="text"
 bind:value={streetAddressFr}
 placeholder="ex: 123 rue Principale"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label for="districtEn" class="block text-sm font-medium text-foreground-alt mb-2">
 District (Anglais)
 </label>
 <input
 id="districtEn"
 name="districtEn"
 type="text"
 bind:value={districtEn}
 placeholder="ex: Downtown"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="districtFr" class="block text-sm font-medium text-foreground-alt mb-2">
 District (Français)
 </label>
 <input
 id="districtFr"
 name="districtFr"
 type="text"
 bind:value={districtFr}
 placeholder="ex: Centre-ville"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <label for="cityEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Ville (Anglais)
 </label>
 <input
 id="cityEn"
 name="cityEn"
 type="text"
 bind:value={cityEn}
 placeholder="ex: Tokyo"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="cityFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Ville (Français)
 </label>
 <input
 id="cityFr"
 name="cityFr"
 type="text"
 bind:value={cityFr}
 placeholder="ex: Tokyo"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="postalCode" class="block text-sm font-medium text-foreground-alt mb-2">
 Code Postal
 </label>
 <input
 id="postalCode"
 name="postalCode"
 type="text"
 bind:value={postalCode}
 placeholder="ex: 12345"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label for="countryEn" class="block text-sm font-medium text-foreground-alt mb-2">
 Pays (Anglais)
 </label>
 <input
 id="countryEn"
 name="countryEn"
 type="text"
 bind:value={countryEn}
 placeholder="ex: Japan"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label for="countryFr" class="block text-sm font-medium text-foreground-alt mb-2">
 Pays (Français)
 </label>
 <input
 id="countryFr"
 name="countryFr"
 type="text"
 bind:value={countryFr}
 placeholder="ex: Japon"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>
 </div>

 <!-- Collaborators -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Collaborateurs (Optionnel)
 </label>
 <p class="text-xs text-muted-foreground mb-3">Ajouter des talents ou partenaires collaborants</p>

 <div class="space-y-2">
 {#each collaborators as collab, i}
 <div class="flex gap-2 items-center">
 <select
 bind:value={collaborators[i].talentId}
 onchange={() => {
 const talent = (data.talents || []).find(t => t.id === collaborators[i].talentId);
 if (talent) collaborators[i].name = talent.firstName + ' ' + talent.lastName;
 }}
 class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
 >
 <option value="">Sélectionner un talent...</option>
 {#each (data.talents || []) as talent}
 <option value={talent.id}>{talent.firstName} {talent.lastName}</option>
 {/each}
 </select>
 <input
 type="text"
 bind:value={collaborators[i].role}
 placeholder="Rôle"
 class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
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
 onclick={() => collaborators = [...collaborators, {talentId: "", name: "", role: ""}]}
 class="text-sm text-foreground-alt hover:text-foreground font-medium"
 >
 + Ajouter un Collaborateur
 </button>
 </div>

 <input type="hidden" name="collaborators" value={JSON.stringify(collaborators.filter(c => c.name.trim() && c.role.trim()))} />
 </div>

 <!-- Timings -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Horaires de l'Événement (Optionnel)
            </label>
            <p class="text-xs text-muted-foreground mb-3">Ajouter des informations de planning pour différentes sessions</p>

            <div class="space-y-2">
                {#each timings as timing, i}
                    <div class="flex gap-2">
                        <input
                            type="text"
                            bind:value={timings[i].label}
                            placeholder="ex: Soirée d'ouverture"
                            class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                        />
                        <input
                            type="text"
                            bind:value={timings[i].time}
                            placeholder="ex: 18:00 - 22:00"
                            class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
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
                    class="text-sm text-foreground-alt hover:text-foreground font-medium"
                >
                    + Ajouter un Horaire
                </button>
            </div>

            <input type="hidden" name="timings" value={JSON.stringify(timings.filter(t => t.label.trim() && t.time.trim()))} />
        </div>

        <!-- Event Details -->
        <div class="space-y-4">
            <h3 class="text-sm font-medium text-foreground-alt">Détails Supplémentaires (Optionnel)</h3>

            <div>
                <label for="curatorEn" class="block text-sm font-medium text-foreground-alt mb-2">
                    Commissaire (Anglais)
                </label>
                <input
                    id="curatorEn"
                    name="curatorEn"
                    type="text"
                    bind:value={curatorEn}
                    placeholder="ex: John Smith"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>

            <div>
                <label for="curatorFr" class="block text-sm font-medium text-foreground-alt mb-2">
                    Commissaire (Français)
                </label>
                <input
                    id="curatorFr"
                    name="curatorFr"
                    type="text"
                    bind:value={curatorFr}
                    placeholder="ex: Jean Smith"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>

            <div>
                <label for="materialsEn" class="block text-sm font-medium text-foreground-alt mb-2">
                    Matériaux (Anglais)
                </label>
                <input
                    id="materialsEn"
                    name="materialsEn"
                    type="text"
                    bind:value={materialsEn}
                    placeholder="ex: Canvas, Wood, Digital"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>

            <div>
                <label for="materialsFr" class="block text-sm font-medium text-foreground-alt mb-2">
                    Matériaux (Français)
                </label>
                <input
                    id="materialsFr"
                    name="materialsFr"
                    type="text"
                    bind:value={materialsFr}
                    placeholder="ex: Toile, Bois, Numérique"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>

            <div>
                <label for="admissionInfoEn" class="block text-sm font-medium text-foreground-alt mb-2">
                    Informations d'Admission (Anglais)
                </label>
                <input
                    id="admissionInfoEn"
                    name="admissionInfoEn"
                    type="text"
                    bind:value={admissionInfoEn}
                    placeholder="ex: Free, $25, Members Only"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>

            <div>
                <label for="admissionInfoFr" class="block text-sm font-medium text-foreground-alt mb-2">
                    Informations d'Admission (Français)
                </label>
                <input
                    id="admissionInfoFr"
                    name="admissionInfoFr"
                    type="text"
                    bind:value={admissionInfoFr}
                    placeholder="ex: Gratuit, 25$, Membres seulement"
                    class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                />
            </div>
        </div>

        <!-- Published Status -->
        <div class="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <input
                id="published"
                name="published"
                type="checkbox"
                bind:checked={published}
                value="true"
                class="w-5 h-5 text-foreground border-border-input rounded focus:ring-foreground"
            />
            <div>
                <label for="published" class="block text-sm font-medium text-foreground cursor-pointer">
                    Publié
                </label>
                <p class="text-xs text-muted-foreground">
                    Décocher pour sauvegarder comme brouillon
                </p>
            </div>
        </div>

        <!-- Spotlight Status -->
        <div class="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <input
                id="isSpotlight"
                name="isSpotlight"
                type="checkbox"
                bind:checked={isSpotlight}
                value="true"
                class="w-5 h-5 text-amber-900 border-amber-300 rounded focus:ring-amber-900"
            />
            <div>
                <label for="isSpotlight" class="block text-sm font-medium text-amber-900 cursor-pointer">
                    Marquer comme Événement à la Une
                </label>
                <p class="text-xs text-amber-600">
                    Les événements à la une sont mis en avant sur le site. Un seul événement peut être à la une à la fois.
                </p>
            </div>
        </div>

        <!-- Submit Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border-card">
            <button
                type="submit"
                class="flex-1 px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium"
            >
                Mettre à jour l'Événement
            </button>
            <a
                href="/admin/events"
                class="flex-1 px-6 py-3 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium text-center"
            >
                Annuler
            </a>
        </div>
    </form>
</div>
