<script lang="ts">
    import { untrack } from 'svelte';
    import { enhance } from "$app/forms";
    import { Loader2, CheckCircle2 } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
    import { getToastContext } from "$lib/components/toast/state.svelte";
    import type { StaffPermission } from "$lib/staff/permissions";

    interface Props {
        data: PageData;
        form?: ActionData;
        /** The Brief tab is open: the editor keeps every panel mounted. */
        active: boolean;
    }

    let { data, form, active }: Props = $props();

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

    let eventStaff = $state<EventStaff[]>([]);
    let loading = $state(true);

    // The spinner only on the first load: a reload keeps the role fields
    // (keyed by role) and what the Admin is typing in them.
    async function loadData() {
        try {
            const staffResponse = await fetch(`/api/admin/events/${data.event.id}/staff`);
            if (staffResponse.ok) {
                eventStaff = await staffResponse.json();
            }
        } catch (error) {
            console.error('Failed to load staff data:', error);
            toast.error('Erreur', 'Échec du chargement des données du staff');
        } finally {
            loading = false;
        }
    }

    // Each time the tab opens, so roles just assigned in Team appear.
    $effect(() => {
        if (active) untrack(loadData);
    });

    // Brief (issue 032): one part per Staff role assigned on the Event.
    const briefRoles = $derived(
        [...new Map(eventStaff.map((s) => [s.staffRole.id, s.staffRole])).values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'fr')
        )
    );
    const brief = data.staffBrief ?? { general: null as string | null, roles: [] as { staffRoleId: string; body: string }[] };

    let savingBrief = $state(false);

    function briefRoleBody(roleId: string): string {
        return brief.roles.find((r: { staffRoleId: string }) => r.staffRoleId === roleId)?.body ?? '';
    }

    async function submitBrief({ result }: { result: import('@sveltejs/kit').ActionResult }) {
        savingBrief = false;
        if (result.type === 'success') {
            toast.success('Succès', ((result.data as { success?: string })?.success) ?? 'Brief enregistré.');
        } else if (result.type === 'failure') {
            toast.error('Erreur', ((result.data as { error?: string })?.error) ?? 'Échec de l\u2019enregistrement du brief.');
        }
    }
</script>

<div class="space-y-6">
    <div class="bg-background border border-border-card rounded-lg p-6">
        <h4 class="text-md font-semibold mb-1">Brief</h4>
        <p class="text-sm text-muted-foreground mb-4">
            Ce que le staff lit dans le portail&nbsp;: une partie générale pour tous, puis une partie par rôle assigné à l'événement.
        </p>
        <form method="POST" action="?/saveBrief" use:enhance={() => { savingBrief = true; return submitBrief; }} class="space-y-4">
            <div>
                <label for="brief-general" class="block text-sm font-medium text-foreground mb-2">
                    Brief général
                </label>
                <textarea
                    id="brief-general"
                    name="general"
                    rows="4"
                    class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={savingBrief}
                >{brief.general ?? ''}</textarea>
            </div>
            {#if loading}
                <div class="py-4">
                    <Loader2 size={24} class="animate-spin mx-auto text-muted-foreground" />
                </div>
            {:else if briefRoles.length === 0}
                <p class="text-sm text-muted-foreground">
                    Assignez du staff dans l'onglet Team pour écrire une partie par rôle.
                </p>
            {:else}
                {#each briefRoles as role (role.id)}
                    <div>
                        <label for="brief-role-{role.id}" class="block text-sm font-medium text-foreground mb-2">
                            Pour le rôle&nbsp;: {role.name}
                        </label>
                        <textarea
                            id="brief-role-{role.id}"
                            name="role_{role.id}"
                            rows="3"
                            class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={savingBrief}
                        >{briefRoleBody(role.id)}</textarea>
                    </div>
                {/each}
            {/if}
            <div>
                <button
                    type="submit"
                    disabled={savingBrief}
                    class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                >
                    {#if savingBrief}<Loader2 size={16} class="animate-spin" />{:else}<CheckCircle2 size={16} />{/if}
                    <span>Enregistrer le brief</span>
                </button>
            </div>
        </form>
    </div>
</div>
