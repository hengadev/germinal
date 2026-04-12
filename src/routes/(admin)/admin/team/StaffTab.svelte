<script lang="ts">
    import { onMount } from 'svelte';
    import { enhance } from "$app/forms";
    import {
        Plus,
        Mail,
        Key,
        UserX,
        RefreshCw,
        CheckCircle2,
        XCircle,
        Loader2,
    } from "lucide-svelte";
    import type { ActionData } from "../+page.server";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    interface Props {
        form?: ActionData;
    }

    let { form }: Props = $props();

    const toast = getToastContext();

    interface StaffUser {
        id: string;
        email: string;
        role: string;
        createdAt: Date;
    }

    let staffList = $state<StaffUser[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showCreateForm = $state(false);
    let createFormError = $state<string | null>(null);
    let processingAction = $state<string | null>(null);

    // Create form state
    let newStaffEmail = $state('');
    let newStaffPassword = $state('');

    async function loadStaff() {
        loading = true;
        error = null;
        try {
            const response = await fetch('/api/admin/staff');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error ?? `Erreur ${response.status}`);
            }
            staffList = data;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load staff';
            console.error('Error loading staff:', err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadStaff();
    });

    async function createStaff() {
        if (!newStaffEmail || !newStaffPassword) {
            createFormError = 'Email and password are required';
            return;
        }

        if (newStaffPassword.length < 8) {
            createFormError = 'Password must be at least 8 characters';
            return;
        }

        if (newStaffEmail.includes('germinal.com')) {
            createFormError = 'Email cannot contain "germinal.com"';
            return;
        }

        processingAction = 'create';
        createFormError = null;

        try {
            const formData = new FormData();
            formData.append('email', newStaffEmail);
            formData.append('password', newStaffPassword);

            const response = await fetch('/admin/team/staff', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create staff');
            }

            toast.success('Success', result.success || 'Staff member created successfully');
            newStaffEmail = '';
            newStaffPassword = '';
            showCreateForm = false;
            await loadStaff();
        } catch (err) {
            createFormError = err instanceof Error ? err.message : 'Failed to create staff';
            toast.error('Error', createFormError);
        } finally {
            processingAction = null;
        }
    }

    async function resetPassword(staffId: string, email: string) {
        const newPassword = prompt(`Enter new password for ${email}:`);
        if (!newPassword) return;

        if (newPassword.length < 8) {
            toast.error('Error', 'Password must be at least 8 characters');
            return;
        }

        processingAction = `reset-${staffId}`;

        try {
            const formData = new FormData();
            formData.append('staffId', staffId);
            formData.append('newPassword', newPassword);

            const response = await fetch('/admin/team/staff/reset-password', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to reset password');
            }

            toast.success('Success', result.success || 'Password reset successfully');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to reset password';
            toast.error('Error', errorMsg);
        } finally {
            processingAction = null;
        }
    }

    async function deactivateStaff(staffId: string, email: string) {
        if (!confirm(`Are you sure you want to deactivate ${email}? This will prevent them from accessing the staff portal.`)) {
            return;
        }

        processingAction = `deactivate-${staffId}`;

        try {
            const formData = new FormData();
            formData.append('staffId', staffId);

            const response = await fetch('/admin/team/staff/deactivate', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to deactivate staff');
            }

            toast.success('Success', result.success || 'Staff deactivated successfully');
            await loadStaff();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to deactivate staff';
            toast.error('Error', errorMsg);
        } finally {
            processingAction = null;
        }
    }

    function formatDate(date: Date | string): string {
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div>
            <h2 class="text-2xl font-semibold">Staff Members</h2>
            <p class="text-muted-foreground">Manage staff accounts and access</p>
        </div>
        <button
            onclick={() => showCreateForm = true}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
        >
            <Plus size={18} />
            <span>Add Staff</span>
        </button>
    </div>

    <!-- Create Staff Form -->
    {#if showCreateForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">Create New Staff Account</h3>

            {#if createFormError}
                <div class="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                    <p class="text-sm font-medium">{createFormError}</p>
                </div>
            {/if}

            <div class="space-y-4">
                <div>
                    <label for="staff-email" class="block text-sm font-medium text-foreground mb-1">
                        Email Address
                    </label>
                    <input
                        id="staff-email"
                        type="email"
                        bind:value={newStaffEmail}
                        placeholder="staff@example.com"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processingAction === 'create'}
                    />
                </div>

                <div>
                    <label for="staff-password" class="block text-sm font-medium text-foreground mb-1">
                        Temporary Password
                    </label>
                    <input
                        id="staff-password"
                        type="password"
                        bind:value={newStaffPassword}
                        placeholder="••••••••"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processingAction === 'create'}
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                        Minimum 8 characters. Staff member will be prompted to change on first login.
                    </p>
                </div>

                <div class="flex items-center gap-3">
                    {#if processingAction === 'create'}
                        <button
                            disabled
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg opacity-50"
                        >
                            <Loader2 size={16} class="animate-spin" />
                            <span>Creating...</span>
                        </button>
                    {:else}
                        <button
                            onclick={createStaff}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Create Account</span>
                        </button>
                    {/if}
                    <button
                        onclick={() => {
                            showCreateForm = false;
                            newStaffEmail = '';
                            newStaffPassword = '';
                            createFormError = null;
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
                        disabled={processingAction === 'create'}
                    >
                        <XCircle size={16} />
                        <span>Cancel</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Staff List -->
    {#if loading}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
            <p class="text-muted-foreground mt-4">Loading staff...</p>
        </div>
    {:else if error}
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p class="text-sm font-medium">{error}</p>
        </div>
    {:else if staffList.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <UserX size={48} class="mx-auto text-muted-foreground mb-4" />
            <h3 class="text-lg font-semibold text-foreground mb-2">No Staff Members</h3>
            <p class="text-muted-foreground mb-4">
                Create staff accounts to give team members access to the staff portal.
            </p>
            <button
                onclick={() => showCreateForm = true}
                class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            >
                <Plus size={18} />
                <span>Add First Staff Member</span>
            </button>
        </div>
    {:else}
        <div class="bg-background border border-border-card rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-muted border-b border-border-card">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Email
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Role
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Created
                            </th>
                            <th class="px-6 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border-card">
                        {#each staffList as staff (staff.id)}
                            <tr class="hover:bg-muted/50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span class="text-xs font-semibold text-primary uppercase">
                                                {staff.email[0].toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-foreground">{staff.email}</p>
                                            <p class="text-xs text-muted-foreground">ID: {staff.id.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {staff.role}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    <p class="text-sm text-muted-foreground">{formatDate(staff.createdAt)}</p>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-2">
                                        <button
                                            onclick={() => resetPassword(staff.id, staff.email)}
                                            class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title="Reset Password"
                                            disabled={processingAction === `reset-${staff.id}`}
                                        >
                                            {#if processingAction === `reset-${staff.id}`}
                                                <Loader2 size={16} class="animate-spin" />
                                            {:else}
                                                <Key size={16} />
                                            {/if}
                                        </button>
                                        <button
                                            onclick={() => deactivateStaff(staff.id, staff.email)}
                                            class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Deactivate Staff"
                                            disabled={processingAction === `deactivate-${staff.id}`}
                                        >
                                            {#if processingAction === `deactivate-${staff.id}`}
                                                <Loader2 size={16} class="animate-spin" />
                                            {:else}
                                                <UserX size={16} />
                                            {/if}
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
