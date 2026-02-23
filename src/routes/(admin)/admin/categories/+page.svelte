<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Plus,
        Tag,
        Eye,
        EyeOff,
        Edit,
        Trash2,
        X,
        Hash,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
    import type { Snippet } from "svelte";
    import { browser } from "$app/environment";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";

    let {
        data,
        form,
    }: { data: PageData; form: ActionData & { success?: string } } = $props();

    // Detect if we're on mobile
    let isMobile = $state(false);

    if (browser) {
        isMobile = window.innerWidth < 768;
        window.addEventListener("resize", () => {
            isMobile = window.innerWidth < 768;
        });
    }

    // Category type
    type Category = (typeof data.categories)[number];

    // Dialog states
    let createDialogOpen = $state(false);
    let editDialogOpen = $state(false);
    let deleteDialogOpen = $state(false);

    // Currently selected category for edit/delete
    let selectedCategory: Category | null = $state(null);

    // Form state for create
    let createName = $state("");
    let createDisplayNameEn = $state("");
    let createDisplayNameFr = $state("");
    let createSlug = $state("");
    let createDescription = $state("");
    let createIcon = $state("");
    let createColor = $state("#000000");
    let createSortOrder = $state("0");
    let createPublié = $state(true);

    // Auto-generate slug from name
    $effect(() => {
        if (createName) {
            createSlug = createName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
        }
    });

    // Form state for edit
    let editName = $state("");
    let editDisplayNameEn = $state("");
    let editDisplayNameFr = $state("");
    let editSlug = $state("");
    let editDescription = $state("");
    let editIcon = $state("");
    let editColor = $state("#000000");
    let editSortOrder = $state("0");
    let editPublié = $state(true);

    // Auto-generate slug from name for edit
    $effect(() => {
        if (editName) {
            editSlug = editName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
        }
    });

    // Reset form after successful action
    $effect(() => {
        if (form?.success) {
            createDialogOpen = false;
            editDialogOpen = false;
            deleteDialogOpen = false;
            resetCreateForm();
        }
    });

    function resetCreateForm() {
        createName = "";
        createDisplayNameEn = "";
        createDisplayNameFr = "";
        createSlug = "";
        createDescription = "";
        createIcon = "";
        createColor = "#000000";
        createSortOrder = "0";
        createPublié = true;
    }

    function openCreateDialog() {
        resetCreateForm();
        createDialogOpen = true;
    }

    function openEditDialog(category: Category) {
        selectedCategory = category;
        editName = category.name;
        editDisplayNameEn = category.displayNameEn;
        editDisplayNameFr = category.displayNameFr;
        editSlug = category.slug;
        editDescription = category.description ?? "";
        editIcon = category.icon ?? "";
        editColor = category.color ?? "#000000";
        editSortOrder = String(category.sortOrder);
        editPublié = category.published;
        editDialogOpen = true;
    }

    function openSupprimerDialog(category: Category) {
        selectedCategory = category;
        deleteDialogOpen = true;
    }

    // Snippet for form fields
    type InputSnippet = Snippet<[fieldName: string]>;
</script>

{#snippet createInput(fieldName: string)}
    {#if fieldName === "name"}
        <input
            id="createName"
            name="name"
            type="text"
            bind:value={createName}
            required
            placeholder="exhibition"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "displayNameEn"}
        <input
            id="createDisplayNameEn"
            name="displayNameEn"
            type="text"
            bind:value={createDisplayNameEn}
            required
            placeholder="Exhibitions"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "displayNameFr"}
        <input
            id="createDisplayNameFr"
            name="displayNameFr"
            type="text"
            bind:value={createDisplayNameFr}
            required
            placeholder="Expositions"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "slug"}
        <input
            id="createSlug"
            name="slug"
            type="text"
            bind:value={createSlug}
            required
            pattern="^[a-z0-9-]+$"
            placeholder="exhibitions"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "description"}
        <textarea
            id="createDescription"
            name="description"
            bind:value={createDescription}
            rows="3"
            placeholder="Optional description..."
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
        ></textarea>
    {:else if fieldName === "icon"}
        <input
            id="createIcon"
            name="icon"
            type="text"
            bind:value={createIcon}
            placeholder="calendar (Lucide icon name)"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "color"}
        <div class="flex items-center gap-3">
            <input
                id="createColor"
                type="color"
                bind:value={createColor}
                class="w-12 h-10 border border-border-dark rounded-lg cursor-pointer"
            />
            <input
                name="color"
                type="text"
                bind:value={createColor}
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#000000"
                class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
            />
        </div>
    {:else if fieldName === "sortOrder"}
        <input
            id="createSortOrder"
            name="sortOrder"
            type="number"
            bind:value={createSortOrder}
            min="0"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {/if}
{/snippet}

