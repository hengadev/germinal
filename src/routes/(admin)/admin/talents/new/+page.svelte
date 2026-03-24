<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        ArrowLeft,
        User,
        Briefcase,
        FileText,
        Link as LinkIcon,
        Tag,
    } from "lucide-svelte";
    import MediaUpload from "$lib/components/MediaUpload.svelte";
    import type { ActionData } from "./$types";
    import type { PageData } from "./$types";
    import type { Media } from "$lib/types/media";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const toast = getToastContext();

    function createTalentEnhance() {
        return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
            if (result.type === 'success') {
                toast.success('Succès', (result.data as { success?: string })?.success ?? 'Talent créé');
            } else if (result.type === 'failure') {
                toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
 }
 };
 }

 let firstName = $state("");
 let lastName = $state("");
 let roleEn = $state("");
 let roleFr = $state("");
 let bioEn = $state("");
 let bioFr = $state("");
 let city = $state("");
 let country = $state("");
 let quoteEn = $state("");
 let quoteFr = $state("");
 let specializationsEn = $state<string[]>([]);
 let specializationsFr = $state<string[]>([]);
 let instagram = $state("");
 let linkedin = $state("");
 let twitter = $state("");
 let website = $state("");
 let categoryId = $state("");
 let published = $state(false);

 // Media upload state
 let profileMediaId: string | null = $state(null);

 function handleProfileUpload(media: Media[]) {
 if (media.length > 0) {
 profileMediaId = media[0].id;
 }
 }

 function handleProfileSupprimer(mediaId: string) {
 if (profileMediaId === mediaId) {
 profileMediaId = null;
 }
 }
</script>

<svelte:head>
 <title>Nouveau Talent | Tableau de bord Admin</title>
</svelte:head>

