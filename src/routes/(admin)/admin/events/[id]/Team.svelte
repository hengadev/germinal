<script lang="ts">
    import { onMount } from 'svelte';
    import { enhance } from "$app/forms";
    import {
        Plus,
        UserMinus,
        Loader2,
        CheckCircle2,
        X,
        SlidersHorizontal,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "../+page.server";
    import { getToastContext } from "$lib/components/toast/state.svelte";
    import {
        STAFF_PERMISSIONS,
        STAFF_PERMISSION_LABELS_FR,
        ACTS_ON_PARTIES_PERMISSIONS,
        type StaffPermission,
    } from "$lib/staff/permissions";

    interface Props {
        data: PageData;
        form?: ActionData;
    }

    let { data, form }: Props = $props();

    const toast = getToastContext();

    interface StaffRole {
        id: string;
        name: string;
        permissions: StaffPermission[];
    }

    interface EventStaff {
        id: string;
        userId: string;
        staffRole: StaffRole;
        grantedPermissions: StaffPermission[];
        withdrawnPermissions: StaffPermission[];
        createdAt: Date;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            role: string;
        };
    }

    interface StaffMember {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: string;
    }

    let eventStaff = $state<EventStaff[]>([]);
    let allStaff = $state<StaffMember[]>([]);
    let staffRoles = $state<StaffRole[]>([]);
    let loading = $state(true);
    let showAddForm = $state(false);
    let processing = $state(false);

    let selectedStaffId = $state('');
    let selectedRoleId = $state('');

    async function loadData() {
        loading = true;
        try {
            // Load staff for this event
            const staffResponse = await fetch(`/api/admin/events/${data.event.id}/staff`);
            if (staffResponse.ok) {
                eventStaff = await staffResponse.json();
            }

            // Load all available staff
            const allStaffResponse = await fetch('/api/admin/staff');
            if (allStaffResponse.ok) {
                allStaff = await allStaffResponse.json();
            }

            // Load the non-archived Staff Roles for the picker
            const rolesResponse = await fetch('/api/admin/staff-roles?assignable=1');
            if (rolesResponse.ok) {
                staffRoles = await rolesResponse.json();
            }
        } catch (error) {
            console.error('Failed to load staff data:', error);
            toast.error('Erreur', 'Échec du chargement des données du staff');
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadData();
    });

    async function assignStaff() {
        if (!selectedStaffId) {
            toast.error('Erreur', 'Veuillez sélectionner un membre du staff');
            return;
        }
        if (!selectedRoleId) {
            toast.error('Erreur', 'Veuillez sélectionner un rôle');
            return;
        }

        processing = true;

        try {
            const response = await fetch(`/api/admin/events/${data.event.id}/staff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedStaffId,
                    staffRoleId: selectedRoleId,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de l\'assignation du staff');
            }

            toast.success('Succès', 'Staff assigné avec succès');
            selectedStaffId = '';
            selectedRoleId = '';
            showAddForm = false;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de l\'assignation du staff';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    async function changeRole(staffUserId: string, staffRoleId: string) {
        processing = true;
        try {
            const response = await fetch(`/api/admin/events/${data.event.id}/staff`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: staffUserId, staffRoleId }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Échec du changement de rôle');
            }
            toast.success('Succès', 'Rôle mis à jour');
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec du changement de rôle';
            toast.error('Erreur', errorMsg);
            await loadData();
        } finally {
            processing = false;
        }
    }

    // Permission adjustments (issue 014): which Assignment's checklist is
    // open and its ticked set — the Staff Role plus grants, minus
    // withdrawals (effective before the dependency closure).
    let adjustingUserId = $state<string | null>(null);
    let adjustPermissions = $state<StaffPermission[]>([]);

    function startAdjust(staff: EventStaff) {
        if (adjustingUserId === staff.userId) {
            adjustingUserId = null;
            return;
        }
        const ticked = new Set<StaffPermission>([
            ...staff.staffRole.permissions,
            ...staff.grantedPermissions,
        ]);
        for (const p of staff.withdrawnPermissions) ticked.delete(p);
        adjustingUserId = staff.userId;
        adjustPermissions = STAFF_PERMISSIONS.filter((p) => ticked.has(p));
    }

    // Ticking a permission that acts on parties also ticks the guest list.
    function toggleAdjust(perm: StaffPermission) {
        if (!adjustPermissions.includes(perm) && ACTS_ON_PARTIES_PERMISSIONS.has(perm)) {
            adjustPermissions = [...adjustPermissions, perm];
            if (!adjustPermissions.includes('guest_list')) {
                adjustPermissions = [...adjustPermissions, 'guest_list'];
            }
        } else {
            adjustPermissions = adjustPermissions.includes(perm)
                ? adjustPermissions.filter((p) => p !== perm)
                : [...adjustPermissions, perm];
        }
    }

    async function saveAdjust(staffUserId: string) {
        processing = true;
        try {
            const response = await fetch(`/api/admin/events/${data.event.id}/staff`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: staffUserId, permissions: adjustPermissions }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Échec de l\u2019ajustement des permissions');
            }
            toast.success('Succès', 'Permissions ajustées');
            adjustingUserId = null;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de l\u2019ajustement des permissions';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    async function removeStaff(staffUserId: string, firstName: string, lastName: string) {
        if (!confirm(`Retirer ${firstName} ${lastName} de cet événement ?`)) {
            return;
        }

        processing = true;

        try {
            const response = await fetch(`/api/admin/events/${data.event.id}/staff/${staffUserId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec du retrait du staff');
            }

            toast.success('Succès', 'Staff retiré avec succès');
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec du retrait du staff';
            toast.error('Erreur', errorMsg);
        } finally {
            processing = false;
        }
    }

    function getAssignedStaffIds(): Set<string> {
        return new Set(eventStaff.map(s => s.userId));
    }

    const assignedStaffIds = $derived(getAssignedStaffIds());

    // Roles shown when changing an Assignment's role: the non-archived ones,
    // plus the Assignment's own role (it may be archived).
    function allRolesForChange(currentRoleId: string): StaffRole[] {
        if (staffRoles.some((r) => r.id === currentRoleId)) return staffRoles;
        const current = eventStaff.find((s) => s.staffRole.id === currentRoleId)?.staffRole;
        return current ? [current, ...staffRoles] : staffRoles;
    }
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div>
            <h3 class="text-lg font-semibold text-foreground mb-1">Équipe de l'événement</h3>
            <p class="text-sm text-muted-foreground">
                {eventStaff.length} membre{eventStaff.length !== 1 ? 's' : ''} du staff assigné{eventStaff.length !== 1 ? 's' : ''}
            </p>
        </div>
        <button
            onclick={() => showAddForm = !showAddForm}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            disabled={processing}
        >
            <Plus size={18} />
            <span>Assigner du staff</span>
        </button>
    </div>

    <!-- Add Staff Form -->
    {#if showAddForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h4 class="text-md font-semibold mb-4">Assigner un membre du staff</h4>

            <div class="space-y-4">
                <div>
                    <label for="staff-select" class="block text-sm font-medium text-foreground mb-2">
                        Membre du staff
                    </label>
                    <select
                        id="staff-select"
                        bind:value={selectedStaffId}
                        class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    >
                        <option value="">Sélectionner un membre du staff...</option>
                        {#each allStaff.filter(s => !assignedStaffIds.has(s.id)) as staff}
                            <option value={staff.id}>{staff.firstName} {staff.lastName} ({staff.email})</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label for="role-select" class="block text-sm font-medium text-foreground mb-2">
                        Rôle
                    </label>
                    <select
                        id="role-select"
                        bind:value={selectedRoleId}
                        class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    >
                        <option value="">Sélectionner un rôle...</option>
                        {#each staffRoles as role (role.id)}
                            <option value={role.id}>{role.name}</option>
                        {/each}
                    </select>
                    <p class="text-xs text-muted-foreground mt-1">
                        Le rôle détermine les permissions du membre du staff pour cet événement
                    </p>
                </div>

                <div class="flex items-center gap-3">
                    {#if processing}
                        <button
                            disabled
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg opacity-50"
                        >
                            <Loader2 size={16} class="animate-spin" />
                            <span>Assignation...</span>
                        </button>
                    {:else}
                        <button
                            onclick={assignStaff}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Assigner</span>
                        </button>
                    {/if}
                    <button
                        onclick={() => {
                            showAddForm = false;
                            selectedStaffId = '';
                            selectedRoleId = '';
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-input text-foreground rounded-lg hover:bg-muted transition-colors"
                        disabled={processing}
                    >
                        <X size={16} />
                        <span>Annuler</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Staff List -->
    {#if loading}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
            <p class="text-muted-foreground mt-4">Chargement des assignations du staff...</p>
        </div>
    {:else if eventStaff.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <p class="text-muted-foreground">
                Aucun membre du staff assigné à cet événement pour le moment.
            </p>
        </div>
    {:else}
        <div class="bg-background border border-border-card rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-muted border-b border-border-card">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Membre du staff
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Rôle
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Assigné le
                            </th>
                            <th class="px-6 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-card">
                        {#each eventStaff as staff (staff.id)}
                            <tr class="hover:bg-muted/50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span class="text-xs font-semibold text-primary uppercase">
                                                {staff.user.firstName[0]}{staff.user.lastName[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-foreground">{staff.user.firstName} {staff.user.lastName}</p>
                                            <p class="text-xs text-muted-foreground">{staff.user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <select
                                        aria-label="Rôle de {staff.user.firstName} {staff.user.lastName}"
                                        class="px-2 py-1 border border-border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        value={staff.staffRole.id}
                                        disabled={processing}
                                        onchange={(e) => changeRole(staff.userId, e.currentTarget.value)}
                                    >
                                        {#each allRolesForChange(staff.staffRole.id) as role (role.id)}
                                            <option value={role.id}>{role.name}</option>
                                        {/each}
                                    </select>
                                    {#if staff.grantedPermissions.length > 0 || staff.withdrawnPermissions.length > 0}
                                        <div class="flex flex-wrap gap-1 mt-1">
                                            {#each [...staff.grantedPermissions] as perm (perm)}
                                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                                    + {STAFF_PERMISSION_LABELS_FR[perm]}
                                                </span>
                                            {/each}
                                            {#each [...staff.withdrawnPermissions] as perm (perm)}
                                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground line-through">
                                                    &minus; {STAFF_PERMISSION_LABELS_FR[perm]}
                                                </span>
                                            {/each}
                                        </div>
                                    {/if}
                                </td>
                                <td class="px-6 py-4">
                                    <p class="text-sm text-muted-foreground">
                                        {new Date(staff.createdAt).toLocaleDateString()}
                                    </p>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-1">
                                        <button
                                            onclick={() => startAdjust(staff)}
                                            class="p-2 text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title="Ajuster les permissions"
                                            aria-label="Ajuster les permissions de {staff.user.firstName} {staff.user.lastName}"
                                            disabled={processing}
                                        >
                                            <SlidersHorizontal size={16} />
                                        </button>
                                        <button
                                            onclick={() => removeStaff(staff.userId, staff.user.firstName, staff.user.lastName)}
                                            class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Retirer de l'événement"
                                            disabled={processing}
                                        >
                                            <UserMinus size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {#if adjustingUserId === staff.userId}
                                <tr class="bg-muted/30">
                                    <td colspan="4" class="px-6 py-4">
                                        <p class="text-sm font-medium text-foreground mb-2">
                                            Permissions de {staff.user.firstName} {staff.user.lastName}
                                        </p>
                                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {#each STAFF_PERMISSIONS as perm (perm)}
                                                <label class="flex items-center gap-2 text-sm text-foreground">
                                                    <input
                                                        type="checkbox"
                                                        checked={adjustPermissions.includes(perm)}
                                                        onchange={() => toggleAdjust(perm)}
                                                    />
                                                    {STAFF_PERMISSION_LABELS_FR[perm]}
                                                </label>
                                            {/each}
                                        </div>
                                        <p class="text-xs text-muted-foreground mt-1">
                                            Cocher une permission agissant sur les groupes coche aussi la liste des invités.
                                        </p>
                                        <div class="flex items-center gap-2 mt-3">
                                            <button
                                                onclick={() => saveAdjust(staff.userId)}
                                                disabled={processing}
                                                class="inline-flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-lg text-sm hover:opacity-90 transition-colors disabled:opacity-50"
                                            >
                                                {#if processing}<Loader2 size={14} class="animate-spin" />{:else}<CheckCircle2 size={14} />{/if}
                                                <span>Enregistrer</span>
                                            </button>
                                            <button
                                                onclick={() => (adjustingUserId = null)}
                                                class="inline-flex items-center gap-2 px-3 py-1.5 border border-border-input text-foreground rounded-lg text-sm hover:bg-muted transition-colors"
                                                disabled={processing}
                                            >
                                                <X size={14} />
                                                <span>Annuler</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>