{#snippet editInput(fieldName: string)}
    {#if fieldName === "name"}
        <input
            id="editName"
            name="name"
            type="text"
            bind:value={editName}
            required
            placeholder="exhibition"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "displayNameEn"}
        <input
            id="editDisplayNameEn"
            name="displayNameEn"
            type="text"
            bind:value={editDisplayNameEn}
            required
            placeholder="Exhibitions"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "displayNameFr"}
        <input
            id="editDisplayNameFr"
            name="displayNameFr"
            type="text"
            bind:value={editDisplayNameFr}
            required
            placeholder="Expositions"
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
            placeholder="exhibitions"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "description"}
        <textarea
            id="editDescription"
            name="description"
            bind:value={editDescription}
            rows="3"
            placeholder="Optional description..."
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
        ></textarea>
    {:else if fieldName === "icon"}
        <input
            id="editIcon"
            name="icon"
            type="text"
            bind:value={editIcon}
            placeholder="calendar (Lucide icon name)"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "color"}
        <div class="flex items-center gap-3">
            <input
                id="editColor"
                type="color"
                bind:value={editColor}
                class="w-12 h-10 border border-border-dark rounded-lg cursor-pointer"
            />
            <input
                name="color"
                type="text"
                bind:value={editColor}
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#000000"
                class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
            />
        </div>
    {:else if fieldName === "sortOrder"}
        <input
            id="editSortOrder"
            name="sortOrder"
            type="number"
            bind:value={editSortOrder}
            min="0"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {/if}
{/snippet}