<div class="px-4 py-8 lg:py-12">
 <div class="mb-8">
 <a
 href="/admin/talents"
 class="inline-flex items-center gap-2 text-foreground-alt hover:text-foreground transition-colors mb-4"
 >
 <ArrowLeft size={20} />
 <span>Back to Talents</span>
 </a>
 <h1 class="text-3xl lg:text-4xl font-bold mb-2">Add New Talent</h1>
 <p class="text-muted-foreground">Fill in the details to add a new talent</p>
 </div>

 <div class="bg-background rounded-lg border border-border-card p-6 lg:p-8">
 <form method="POST" use:enhance={createTalentEnhance} class="space-y-6">
 <!-- Photo de Profil Section -->
 <div class="form-section">
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Photo de Profil
 </label>
 <p class="text-xs text-muted-foreground mb-3">Upload a profile photo for this talent</p>
 <MediaUpload
 mode="single"
 entityType="talent"
 maxSizeMB={5}
 onUpload={handleProfileUpload}
 onSupprimer={handleProfileSupprimer}
 />
 <input type="hidden" name="profileMediaId" value={profileMediaId ?? ''} />
 </div>

 <!-- Name -->
 <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label
 for="firstName"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Prénom <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <User
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="firstName"
 name="firstName"
 type="text"
 bind:value={firstName}
 required
 placeholder="Sarah"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <div>
 <label
 for="lastName"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Nom <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <User
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="lastName"
 name="lastName"
 type="text"
 bind:value={lastName}
 required
 placeholder="Johnson"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>
 </div>

 <!-- Role (English) -->
 <div>
 <label
 for="roleEn"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Rôle (Anglais) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <Briefcase
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="roleEn"
 name="roleEn"
 type="text"
 bind:value={roleEn}
 required
 placeholder="Lead Vocalist & Songwriter"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Role (French) -->
 <div>
 <label
 for="roleFr"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Rôle (Français) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <Briefcase
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <input
 id="roleFr"
 name="roleFr"
 type="text"
 bind:value={roleFr}
 required
 placeholder="Chanteur principal et auteur-compositeur"
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
 />
 </div>
 </div>

 <!-- Bio (English) -->
 <div>
 <label
 for="bioEn"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Bio (Anglais) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <FileText
 size={18}
 class="absolute left-3 top-3 text-muted-foreground"
 />
 <textarea
 id="bioEn"
 name="bioEn"
 bind:value={bioEn}
 required
 rows="5"
 placeholder="Tell us about this talent..."
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
 ></textarea>
 </div>
 </div>

 <!-- Bio (French) -->
 <div>
 <label
 for="bioFr"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Bio (Français) <span class="text-red-500">*</span>
 </label>
 <div class="relative">
 <FileText
 size={18}
 class="absolute left-3 top-3 text-muted-foreground"
 />
 <textarea
 id="bioFr"
 name="bioFr"
 bind:value={bioFr}
 required
 rows="5"
 placeholder="Parlez-nous de ce talent..."
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
 ></textarea>
 </div>
 </div>

 <!-- Category Selection -->
 <div>
 <label
 for="categoryId"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Catégorie (Optionnel)
 </label>
 <div class="relative">
 <Tag
 size={18}
 class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
 />
 <select
 id="categoryId"
 name="categoryId"
 bind:value={categoryId}
 class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent appearance-none bg-background"
 >
 <option value="">Aucune catégorie</option>
 {#each (data.categories || []) as category}
 <option value={category.id}>{category.displayNameFr} ({category.displayNameEn})</option>
 {/each}
 </select>
 </div>
 <p class="mt-1 text-xs text-muted-foreground">
 Lier ce talent à une catégorie existante
 </p>
 </div>

 <!-- Location -->
 <div class="space-y-4">
 <h3 class="text-sm font-medium text-foreground-alt">Emplacement (Optionnel)</h3>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label
 for="city"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Ville
 </label>
 <input
 id="city"
 name="city"
 type="text"
 bind:value={city}
 placeholder="Tokyo"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 <div>
 <label
 for="country"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Pays
 </label>
 <input
 id="country"
 name="country"
 type="text"
 bind:value={country}
 placeholder="Japan"
 class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
 />
 </div>
 </div>
 </div>

 <!-- Quote (English) -->
 <div>
 <label
 for="quoteEn"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Citation Personnelle (Anglais) (Optionnel)
 </label>
 <textarea
 id="quoteEn"
 name="quoteEn"
 bind:value={quoteEn}
 rows="2"
 placeholder="A meaningful quote or tagline..."
 class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
 ></textarea>
 </div>

 <!-- Quote (French) -->
 <div>
 <label
 for="quoteFr"
 class="block text-sm font-medium text-foreground-alt mb-2"
 >
 Citation Personnelle (Français) (Optionnel)
 </label>
 <textarea
 id="quoteFr"
 name="quoteFr"
 bind:value={quoteFr}
 rows="2"
 placeholder="Une citation significative ou une phrase accrocheuse..."
 class="w-full px-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
 ></textarea>
 </div>

 <!-- Specializations (English) -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Spécialisations (Anglais) (Optionnel)
 </label>
 <p class="text-xs text-muted-foreground mb-3">Add up to 5 specializations</p>

 <div class="space-y-2">
 {#each specializationsEn as spec, i}
 <div class="flex gap-2">
 <input
 type="text"
 bind:value={specializationsEn[i]}
 placeholder="e.g., Spatial Audio Installation"
 class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
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
 class="text-sm text-foreground-alt hover:text-foreground font-medium"
 >
 + Ajouter une Spécialisation
 </button>
 {/if}
 </div>

 <input type="hidden" name="specializationsEn" value={JSON.stringify(specializationsEn.filter(s => s.trim()))} />
 </div>

 <!-- Specializations (French) -->
 <div>
 <label class="block text-sm font-medium text-foreground-alt mb-2">
 Spécialisations (Français) (Optionnel)
 </label>
 <p class="text-xs text-muted-foreground mb-3">Ajoutez jusqu'à 5 spécialisations</p>

                    <div class="space-y-2">
                        {#each specializationsFr as spec, i}
                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    bind:value={specializationsFr[i]}
                                    placeholder="ex: Installation audio spatiale"
                                    class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
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
                                class="text-sm text-foreground-alt hover:text-foreground font-medium"
                            >
                                + Ajouter une Spécialisation
                            </button>
                        {/if}
                    </div>

                    <input type="hidden" name="specializationsFr" value={JSON.stringify(specializationsFr.filter(s => s.trim()))} />
                </div>

                <!-- Social Links -->
                <div class="space-y-4">
                    <h3 class="text-sm font-medium text-foreground-alt">
                        Liens Sociaux (Optionnel)
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                for="instagram"
                                class="block text-sm font-medium text-foreground-alt mb-2"
                            >
                                Instagram
                            </label>
                            <div class="relative">
                                <LinkIcon
                                    size={18}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <input
                                    id="instagram"
                                    name="instagram"
                                    type="url"
                                    bind:value={instagram}
                                    placeholder="https://instagram.com/username"
                                    class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                for="linkedin"
                                class="block text-sm font-medium text-foreground-alt mb-2"
                            >
                                LinkedIn
                            </label>
                            <div class="relative">
                                <LinkIcon
                                    size={18}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <input
                                    id="linkedin"
                                    name="linkedin"
                                    type="url"
                                    bind:value={linkedin}
                                    placeholder="https://linkedin.com/in/username"
                                    class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                for="twitter"
                                class="block text-sm font-medium text-foreground-alt mb-2"
                            >
                                Twitter
                            </label>
                            <div class="relative">
                                <LinkIcon
                                    size={18}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <input
                                    id="twitter"
                                    name="twitter"
                                    type="url"
                                    bind:value={twitter}
                                    placeholder="https://twitter.com/username"
                                    class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                for="website"
                                class="block text-sm font-medium text-foreground-alt mb-2"
                            >
                                Website
                            </label>
                            <div class="relative">
                                <LinkIcon
                                    size={18}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <input
                                    id="website"
                                    name="website"
                                    type="url"
                                    bind:value={website}
                                    placeholder="https://example.com"
                                    class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Published Status -->
                <div class="flex items-center gap-3 p-4 bg-muted rounded-lg">
                    <input
                        id="published"
                        name="published"
                        type="checkbox"
                        bind:checked={published}
                        class="w-5 h-5 text-foreground border-border-input rounded focus:ring-foreground"
                    />
                    <div>
                        <label
                            for="published"
                            class="block text-sm font-medium text-foreground cursor-pointer"
                        >
                            Publier immédiatement
                        </label>
                        <p class="text-xs text-muted-foreground">
                            Décochez pour sauvegarder comme brouillon
                        </p>
                    </div>
                </div>

                <!-- Submit Buttons -->
                <div
                    class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border-card"
                >
                    <button
                        type="submit"
                        name="action"
                        value="create"
                        class="flex-1 px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium"
                    >
                        Ajouter le Talent
                    </button>
                    <a
                        href="/admin/talents"
                        class="flex-1 px-6 py-3 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium text-center"
                    >
                        Annuler
                    </a>
                </div>
            </form>
        </div>
</div>
