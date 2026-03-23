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
        Tag,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
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

    // Dialog state
    let deleteDialogOpen = $state(false);

    // Currently selected event for delete
    let selectedEvent: Event | null = $state(null);

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
</script>

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
                                        title="Modifier"
                                    >
                                        <Edit size={18} />
                                    </a>
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
                                <Edit size={16} />
                                Modifier
                            </a>
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
