<script lang="ts">
    import { onMount } from 'svelte';
    import { enhance } from "$app/forms";
    import {
        Plus,
        UserMinus,
        Loader2,
        CheckCircle2,
        X,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "../+page.server";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    interface Props {
        data: PageData;
        form?: ActionData;
    }

    let { data, form }: Props = $props();

    const toast = getToastContext();

    interface EventStaff {
        id: string;
        userId: string;
        roleLabel: string | null;
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
    let loading = $state(true);
    let showAddForm = $state(false);
    let processing = $state(false);

    let selectedStaffId = $state('');
    let roleLabel = $state('');

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

        processing = true;

        try {
            const response = await fetch(`/api/admin/events/${data.event.id}/staff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedStaffId,
                    roleLabel: roleLabel || undefined,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de l\'assignation du staff');
            }

            toast.success('Succès', 'Staff assigné avec succès');
            selectedStaffId = '';
            roleLabel = '';
            showAddForm = false;
            await loadData();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Échec de l\'assignation du staff';
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
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    >
                        <option value="">Sélectionner un membre du staff...</option>
                        {#each allStaff.filter(s => !assignedStaffIds.has(s.id)) as staff}
                            <option value={staff.id}>{staff.firstName} {staff.lastName} ({staff.email})</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label for="role-label" class="block text-sm font-medium text-foreground mb-2">
                        Libellé du rôle (optionnel)
                    </label>
                    <input
                        id="role-label"
                        type="text"
                        bind:value={roleLabel}
                        placeholder="ex. Son, Porte, Photographie"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processing}
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                        Optionnel : spécifier le rôle du membre du staff pour cet événement
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
                            roleLabel = '';
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
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
                                    <p class="text-sm text-muted-foreground">
                                        {staff.roleLabel || 'Staff'}
                                    </p>
                                </td>
                                <td class="px-6 py-4">
                                    <p class="text-sm text-muted-foreground">
                                        {new Date(staff.createdAt).toLocaleDateString()}
                                    </p>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end">
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
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>
