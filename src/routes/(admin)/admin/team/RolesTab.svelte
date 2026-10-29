<script lang="ts">
    import { enhance } from "$app/forms";
    import { Plus, Archive, ArchiveRestore, Trash2, Pencil, X, CheckCircle2, Loader2 } from "lucide-svelte";
    import type { SubmitFunction } from "@sveltejs/kit";
    import type { ActionData } from "./$types";
    import {
        STAFF_PERMISSIONS,
        STAFF_PERMISSION_LABELS_FR,
        ACTS_ON_PARTIES_PERMISSIONS,
        type StaffPermission,
    } from "$lib/staff/permissions";

    interface Props {
        form?: ActionData;
        roles: StaffRoleRow[];
    }

    interface StaffRoleRow {
        id: string;
        name: string;
        permissions: string[];
        archivedAt: Date | null;
        assignmentCount: number;
    }

    let { form, roles }: Props = $props();

    const activeRoles = $derived(roles.filter((r) => !r.archivedAt));
    const archivedRoles = $derived(roles.filter((r) => r.archivedAt));

    let showCreateForm = $state(false);
    let newName = $state('');
    let newPermissions = $state<string[]>([]);
    let editingId = $state<string | null>(null);
    let editName = $state('');
    let editPermissions = $state<string[]>([]);

    function toggle(list: string[], perm: string): string[] {
        return list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];
    }

    // Ticking a permission that acts on parties also ticks the guest list.
    function toggleNew(perm: StaffPermission) {
        if (!newPermissions.includes(perm) && ACTS_ON_PARTIES_PERMISSIONS.has(perm)) {
            newPermissions = [...newPermissions, perm];
            if (!newPermissions.includes('guest_list')) newPermissions = [...newPermissions, 'guest_list'];
        } else {
            newPermissions = toggle(newPermissions, perm);
        }
    }

    function toggleEdit(perm: StaffPermission) {
        if (!editPermissions.includes(perm) && ACTS_ON_PARTIES_PERMISSIONS.has(perm)) {
            editPermissions = [...editPermissions, perm];
            if (!editPermissions.includes('guest_list')) editPermissions = [...editPermissions, 'guest_list'];
        } else {
            editPermissions = toggle(editPermissions, perm);
        }
    }

    // The form being submitted, to disable its button and show a spinner.
    let pending = $state<string | null>(null);

    // Close the open form once the server accepted it; errors keep it open.
    const closeOnSuccess: SubmitFunction = ({ formElement }) => {
        pending = formElement.dataset.key ?? null;
        return async ({ result, update }) => {
            await update({ reset: false });
            pending = null;
            if (result.type === 'success') {
                showCreateForm = false;
                newName = '';
                newPermissions = [];
                editingId = null;
            }
        };
    };

    // Same pending state for one-click actions; deleting asks first.
    const rowAction: SubmitFunction = ({ formElement, cancel }) => {
        if (formElement.dataset.confirm && !confirm(formElement.dataset.confirm)) {
            cancel();
            return;
        }
        pending = formElement.dataset.key ?? null;
        return async ({ update }) => {
            await update();
            pending = null;
        };
    };

    function startEdit(role: StaffRoleRow) {
        editingId = role.id;
        editName = role.name;
        editPermissions = [...role.permissions];
    }
</script>

