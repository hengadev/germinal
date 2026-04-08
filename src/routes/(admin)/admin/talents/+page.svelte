<script lang="ts">
    import { enhance } from "$app/forms";
    import { goto } from "$app/navigation";
    import {
        Plus,
        User,
        Briefcase,
        Eye,
        EyeOff,
        Edit,
        Trash2,
        X,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
    import { browser } from "$app/environment";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";
    import TalentCategoriesTab from "./TalentCategoriesTab.svelte";
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
    let activeTab = $state<'talents' | 'categories'>('categories');
    let catCreateDialogOpen = $state(false);

    // Talent type
    type Talent = (typeof data.talents)[number];

    // Dialog state
    let deleteDialogOpen = $state(false);

    // Currently selected talent for delete
    let selectedTalent: Talent | null = $state(null);

    function deleteTalentEnhance() {
        return async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: (opts?: { reset?: boolean }) => Promise<void> }) => {
            if (result.type === 'success') {
                deleteDialogOpen = false;
                toast.success("Succès", (result.data as { success?: string })?.success ?? 'Talent supprimé');
            } else if (result.type === 'failure') {
                toast.error("Erreur", (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
 }
 await update({ reset: false });
 };
 }

 function openDeleteDialog(talent: Talent) {
 selectedTalent = talent;
 deleteDialogOpen = true;
 }

 function formatDate(date: Date | string): string {
 return new Date(date).toLocaleDateString("en-US", {
 year: "numeric",
 month: "short",
 day: "numeric",
 });
 }
</script>

<svelte:head>
 <title>Talents | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
 <div
 class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
 >
 <div>
 <h1 class="text-3xl lg:text-4xl font-bold mb-2">Talents</h1>
 <p class="text-muted-foreground">Gérez votre collection de talents et catégories</p>
 </div>
 {#if activeTab === 'talents'}
 <a
 href="/admin/talents/new"
 class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors self-start"
 >
 <Plus size={18} />
 <span>Nouveau Talent</span>
 </a>
 {:else}
 <button
 onclick={() => (catCreateDialogOpen = true)}
 class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors self-start"
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
 class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px {activeTab === 'categories' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground-alt'}"
        >
            Catégories
        </button>
        <button
            onclick={() => (activeTab = 'talents')}
 class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px {activeTab === 'talents' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground-alt'}"
        >
            Talents
        </button>
    </div>

    {#if activeTab === 'talents'}
 {#if data.talents.length === 0}
 <div
 class="bg-background rounded-lg border border-border-card p-12 text-center"
 >
 <User size={48} class="mx-auto mb-4 text-muted-foreground" />
 <h3 class="text-xl font-semibold text-foreground mb-2">
 Aucun talent pour le moment
 </h3>
 <p class="text-muted-foreground mb-6">
 Ajoutez votre premier talent pour commencer
 </p>
 <a
 href="/admin/talents/new"
 class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
 >
 <Plus size={18} />
 <span>Ajouter un Talent</span>
 </a>
 </div>
 {:else}
 <!-- Table view for desktop -->
 <div
 class="bg-background rounded-lg border border-border-card overflow-hidden hidden lg:block"
 >
 <table class="w-full">
 <thead class="bg-muted border-b border-border-card">
 <tr>
 <th
 class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider"
 >
 Talent
 </th>
 <th
 class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider"
 >
 Rôle
 </th>
 <th
 class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider"
 >
 Bio
 </th>
 <th
 class="px-6 py-4 text-left text-xs font-semibold text-foreground-alt uppercase tracking-wider"
 >
 Statut
 </th>
 <th
 class="px-6 py-4 text-right text-xs font-semibold text-foreground-alt uppercase tracking-wider"
 >
 Actions
 </th>
 </tr>
 </thead>
 <tbody class="divide-y divide-border-card">
 {#each data.talents as talent}
 <tr
 class="hover:bg-muted transition-colors cursor-pointer"
 onclick={() => goto(`/admin/talents/${talent.id}`)}
 >
 <td class="px-6 py-4">
 <div class="flex items-center gap-4">
 {#if talent.profileMedia?.url}
 <img
 src={talent.profileMedia.url}
 alt="{talent.firstName} {talent.lastName}"
 class="w-14 h-14 object-cover rounded-full"
 />
 {:else}
 <div
 class="w-14 h-14 bg-muted rounded-full flex items-center justify-center"
 >
 <User
 size={24}
 class="text-muted-foreground"
 />
 </div>
 {/if}
 <div>
 <div class="font-medium text-foreground">
 {talent.firstName}
 {talent.lastName}
 </div>
 </div>
 </div>
 </td>
 <td class="px-6 py-4">
 <div
 class="flex items-center gap-2 text-sm text-foreground-alt"
 >
 <Briefcase size={16} />
 <span class="truncate max-w-[200px]"
 >{talent.roleEn}</span
 >
 </div>
 </td>
 <td class="px-6 py-4">
 <p
 class="text-sm text-muted-foreground line-clamp-2 max-w-[300px]"
 >
 {talent.bioEn}
 </p>
 </td>
 <td class="px-6 py-4">
 {#if talent.published}
 <span
 class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-foreground text-background rounded-full"
 >
 <Eye size={14} />
 Publié
 </span>
 {:else}
 <span
 class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-muted text-foreground-alt rounded-full"
 >
 <EyeOff size={14} />
 Brouillon
 </span>
 {/if}
 </td>
 <td class="px-6 py-4">
 <div
 class="flex items-center justify-end gap-2"
 >
 <a
 href="/admin/talents/{talent.id}"
 class="p-2 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
 title="Modifier"
 >
 <Edit size={18} />
 </a>
 <button
 onclick={(e) => {
 e.stopPropagation();
 openDeleteDialog(talent);
 }}
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

 <!-- Card view for mobile -->
 <div class="lg:hidden space-y-4">
 {#each data.talents as talent}
 <div
 class="bg-background rounded-lg border border-border-card p-4 cursor-pointer hover:border-foreground/30 transition-colors"
 onclick={() => goto(`/admin/talents/${talent.id}`)}
 >
 <div class="flex gap-4 mb-4">
 {#if talent.profileMedia?.url}
 <img
 src={talent.profileMedia.url}
 alt="{talent.firstName} {talent.lastName}"
 class="w-16 h-16 object-cover rounded-full flex-shrink-0"
 />
 {:else}
 <div
 class="w-16 h-16 bg-muted rounded-full flex items-center justify-center flex-shrink-0"
 >
 <User size={32} class="text-muted-foreground" />
 </div>
 {/if}
 <div class="min-w-0 flex-1">
 <h3 class="font-semibold text-foreground truncate">
 {talent.firstName} {talent.lastName}
 </h3>
 <div class="flex items-center gap-1 text-sm text-foreground-alt mt-1">
 <Briefcase size={14} />
 <span class="truncate">{talent.roleEn}</span>
 </div>
 <p class="text-sm text-muted-foreground line-clamp-2 mt-1">
 {talent.bioEn}
 </p>
 </div>
 </div>

 <div class="flex items-center justify-between pt-3 border-t border-border-card">
 <div class="flex items-center gap-2">
 {#if talent.published}
 <span
 class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-foreground text-background rounded-full"
 >
 <Eye size={14} />
 Publié
 </span>
 {:else}
 <span
 class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-muted text-foreground-alt rounded-full"
 >
 <EyeOff size={14} />
 Brouillon
 </span>
 {/if}
 </div>
 <div class="flex items-center gap-2">
 <a
 href="/admin/talents/{talent.id}"
 class="p-2 text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg transition-colors"
 title="Modifier"
 >
 <Edit size={18} />
 </a>
 <button
 onclick={(e) => {
 e.stopPropagation();
 openDeleteDialog(talent);
 }}
 class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
 title="Supprimer"
 >
 <Trash2 size={18} />
 </button>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {/if}
 {:else}
 <TalentCategoriesTab
 categories={data.categories}
 {isMobile}
 bind:createDialogOpen={catCreateDialogOpen}
 />
 {/if}
</div>

<!-- Delete Talent Dialog/Drawer -->
{#if isMobile}
 <Drawer bind:isOpen={deleteDialogOpen}>
 <div
 class="sticky top-0 bg-background pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
 >
 <div class="flex items-center justify-between mb-2">
 <h2 class="text-xl font-semibold tracking-tight">
 Supprimer le Talent
 </h2>
 <button
 type="button"
 onclick={() => (deleteDialogOpen = false)}
 class="p-2 hover:bg-muted rounded-md transition-colors"
 >
 <X class="text-foreground size-5" />
 </button>
 </div>
 <p class="text-muted-foreground text-sm">
 Êtes-vous sûr de vouloir supprimer "{selectedTalent?.firstName} {selectedTalent?.lastName}" ? Cette
 action ne peut pas être annulée.
 </p>
 </div>

 <div class="pt-4">
 <form method="POST" action="?/deleteTalent" use:enhance={deleteTalentEnhance}>
 <input type="hidden" name="id" value={selectedTalent?.id} />

 <div class="flex w-full justify-end gap-3">
 <button
 type="button"
 onclick={() => (deleteDialogOpen = false)}
 class="px-4 py-2 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm"
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
 title="Supprimer le Talent"
 description="Êtes-vous sûr de vouloir supprimer '{selectedTalent?.firstName} {selectedTalent?.lastName}' ? Cette action ne peut pas être annulée."
    >
        <form method="POST" action="?/deleteTalent" use:enhance={deleteTalentEnhance} class="mt-6">
            <input type="hidden" name="id" value={selectedTalent?.id} />

            <div class="flex w-full justify-end gap-3">
                <button
                    type="button"
                    onclick={() => (deleteDialogOpen = false)}
                    class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium"
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