{#snippet field(
    name: string,
    label: string,
    inputSnippet: InputSnippet,
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
    <title>Catégories | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
    >
        <div>
            <h1 class="text-3xl lg:text-4xl font-bold mb-2">Catégories d'Événements</h1>
            <p class="text-dark-400">Gérez les catégories d'événements pour le filtrage</p>
        </div>
        <button
            onclick={openCreateDialog}
            class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
        >
            <Plus size={18} />
            <span>Nouvelle Catégorie</span>
        </button>
    </div>

    <!-- Success/Error messages -->
    {#if form?.success}
        <div
            class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.success}</p>
        </div>
    {/if}

    {#if form?.error}
        <div
            class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.error}</p>
        </div>
    {/if}

    {#if data.categories.length === 0}
        <div
            class="bg-white rounded-lg border border-border-card p-12 text-center"
        >
            <Tag size={48} class="mx-auto mb-4 text-dark-300" />
            <h3 class="text-xl font-semibold text-dark-900 mb-2">
                Aucune catégorie pour le moment
            </h3>
            <p class="text-dark-400 mb-6">
                Créez votre première catégorie pour organiser vos événements
            </p>
            <button
                onclick={openCreateDialog}
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
            >
                <Plus size={18} />
                <span>Créer une Catégorie</span>
            </button>
        </div>
    {:else}
        <!-- Table view -->
        <div class="bg-white rounded-lg border border-border-card overflow-hidden">
            <table class="w-full">
                <thead class="bg-dark-50 border-b border-border-card">
                    <tr>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Catégorie
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Événements
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Ordre
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
                    {#each data.categories as category}
                        <tr class="hover:bg-dark-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    {#if category.color}
                                        <div
                                            class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                                            style="background-color: {category.color}"
                                        >
                                            {category.displayNameEn.charAt(0).toUpperCase()}
                                        </div>
                                    {:else}
                                        <div
                                            class="w-10 h-10 bg-dark-100 rounded-lg flex items-center justify-center"
                                        >
                                            <Tag size={20} class="text-dark-400" />
                                        </div>
                                    {/if}
                                    <div>
                                        <div class="font-medium text-dark-900">
                                            {category.displayNameEn}
                                            <span class="text-dark-400 font-normal"> / {category.displayNameFr}</span>
                                        </div>
                                        <div class="text-sm text-dark-400">
                                            {category.slug}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-2 text-sm text-dark-600">
                                    <Hash size={16} />
                                    <span>{category.eventCount ?? 0}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="text-sm text-dark-600">{category.sortOrder}</span>
                            </td>
                            <td class="px-6 py-4">
                                {#if category.published}
                                    <span
                                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full"
                                    >
                                        <Eye size={14} />
                                        Publié
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-dark-100 text-dark-600 rounded-full"
                                    >
                                        <EyeOff size={14} />
                                        Masqué
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4">
                                <div
                                    class="flex items-center justify-end gap-2"
                                >
                                    <button
                                        onclick={() => openEditDialog(category)}
                                        class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                                        title="Modifier"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button
                                        onclick={() => openSupprimerDialog(category)}
                                        class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
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
    {/if}
</div>

<!-- Créer la Catégorie Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={createDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Créer une Nouvelle Catégorie
                </h2>
                <button
                    type="button"
                    onclick={() => (createDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">
                Créer une nouvelle catégorie d'événement
            </p>
        </div>

        <form
            method="POST"
            action="?/createCategory"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field("name", "Name", createInput, null)}
                {@render field("displayNameEn", "Display Name (English)", createInput, null)}
                {@render field("displayNameFr", "Display Name (French)", createInput, null)}
                {@render field("slug", "Slug", createInput, null)}
                {@render field("description", "Description (optional)", createInput, null)}
                {@render field("icon", "Icon (Lucide name, optional)", createInput, null)}
                {@render field("color", "Color (optional)", createInput, null)}
                {@render field("sortOrder", "Sort Order", createInput, null)}

                <div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    <input
                        id="createPublié"
                        name="published"
                        type="checkbox"
                        bind:checked={createPublié}
                        class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                    />
                    <div>
                        <label
                            for="createPublié"
                            class="block text-sm font-medium text-dark-900 cursor-pointer"
                        >
                            Publié
                        </label>
                        <p class="text-xs text-dark-400">
                            Afficher cette catégorie sur le site web
                        </p>
                    </div>
                </div>
            </div>
            <div class="flex w-full justify-end gap-3 pt-2">
                <button
                    type="button"
                    onclick={() => (createDialogOpen = false)}
                    class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    class="px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
                >
                    Créer la Catégorie
                </button>
            </div>
        </form>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={createDialogOpen}
        title="Créer une Nouvelle Catégorie"
        description="Créer une nouvelle catégorie d'événement"
    >
        <form
            method="POST"
            action="?/createCategory"
            use:enhance
            class="grid gap-4"
        >
            <div class="grid grid-cols-2 gap-4 w-full">
                <div class="col-span-2">
                    {@render field("name", "Name", createInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("displayNameEn", "Display Name (English)", createInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("displayNameFr", "Display Name (French)", createInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("slug", "Slug", createInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("description", "Description (optional)", createInput, null)}
                </div>
                <div>
                    {@render field("icon", "Icon (optional)", createInput, null)}
                </div>
                <div>
                    {@render field("color", "Color (optional)", createInput, null)}
                </div>
                <div>
                    {@render field("sortOrder", "Sort Order", createInput, null)}
                </div>
            </div>

            <div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
                <input
                    id="createPublié"
                    name="published"
                    type="checkbox"
                    bind:checked={createPublié}
                    class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                />
                <div>
                    <label
                        for="createPublié"
                        class="block text-sm font-medium text-dark-900 cursor-pointer"
                    >
                        Publié
                    </label>
                    <p class="text-xs text-dark-400">
                        Afficher cette catégorie sur le site web
                    </p>
                </div>
            </div>

            <div class="flex w-full justify-end gap-3 pt-2">
                <button
                    type="button"
                    onclick={() => (createDialogOpen = false)}
                    class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
                >
                    Annuler
                </button>
                <button
                    type="submit"
                    class="px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
                >
                    Créer la Catégorie
                </button>
            </div>
        </form>
    </Modal>
{/if}

<!-- Edit Category Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={editDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">Modifier la Catégorie</h2>
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">Mettre à jour les détails de la catégorie</p>
        </div>

        <form
            method="POST"
            action="?/updateCategory"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <input type="hidden" name="id" value={selectedCategory?.id} />

            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field("name", "Name", editInput, null)}
                {@render field("displayNameEn", "Display Name (English)", editInput, null)}
                {@render field("displayNameFr", "Display Name (French)", editInput, null)}
                {@render field("slug", "Slug", editInput, null)}
                {@render field("description", "Description (optional)", editInput, null)}
                {@render field("icon", "Icon (optional)", editInput, null)}
                {@render field("color", "Color (optional)", editInput, null)}
                {@render field("sortOrder", "Sort Order", editInput, null)}

                <div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    <input
                        id="editPublié"
                        name="published"
                        type="checkbox"
                        bind:checked={editPublié}
                        class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                    />
                    <div>
                        <label
                            for="editPublié"
                            class="block text-sm font-medium text-dark-900 cursor-pointer"
                        >
                            Publié
                        </label>
                        <p class="text-xs text-dark-400">
                            Afficher cette catégorie sur le site web
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
        title="Modifier la Catégorie"
        description="Mettre à jour les détails de la catégorie"
    >
        <form
            method="POST"
            action="?/updateCategory"
            use:enhance
            class="grid gap-4"
        >
            <input type="hidden" name="id" value={selectedCategory?.id} />

            <div class="grid grid-cols-2 gap-4 w-full">
                <div class="col-span-2">
                    {@render field("name", "Name", editInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("displayNameEn", "Display Name (English)", editInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("displayNameFr", "Display Name (French)", editInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("slug", "Slug", editInput, null)}
                </div>
                <div class="col-span-2">
                    {@render field("description", "Description (optional)", editInput, null)}
                </div>
                <div>
                    {@render field("icon", "Icon (optional)", editInput, null)}
                </div>
                <div>
                    {@render field("color", "Color (optional)", editInput, null)}
                </div>
                <div>
                    {@render field("sortOrder", "Sort Order", editInput, null)}
                </div>
            </div>

            <div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
                <input
                    id="editPublié"
                    name="published"
                    type="checkbox"
                    bind:checked={editPublié}
                    class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
                />
                <div>
                    <label
                        for="editPublié"
                        class="block text-sm font-medium text-dark-900 cursor-pointer"
                    >
                        Publié
                    </label>
                    <p class="text-xs text-dark-400">
                        Afficher cette catégorie sur le site web
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

<!-- Supprimer Category Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={deleteDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Supprimer la Catégorie
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
                Êtes-vous sûr de vouloir supprimer "{selectedCategory?.displayNameEn}" ? Cette
                action ne peut pas être annulée.
            </p>
        </div>

        <div class="pt-4">
            <form method="POST" action="?/deleteCategory" use:enhance>
                <input type="hidden" name="id" value={selectedCategory?.id} />

                <div class="flex w-full justify-end gap-3">
                    <button
                        type="button"
                        onclick={() => (deleteDialogOpen = false)}
                        class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                    >
                        Supprimer
                    </button>
                </div>
            </form>
        </div>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={deleteDialogOpen}
        title="Supprimer la Catégorie"
        description="Êtes-vous sûr de vouloir supprimer '{selectedCategory?.displayNameEn}' ? Cette action ne peut pas être annulée."
    >
        <form method="POST" action="?/deleteCategory" use:enhance class="mt-6">
            <input type="hidden" name="id" value={selectedCategory?.id} />

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
