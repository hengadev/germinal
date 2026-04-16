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
        Eye,
        EyeOff,
        MessageSquare,
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
        firstName: string;
        lastName: string;
        phone: string | null;
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
    let newStaffFirstName = $state('');
    let newStaffLastName = $state('');
    let newStaffEmail = $state('');
    let newStaffPhone = $state('');
    let newStaffPassword = $state('');
    let showPassword = $state(false);
    let inviteMethod = $state<'email' | 'sms'>('email');

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
            error = err instanceof Error ? err.message : 'Échec du chargement du staff';
            console.error('Error loading staff:', err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadStaff();
    });

    async function generatePassword() {
        try {
            const response = await fetch('/api/admin/team/staff/generate-password');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate password');
            }
            newStaffPassword = data.password;
        } catch (err) {
            toast.error('Erreur', err instanceof Error ? err.message : 'Échec de la génération du mot de passe');
        }
    }

    function openCreateForm() {
        showCreateForm = true;
        inviteMethod = 'email'; // Reset to default
        generatePassword();
    }

    async function createStaff() {
        if (!newStaffFirstName || newStaffFirstName.length < 1 || newStaffFirstName.length > 100) {
            createFormError = 'Le prénom est requis (1-100 caractères)';
            return;
        }

        if (!newStaffLastName || newStaffLastName.length < 1 || newStaffLastName.length > 100) {
            createFormError = 'Le nom est requis (1-100 caractères)';
            return;
        }

        if (!newStaffEmail || !newStaffPassword) {
            createFormError = 'L\'email et le mot de passe sont requis';
            return;
        }

        if (newStaffPassword.length < 8) {
            createFormError = 'Le mot de passe doit contenir au moins 8 caractères';
            return;
        }

        if (newStaffEmail.includes('germinal.com')) {
            createFormError = 'L\'email ne peut pas contenir "germinal.com"';
            return;
        }

        // Phone is required for SMS
        if (inviteMethod === 'sms' && (!newStaffPhone || newStaffPhone.length === 0)) {
            createFormError = 'Le numéro de téléphone est requis pour l\'envoi par SMS';
            return;
        }

        if (newStaffPhone && newStaffPhone.length > 50) {
            createFormError = 'Le numéro de téléphone ne peut pas dépasser 50 caractères';
            return;
        }

        processingAction = 'create';
        createFormError = null;

        try {
            const formData = new FormData();
            formData.append('firstName', newStaffFirstName);
            formData.append('lastName', newStaffLastName);
            formData.append('email', newStaffEmail);
            formData.append('phone', newStaffPhone);
            formData.append('password', newStaffPassword);
            formData.append('inviteMethod', inviteMethod);

            const response = await fetch('/api/admin/team/staff', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de la création du staff');
            }

            toast.success('Succès', result.success || 'Membre du staff créé avec succès');
            newStaffFirstName = '';
            newStaffLastName = '';
            newStaffEmail = '';
            newStaffPhone = '';
            newStaffPassword = '';
            showCreateForm = false;
            await loadStaff();
        } catch (err) {
            createFormError = err instanceof Error ? err.message : 'Échec de la création du staff';
            toast.error('Erreur', createFormError);
        } finally {
            processingAction = null;
        }
    }

    async function resetPassword(staffId: string, email: string) {
        if (!confirm(`Envoyer un email de réinitialisation du mot de passe à ${email} ?`)) {
            return;
        }

        processingAction = `reset-${staffId}`;

        try {
            const response = await fetch('/admin/team/staff/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ staffId }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de l\'envoi de l\'email de réinitialisation');
            }

            toast.success('Succès', result.success || 'Email de réinitialisation envoyé avec succès');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Échec de l\'envoi de l\'email de réinitialisation';
            toast.error('Erreur', errorMsg);
        } finally {
            processingAction = null;
        }
    }

    async function deactivateStaff(staffId: string, email: string) {
        if (!confirm(`Êtes-vous sûr de vouloir désactiver ${email} ? Cela l'empêchera d'accéder au portail staff.`)) {
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
                throw new Error(result.error || 'Échec de la désactivation du staff');
            }

            toast.success('Succès', result.success || 'Staff désactivé avec succès');
            await loadStaff();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Échec de la désactivation du staff';
            toast.error('Erreur', errorMsg);
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
            <h2 class="text-2xl font-semibold">Membres du Staff</h2>
            <p class="text-muted-foreground">Gérer les comptes et accès du staff</p>
        </div>
        <button
            onclick={openCreateForm}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
        >
            <Plus size={18} />
            <span>Ajouter un membre du staff</span>
        </button>
    </div>

    <!-- Create Staff Form -->
    {#if showCreateForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">Créer un nouveau compte staff</h3>

            {#if createFormError}
                <div class="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                    <p class="text-sm font-medium">{createFormError}</p>
                </div>
            {/if}

            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="staff-firstname" class="block text-sm font-medium text-foreground mb-1">
                            Prénom <span class="text-red-500">*</span>
                        </label>
                        <input
                            id="staff-firstname"
                            type="text"
                            bind:value={newStaffFirstName}
                            placeholder="Jean"
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processingAction === 'create'}
                        />
                    </div>
                    <div>
                        <label for="staff-lastname" class="block text-sm font-medium text-foreground mb-1">
                            Nom <span class="text-red-500">*</span>
                        </label>
                        <input
                            id="staff-lastname"
                            type="text"
                            bind:value={newStaffLastName}
                            placeholder="Dupont"
                            class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processingAction === 'create'}
                        />
                    </div>
                </div>

                <div>
                    <label for="staff-email" class="block text-sm font-medium text-foreground mb-1">
                        Adresse email
                    </label>
                    <input
                        id="staff-email"
                        type="email"
                        bind:value={newStaffEmail}
                        placeholder="staff@exemple.com"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processingAction === 'create'}
                    />
                </div>

                <div>
                    <label for="staff-phone" class="block text-sm font-medium text-foreground mb-1">
                        Numéro de téléphone
                        {#if inviteMethod === 'sms'}
                            <span class="text-red-500">*</span>
                        {:else}
                            <span class="text-xs text-muted-foreground">(optionnel)</span>
                        {/if}
                    </label>
                    <input
                        id="staff-phone"
                        type="tel"
                        bind:value={newStaffPhone}
                        placeholder="+33 6 12 34 56 78"
                        class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processingAction === 'create'}
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-foreground mb-2">
                        Méthode d'envoi de l'invitation
                    </label>
                    <div class="flex flex-col sm:flex-row gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                bind:group={inviteMethod}
                                value="email"
                                class="w-4 h-4 text-primary border-border-dark focus:ring-primary"
                                disabled={processingAction === 'create'}
                            />
                            <Mail size={16} class="text-muted-foreground" />
                            <span class="text-sm">Email</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                bind:group={inviteMethod}
                                value="sms"
                                class="w-4 h-4 text-primary border-border-dark focus:ring-primary"
                                disabled={processingAction === 'create'}
                            />
                            <MessageSquare size={16} class="text-muted-foreground" />
                            <span class="text-sm">SMS</span>
                        </label>
                    </div>
                </div>

                <div>
                    <label for="staff-password" class="block text-sm font-medium text-foreground mb-1">
                        Mot de passe temporaire (généré automatiquement)
                    </label>
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <input
                                id="staff-password"
                                type={showPassword ? "text" : "password"}
                                bind:value={newStaffPassword}
                                placeholder="Génération..."
                                class="w-full px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                                disabled={processingAction === 'create'}
                                readonly
                            />
                            <button
                                type="button"
                                onclick={() => showPassword = !showPassword}
                                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                title={showPassword ? "Masquer" : "Afficher"}
                            >
                                {#if showPassword}
                                    <EyeOff size={16} />
                                {:else}
                                    <Eye size={16} />
                                {/if}
                            </button>
                        </div>
                        <button
                            type="button"
                            onclick={generatePassword}
                            class="inline-flex items-center gap-2 px-3 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
                            title="Régénérer le mot de passe"
                            disabled={processingAction === 'create'}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        {#if inviteMethod === 'sms'}
                            Un SMS avec le lien de définition du mot de passe sera envoyé au membre du staff.
                        {:else}
                            Un email d'invitation sera envoyé au membre du staff pour définir son mot de passe.
                        {/if}
                    </p>
                </div>

                <div class="flex items-center gap-3">
                    {#if processingAction === 'create'}
                        <button
                            disabled
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg opacity-50"
                        >
                            <Loader2 size={16} class="animate-spin" />
                            <span>Création...</span>
                        </button>
                    {:else}
                        <button
                            onclick={createStaff}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Créer le compte</span>
                        </button>
                    {/if}
                    <button
                        onclick={() => {
                            showCreateForm = false;
                            newStaffFirstName = '';
                            newStaffLastName = '';
                            newStaffEmail = '';
                            newStaffPhone = '';
                            newStaffPassword = '';
                            inviteMethod = 'email';
                            createFormError = null;
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-dark text-foreground rounded-lg hover:bg-muted transition-colors"
                        disabled={processingAction === 'create'}
                    >
                        <XCircle size={16} />
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
            <p class="text-muted-foreground mt-4">Chargement du staff...</p>
        </div>
    {:else if error}
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p class="text-sm font-medium">{error}</p>
        </div>
    {:else if staffList.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <UserX size={48} class="mx-auto text-muted-foreground mb-4" />
            <h3 class="text-lg font-semibold text-foreground mb-2">Aucun membre du staff</h3>
            <p class="text-muted-foreground mb-4">
                Créez des comptes staff pour donner accès au portail staff aux membres de l'équipe.
            </p>
            <button
                onclick={openCreateForm}
                class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            >
                <Plus size={18} />
                <span>Ajouter le premier membre du staff</span>
            </button>
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
                                Créé le
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
                                                {staff.firstName[0]}{staff.lastName[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-foreground">{staff.firstName} {staff.lastName}</p>
                                            <p class="text-xs text-muted-foreground">{staff.email}</p>
                                            {#if staff.phone}
                                                <p class="text-xs text-muted-foreground">{staff.phone}</p>
                                            {/if}
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
                                            title="Réinitialiser le mot de passe"
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
                                            title="Désactiver le staff"
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
