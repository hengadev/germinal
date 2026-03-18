<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Plus,
        Calendar,
        MapPin,
        Eye,
        EyeOff,
        Edit,
        Trash2,
        X,
        FileText,
        Tag,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
    import type { Snippet } from "svelte";
    import { browser } from "$app/environment";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";
    import EventCategoriesTab from "./EventCategoriesTab.svelte";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    let {
        data,
        form,
    }: { data: PageData; form: ActionData & { success?: string } } = $props();

    const toast = getToastContext();

    // Detect if we're on mobile
    let isMobile = $state(false);

    if (browser) {
        isMobile = window.innerWidth < 768;
        window.addEventListener("resize", () => {
            isMobile = window.innerWidth < 768;
        });
    }

    // Tab state
    let activeTab = $state<'events' | 'categories'>('categories');
    let catCreateDialogOpen = $state(false);

    // Event type
    type Event = (typeof data.events)[number];

    // Dialog states
    let editDialogOpen = $state(false);
    let deleteDialogOpen = $state(false);

    // Currently selected event for edit/delete
    let selectedEvent: Event | null = $state(null);

    // Form state for edit
    let editTitle = $state("");
    let editSlug = $state("");
    let editDescription = $state("");
    let editStartDate = $state("");
    let editEndDate = $state("");
    let editLocation = $state("");
    let editCategoryId = $state("");
    let editPublished = $state(false);
    let editIsSpotlight = $state(false);

    // use:enhance handlers replace $effect-based form handling (more reliable in Svelte 5)
    function updateEventEnhance() {
        return async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: (opts?: { reset?: boolean }) => Promise<void> }) => {
            if (result.type === 'success') {
                editDialogOpen = false;
                toast.success("Succès", (result.data as { success?: string })?.success ?? 'Événement mis à jour');
            } else if (result.type === 'failure') {
                toast.error("Erreur", (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
            }
            await update({ reset: false });
        };
    }

    function deleteEventEnhance() {
        return async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: (opts?: { reset?: boolean }) => Promise<void> }) => {
            if (result.type === 'success') {
                deleteDialogOpen = false;
                toast.success("Succès", (result.data as { success?: string })?.success ?? 'Événement supprimé');
            } else if (result.type === 'failure') {
                toast.error("Erreur", (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
            }
            await update({ reset: false });
        };
    }

    function formatDateForInput(date: Date | string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function openEditDialog(event: Event) {
        selectedEvent = event;
        editTitle = event.titleEn;
        editSlug = event.slug;
        editDescription = event.descriptionEn;
        editStartDate = formatDateForInput(event.startDate);
        editEndDate = formatDateForInput(event.endDate);
        editLocation = event.location;
        editCategoryId = event.categoryId || "";
        editPublished = event.published;
        editIsSpotlight = event.isSpotlight ?? false;
        editDialogOpen = true;
    }

    function openDeleteDialog(event: Event) {
        selectedEvent = event;
        deleteDialogOpen = true;
    }

    function formatDate(date: Date | string): string {
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function formatDateTime(date: Date | string): string {
        return new Date(date).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Snippet for form fields
    type InputSnippet = Snippet<[fieldName: string]>;
</script>

{#snippet editInput(fieldName: string)}
    {#if fieldName === "title"}
        <input
            id="editTitle"
            name="titleEn"
            type="text"
            bind:value={editTitle}
            required
            placeholder="Summer Music Festival"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "slug"}
        <input
            id="editSlug"
            name="slug"
            type="text"
            bind:value={editSlug}
            required
            pattern="^[a-z0-9-]+$"
            placeholder="summer-music-festival"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "description"}
        <textarea
            id="editDescription"
            name="descriptionEn"
            bind:value={editDescription}
            required
            rows="4"
            placeholder="Describe your event..."
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
        ></textarea>
    {:else if fieldName === "startDate"}
        <input
            id="editStartDate"
            name="startDate"
            type="datetime-local"
            bind:value={editStartDate}
            required
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "endDate"}
        <input
            id="editEndDate"
            name="endDate"
            type="datetime-local"
            bind:value={editEndDate}
            required
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "location"}
        <input
            id="editLocation"
            name="location"
            type="text"
            bind:value={editLocation}
            required
            placeholder="123 Main St, City, Country"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "categoryId"}
        <div class="relative">
            <Tag size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <select
                id="editCategoryId"
                name="categoryId"
                bind:value={editCategoryId}
                class="w-full pl-9 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm appearance-none bg-white"
            >
                <option value="">Aucune catégorie</option>
                {#each (data.categories || []) as category}
                    <option value={category.id}>{category.displayNameFr} ({category.displayNameEn})</option>
                {/each}
            </select>
        </div>
    {/if}
{/snippet}

{#snippet field(
    name: string,
    label: string,
    inputSnippet: InputSnippet,
    value: string,
    error: string | null,
)}
    <label for={name} class="block text-sm font-medium text-dark-700 mb-1">
        {label}
    </label>
    <div class="relative w-full">
        {@render inputSnippet(name)}
        {#if error}
            <p class="text-xs text-red-600 mt-1">{error}</p>
        {/if}
    </div>
{/snippet}

<svelte:head>
    <title>Événements | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
    >
        <div>
            <h1 class="text-3xl lg:text-4xl font-bold mb-2">Événements</h1>
            <p class="text-dark-400">Gérez vos événements, expositions et catégories</p>
        </div>
        {#if activeTab === 'events'}
            <a
                href="/admin/events/new"
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
            >
                <Plus size={18} />
                <span>Nouvel Événement</span>
            </a>
        {:else}
            <button
                onclick={() => (catCreateDialogOpen = true)}
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
            >
                <Plus size={18} />
                <span>Nouvelle Catégorie</span>
            </button>
        {/if}
    </div>

    <!-- Tab navigation -->
    <div class="flex border-b border-border-card mb-8">
        <button
            onclick={() => (activeTab = 'categories')}
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px {activeTab === 'categories' ? 'border-dark-900 text-dark-900' : 'border-transparent text-dark-400 hover:text-dark-600'}"
        >
            Catégories
        </button>
        <button
            onclick={() => (activeTab = 'events')}
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px {activeTab === 'events' ? 'border-dark-900 text-dark-900' : 'border-transparent text-dark-400 hover:text-dark-600'}"
        >
            Événements
        </button>
    </div>

    {#if activeTab === 'events'}
    {#if data.events.length === 0}
        <div
            class="bg-white rounded-lg border border-border-card p-12 text-center"
        >
            <Calendar size={48} class="mx-auto mb-4 text-dark-300" />
            <h3 class="text-xl font-semibold text-dark-900 mb-2">
                Aucun événement pour le moment
            </h3>
            <p class="text-dark-400 mb-6">
                Créez votre premier événement pour commencer
            </p>
            <a
                href="/admin/events/new"
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
            >
                <Plus size={18} />
                <span>Créer un Événement</span>
            </a>
        </div>
    {:else}
        <!-- Table view for desktop -->
        <div
            class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block"
        >
            <table class="w-full">
                <thead class="bg-dark-50 border-b border-border-card">
                    <tr>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Événement
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Date
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Lieu
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Statut
                        </th>
                        <th
                            class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-card">
                    {#each data.events as event (event.id)}
                        <tr class="hover:bg-dark-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-start gap-3">
                                    {#if event.coverMedia?.url}
                                        <img
                                            src={event.coverMedia.url}
                                            alt=""
                                            class="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                                        />
                                    {:else}
                                        <div class="w-12 h-12 bg-dark-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Calendar size={20} class="text-dark-400" />
                                        </div>
                                    {/if}
                                    <div class="min-w-0">
                                        <p class="font-medium text-dark-900 truncate">
                                            {event.titleEn}
                                        </p>
                                        <p class="text-sm text-dark-400 truncate">
                                            {event.slug}
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm">
                                    <p class="font-medium text-dark-900">
                                        {formatDate(event.startDate)}
                                    </p>
                                    <p class="text-dark-400">
                                        {formatDate(event.endDate)}
                                    </p>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-1 text-sm text-dark-600">
                                    <MapPin size={16} class="flex-shrink-0" />
                                    <span class="truncate">{event.location}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-2">
                                    {#if event.published}
                                        <span
                                            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700"
                                        >
                                            <Eye size={12} />
                                            Publié
                                        </span>
                                    {:else}
                                        <span
                                            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-dark-50 text-dark-600"
                                        >
                                            <EyeOff size={12} />
                                            Brouillon
                                        </span>
                                    {/if}
                                    {#if event.isSpotlight}
                                        <span
                                            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700"
                                        >
                                            <Tag size={12} />
                                            À la une
                                        </span>
                                    {/if}
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center justify-end gap-2">
                                    <a
                                        href="/admin/events/{event.id}"
                                        class="p-2 text-dark-400 hover:text-dark-900 hover:bg-dark-100 rounded-lg transition-colors"
                                        title="Voir les détails"
                                    >
                                        <FileText size={18} />
                                    </a>
                                    <button
                                        onclick={() => openEditDialog(event)}
                                        class="p-2 text-dark-400 hover:text-dark-900 hover:bg-dark-100 rounded-lg transition-colors"
                                        title="Modifier"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button
                                        onclick={() => openDeleteDialog(event)}
                                        class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Card view for mobile -->
        <div class="lg:hidden space-y-4">
            {#each data.events as event (event.id)}
                <div class="bg-white rounded-lg border border-border-card overflow-hidden">
                    <div class="p-4">
                        <div class="flex gap-3 mb-3">
                            {#if event.coverMedia?.url}
                                <img
                                    src={event.coverMedia.url}
                                    alt=""
                                    class="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                                />
                            {:else}
                                <div class="w-16 h-16 bg-dark-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Calendar size={24} class="text-dark-400" />
                                </div>
                            {/if}
                            <div class="min-w-0 flex-1">
                                <h3 class="font-semibold text-dark-900 truncate">
                                    {event.titleEn}
                                </h3>
                                <p class="text-sm text-dark-400 truncate">
                                    {event.slug}
                                </p>
                                <div class="flex items-center gap-1 text-sm text-dark-600 mt-1">
                                    <MapPin size={14} class="flex-shrink-0" />
                                    <span class="truncate">{event.location}</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2 mb-3">
                            {#if event.published}
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700"
                                >
                                    <Eye size={12} />
                                    Publié
                                </span>
                            {:else}
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-dark-50 text-dark-600"
                                >
                                    <EyeOff size={12} />
                                    Brouillon
                                </span>
                            {/if}
                            {#if event.isSpotlight}
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700"
                                >
                                    <Tag size={12} />
                                    À la une
                                </span>
                            {/if}
                            <span
                                class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-dark-50 text-dark-600"
                            >
                                <Calendar size={12} />
                                {formatDate(event.startDate)}
                            </span>
                        </div>

                        <div class="flex items-center justify-between gap-2 pt-3 border-t border-border-card">
                            <a
                                href="/admin/events/{event.id}"
                                class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                            >
                                <FileText size={16} />
                                Détails
                            </a>
                            <button
                                onclick={() => openEditDialog(event)}
                                class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                            >
                                <Edit size={16} />
                                Modifier
                            </button>
                            <button
                                onclick={() => openDeleteDialog(event)}
                                class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} />
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    {:else}
        <EventCategoriesTab
            categories={data.categories}
            {isMobile}
            bind:createDialogOpen={catCreateDialogOpen}
        />
    {/if}
</div>

<!-- Edit Event Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={editDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">Modifier l'Événement</h2>
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">Mettre à jour les détails de l'événement</p>
        </div>

        <form
            method="POST"
            action="?/updateEvent"
            use:enhance={updateEventEnhance}
            class="grid gap-4 pt-4"
        >
            <input type="hidden" name="id" value={selectedEvent?.id} />

            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field("title", "Titre", editInput, editTitle, null)}
                {@render field("slug", "Slug", editInput, editSlug, null)}
                {@render field(
                    "description",
                    "Description",
                    editInput,
                    editDescription,
                    null,
                )}
                {@render field(
                    "startDate",
                    "Date de Début",
                    editInput,
                    editStartDate,
                    null,
                )}
                {@render field(
                    "endDate",
                    "Date de Fin",
                    editInput,
                    editEndDate,
                    null,
                )}
                {@render field(
                    "location",
                    "Lieu",
                    editInput,
                    editLocation,
                    null,
                )}
                {@render field(
                    "categoryId",
                    "Catégorie",
                    editInput,
                    editCategoryId,
                    null,
                )}

                {#if selectedEvent?.id}
                <div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    {#if selectedEvent.coverMedia?.url}
                        <img src={selectedEvent.coverMedia.url} alt="" class="w-10 h-10 object-cover rounded-md flex-shrink-0" />
                    {/if}
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-dark-700">Photos</p>
                        <a
                            href="/admin/events/{selectedEvent.id}#photos"
                            onclick={() => (editDialogOpen = false)}
                            class="text-xs text-dark-400 underline"
                        >
                            Gérer dans l'éditeur →
                        </a>
                    </div>
                </div>
                {/if}

                <div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    <input
                        id="editPublished"
                        name="published"
                        type="checkbox"
                        value="true"
                        bind:checked={editPublished}
                        class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                    />
                    <div>
                        <label
                            for="editPublished"
                            class="block text-sm font-medium text-dark-900 cursor-pointer"
                        >
                            Publié
                        </label>
                        <p class="text-xs text-dark-400">
                            Décochez pour sauvegarder comme brouillon
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <input
                        id="editIsSpotlight"
                        name="isSpotlight"
                        type="checkbox"
                        value="true"
                        bind:checked={editIsSpotlight}
                        class="w-4 h-4 text-amber-900 border-amber-300 rounded focus:ring-amber-900"
                    />
                    <div>
                        <label
                            for="editIsSpotlight"
                            class="block text-sm font-medium text-amber-900 cursor-pointer"
                        >
                            Prochain événement (Upcoming)
                        </label>
                        <p class="text-xs text-amber-600">
                            Un seul événement peut être mis en avant à la fois
                        </p>
                    </div>
                </div>
            </div>
            <div class="flex w-full justify-end gap-3 pt-2">
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    class="px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
                >
                    Enregistrer les Modifications
                </button>
            </div>
        </form>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={editDialogOpen}
        title="Modifier l'Événement"
        description="Mettre à jour les détails de l'événement"
    >
        <form
            method="POST"
            action="?/updateEvent"
            use:enhance={updateEventEnhance}
            class="grid gap-4"
        >
            <input type="hidden" name="id" value={selectedEvent?.id} />

            <div class="grid grid-cols-2 gap-4 w-full">
                <div class="col-span-2">
                    {@render field("title", "Titre", editInput, editTitle, null)}
                </div>
                <div class="col-span-2">
                    {@render field("slug", "Slug", editInput, editSlug, null)}
                </div>
                <div class="col-span-2">
                    {@render field(
                        "description",
                        "Description",
                        editInput,
                        editDescription,
                        null,
                    )}
                </div>
                <div>
                    {@render field(
                        "startDate",
                        "Date de Début",
                        editInput,
                        editStartDate,
                        null,
                    )}
                </div>
                <div>
                    {@render field(
                        "endDate",
                        "Date de Fin",
                        editInput,
                        editEndDate,
                        null,
                    )}
                </div>
                <div class="col-span-2">
                    {@render field(
                        "location",
                        "Lieu",
                        editInput,
                        editLocation,
                        null,
                    )}
                </div>
                <div class="col-span-2">
                    {@render field(
                        "categoryId",
                        "Catégorie",
                        editInput,
                        editCategoryId,
                        null,
                    )}
                </div>

                {#if selectedEvent?.id}
                <div class="col-span-2 flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    {#if selectedEvent.coverMedia?.url}
                        <img src={selectedEvent.coverMedia.url} alt="" class="w-12 h-12 object-cover rounded-md flex-shrink-0" />
                    {/if}
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-dark-700">Photos</p>
                        <a
                            href="/admin/events/{selectedEvent.id}#photos"
                            onclick={() => (editDialogOpen = false)}
                            class="text-xs text-dark-400 underline hover:text-dark-600"
                        >
                            Gérer les photos dans l'éditeur →
                        </a>
                    </div>
                </div>
                {/if}
            </div>

            <div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
                <input
                    id="editPublished"
                    name="published"
                    type="checkbox"
                    value="true"
                    bind:checked={editPublished}
                    class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                />
                <div>
                    <label
                        for="editPublished"
                        class="block text-sm font-medium text-dark-900 cursor-pointer"
                    >
                        Publié
                    </label>
                    <p class="text-xs text-dark-400">
                        Décochez pour sauvegarder comme brouillon
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <input
                    id="editIsSpotlightDesktop"
                    name="isSpotlight"
                    type="checkbox"
                    value="true"
                    bind:checked={editIsSpotlight}
                    class="w-5 h-5 text-amber-900 border-amber-300 rounded focus:ring-amber-900"
                />
                <div>
                    <label
                        for="editIsSpotlightDesktop"
                        class="block text-sm font-medium text-amber-900 cursor-pointer"
                    >
                        Prochain événement (Upcoming)
                    </label>
                    <p class="text-xs text-amber-600">
                        Un seul événement peut être mis en avant à la fois
                    </p>
                </div>
            </div>

            <div class="flex w-full justify-end gap-3 pt-2">
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    class="px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
                >
                    Enregistrer les Modifications
                </button>
            </div>
        </form>
    </Modal>
{/if}

<!-- Delete Event Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={deleteDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Supprimer l'Événement
                </h2>
                <button
                    type="button"
                    onclick={() => (deleteDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">
                Êtes-vous sûr de vouloir supprimer "{selectedEvent?.titleEn}" ? Cette
                action ne peut pas être annulée.
            </p>
        </div>

        <div class="pt-4">
            <form method="POST" action="?/deleteEvent" use:enhance={deleteEventEnhance}>
                <input type="hidden" name="id" value={selectedEvent?.id} />

                <div class="flex w-full justify-end gap-3">
                    <button
                        type="button"
                        onclick={() => (deleteDialogOpen = false)}
                        class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                    >
                        Delete
                    </button>
                </div>
            </form>
        </div>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={deleteDialogOpen}
        title="Supprimer l'Événement"
        description="Êtes-vous sûr de vouloir supprimer '{selectedEvent?.titleEn}' ? Cette action ne peut pas être annulée."
    >
        <form method="POST" action="?/deleteEvent" use:enhance={deleteEventEnhance} class="mt-6">
            <input type="hidden" name="id" value={selectedEvent?.id} />

            <div class="flex w-full justify-end gap-3">
                <button
                    type="button"
                    onclick={() => (deleteDialogOpen = false)}
                    class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    class="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                    Supprimer
                </button>
            </div>
        </form>
    </Modal>
{/if}