<div class="space-y-6">
    <div class="flex items-center justify-between">
        <div>
            <h3 class="text-lg font-semibold text-foreground mb-1">Rôles du staff</h3>
            <p class="text-sm text-muted-foreground">
                Chaque rôle est un ensemble de permissions, attribué aux assignations.
            </p>
        </div>
        <button
            onclick={() => { showCreateForm = !showCreateForm; editingId = null; }}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
        >
            <Plus size={18} />
            <span>Nouveau rôle</span>
        </button>
    </div>

    {#if showCreateForm}
        <form
            method="POST"
            action="?/createStaffRole"
            data-key="create"
            use:enhance={closeOnSuccess}
            class="bg-background border border-border-card rounded-lg p-6 space-y-4"
        >
            <h4 class="text-md font-semibold">Créer un rôle</h4>
            <div>
                <label for="new-role-name" class="block text-sm font-medium text-foreground mb-2">Nom</label>
                <input
                    id="new-role-name"
                    name="name"
                    type="text"
                    bind:value={newName}
                    required
                    class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>
            <div>
                <span class="block text-sm font-medium text-foreground mb-2">Permissions</span>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {#each STAFF_PERMISSIONS as perm (perm)}
                        <label class="flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                name="permissions"
                                value={perm}
                                checked={newPermissions.includes(perm)}
                                onchange={() => toggleNew(perm)}
                            />
                            {STAFF_PERMISSION_LABELS_FR[perm]}
                        </label>
                    {/each}
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                    Cocher une permission agissant sur les groupes coche aussi la liste des invités.
                </p>
            </div>
            <div class="flex items-center gap-3">
                <button type="submit" disabled={pending === 'create'} class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors disabled:opacity-50">
                    {#if pending === 'create'}<Loader2 size={16} class="animate-spin" />{:else}<CheckCircle2 size={16} />{/if}
                    <span>Créer</span>
                </button>
                <button
                    type="button"
                    onclick={() => { showCreateForm = false; newName = ''; newPermissions = []; }}
                    class="inline-flex items-center gap-2 px-4 py-2 border border-border-input text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                    <X size={16} />
                    <span>Annuler</span>
                </button>
            </div>
        </form>
    {/if}

    <div class="bg-background border border-border-card rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
        <table class="w-full">
            <thead class="bg-muted border-b border-border-card">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Rôle</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Permissions</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Assignations</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-border-card">
                {#each activeRoles as role (role.id)}
                    <tr class="hover:bg-muted/50 transition-colors">
                        <td class="px-6 py-4 text-sm font-medium text-foreground align-top">
                            {#if editingId === role.id}
                                <input
                                    name="name"
                                    type="text"
                                    bind:value={editName}
                                    class="w-full px-2 py-1 border border-border-input rounded-lg"
                                    form="edit-role-{role.id}"
                                />
                            {:else}
                                {role.name}
                            {/if}
                        </td>
                        <td class="px-6 py-4 align-top">
                            {#if editingId === role.id}
                                <form id="edit-role-{role.id}" method="POST" action="?/updateStaffRole" data-key="update-{role.id}" use:enhance={closeOnSuccess} class="space-y-3">
                                    <input type="hidden" name="id" value={role.id} />
                                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {#each STAFF_PERMISSIONS as perm (perm)}
                                            <label class="flex items-center gap-2 text-sm text-foreground">
                                                <input
                                                    type="checkbox"
                                                    name="permissions"
                                                    value={perm}
                                                    checked={editPermissions.includes(perm)}
                                                    onchange={() => toggleEdit(perm)}
                                                />
                                                {STAFF_PERMISSION_LABELS_FR[perm]}
                                            </label>
                                        {/each}
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button type="submit" disabled={pending === `update-${role.id}`} class="inline-flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
                                            {#if pending === `update-${role.id}`}<Loader2 size={14} class="animate-spin" />{:else}<CheckCircle2 size={14} />{/if}
                                            <span>Enregistrer</span>
                                        </button>
                                        <button type="button" onclick={() => (editingId = null)} class="inline-flex items-center gap-2 px-3 py-1.5 border border-border-input text-foreground rounded-lg text-sm hover:bg-muted">
                                            <X size={14} />
                                            <span>Annuler</span>
                                        </button>
                                    </div>
                                </form>
                            {:else}
                                <div class="flex flex-wrap gap-1">
                                    {#if role.permissions.length === 0}
                                        <span class="text-sm text-muted-foreground">Aucune permission</span>
                                    {:else}
                                        {#each role.permissions as perm (perm)}
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                                {STAFF_PERMISSION_LABELS_FR[perm as StaffPermission] ?? perm}
                                            </span>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </td>
                        <td class="px-6 py-4 text-sm text-muted-foreground align-top">{role.assignmentCount}</td>
                        <td class="px-6 py-4 align-top">
                            <div class="flex items-center justify-end gap-1">
                                <button
                                    onclick={() => startEdit(role)}
                                    class="p-2 text-foreground hover:bg-muted rounded-lg transition-colors"
                                    title="Modifier" aria-label="Modifier le rôle"
                                >
                                    <Pencil size={16} />
                                </button>
                                <form method="POST" action="?/archiveStaffRole" data-key="archive-{role.id}" use:enhance={rowAction}>
                                    <input type="hidden" name="id" value={role.id} />
                                    <button type="submit" disabled={pending?.endsWith(role.id)} class="disabled:opacity-50 p-2 text-foreground hover:bg-muted rounded-lg transition-colors" title="Archiver" aria-label="Archiver le rôle">
                                        <Archive size={16} />
                                    </button>
                                </form>
                                {#if role.assignmentCount === 0}
                                    <form method="POST" action="?/deleteStaffRole" data-key="delete-{role.id}" data-confirm="Supprimer le rôle « {role.name} » ?" use:enhance={rowAction}>
                                        <input type="hidden" name="id" value={role.id} />
                                        <button type="submit" disabled={pending?.endsWith(role.id)} class="disabled:opacity-50 p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer" aria-label="Supprimer le rôle">
                                            <Trash2 size={16} />
                                        </button>
                                    </form>
                                {/if}
                            </div>
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="4" class="px-6 py-8 text-center text-sm text-muted-foreground">
                            Aucun rôle actif. Créez-en un ou restaurez un rôle archivé.
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        </div>
    </div>

    {#if archivedRoles.length > 0}
        <div>
            <h4 class="text-md font-semibold mb-3">Rôles archivés</h4>
            <div class="bg-background border border-border-card rounded-lg divide-y divide-border-card">
                {#each archivedRoles as role (role.id)}
                    <div class="flex items-center justify-between px-6 py-4">
                        <div>
                            <p class="text-sm font-medium text-muted-foreground">{role.name}</p>
                            <p class="text-xs text-muted-foreground">
                                {role.assignmentCount} assignation{role.assignmentCount !== 1 ? 's' : ''} —
                                toujours actif sur celles-ci, plus attribuable
                            </p>
                        </div>
                        <div class="flex items-center gap-1">
                            <form method="POST" action="?/restoreStaffRole" data-key="restore-{role.id}" use:enhance={rowAction}>
                                <input type="hidden" name="id" value={role.id} />
                                <button type="submit" disabled={pending?.endsWith(role.id)} class="disabled:opacity-50 p-2 text-foreground hover:bg-muted rounded-lg transition-colors" title="Restaurer" aria-label="Restaurer le rôle">
                                    <ArchiveRestore size={16} />
                                </button>
                            </form>
                            {#if role.assignmentCount === 0}
                                <form method="POST" action="?/deleteStaffRole" data-key="delete-{role.id}" data-confirm="Supprimer le rôle « {role.name} » ?" use:enhance={rowAction}>
                                    <input type="hidden" name="id" value={role.id} />
                                    <button type="submit" disabled={pending?.endsWith(role.id)} class="disabled:opacity-50 p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer" aria-label="Supprimer le rôle">
                                        <Trash2 size={16} />
                                    </button>
                                </form>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
