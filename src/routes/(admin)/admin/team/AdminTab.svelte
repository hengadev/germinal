<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Plus,
        UserX,
        RefreshCw,
        CheckCircle2,
        XCircle,
        Loader2,
        Eye,
        EyeOff,
        ShieldAlert,
    } from "lucide-svelte";
    import type { ActionData } from "./$types";
    import { getToastContext } from "$lib/components/toast/state.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";

    interface Props {
        form?: ActionData;
        currentUserId: string;
    }

    let { form, currentUserId }: Props = $props();

    const toast = getToastContext();

    interface AdminUser {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: string;
        createdAt: Date;
    }

    let adminList = $state<AdminUser[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showCreateForm = $state(false);
    let createFormError = $state<string | null>(null);
    let processingAction = $state<string | null>(null);

    // Deactivate confirmation modal state
    let deactivateModalOpen = $state(false);
    let adminToDeactivate = $state<AdminUser | null>(null);

    // Create form state
    let newAdminFirstName = $state('');
    let newAdminLastName = $state('');
    let newAdminEmail = $state('');
    let newAdminPassword = $state('');
    let showPassword = $state(false);

    async function loadAdmins() {
        loading = true;
        error = null;
        try {
            const response = await fetch('/api/admin/team/admin');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error ?? `Erreur ${response.status}`);
            }
            adminList = data;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Échec du chargement des comptes admin';
            console.error('Error loading admins:', err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadAdmins();
    });

    async function generatePassword() {
        try {
            const response = await fetch('/api/admin/team/staff/generate-password');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate password');
            }
            newAdminPassword = data.password;
        } catch (err) {
            toast.error('Erreur', err instanceof Error ? err.message : 'Échec de la génération du mot de passe');
        }
    }

    function openCreateForm() {
        showCreateForm = true;
        generatePassword();
    }

    async function createAdmin() {
        if (!newAdminFirstName || newAdminFirstName.length < 1 || newAdminFirstName.length > 100) {
            createFormError = 'Le prénom est requis (1-100 caractères)';
            return;
        }

        if (!newAdminLastName || newAdminLastName.length < 1 || newAdminLastName.length > 100) {
            createFormError = 'Le nom est requis (1-100 caractères)';
            return;
        }

        if (!newAdminEmail || !newAdminPassword) {
            createFormError = 'L\'email et le mot de passe sont requis';
            return;
        }

        if (newAdminPassword.length < 8) {
            createFormError = 'Le mot de passe doit contenir au moins 8 caractères';
            return;
        }

        if (newAdminEmail.includes('germinal.com')) {
            createFormError = 'L\'email ne peut pas contenir "germinal.com"';
            return;
        }

        processingAction = 'create';
        createFormError = null;

        try {
            const formData = new FormData();
            formData.append('firstName', newAdminFirstName);
            formData.append('lastName', newAdminLastName);
            formData.append('email', newAdminEmail);
            formData.append('password', newAdminPassword);

            const response = await fetch('/api/admin/team/admin', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de la création du compte admin');
            }

            toast.success('Succès', result.success || 'Compte admin créé avec succès');
            newAdminFirstName = '';
            newAdminLastName = '';
            newAdminEmail = '';
            newAdminPassword = '';
            showCreateForm = false;
            await loadAdmins();
        } catch (err) {
            createFormError = err instanceof Error ? err.message : 'Échec de la création du compte admin';
            toast.error('Erreur', createFormError);
        } finally {
            processingAction = null;
        }
    }

    function openDeactivateModal(admin: AdminUser) {
        // SAFETY: guard against self-deactivation in the UI too (defense in depth —
        // the server action rejects this independently). Should be unreachable since
        // the button is disabled for the current user's own row, but this keeps the
        // modal itself safe even if invoked some other way.
        if (admin.id === currentUserId) {
            toast.error('Erreur', 'Vous ne pouvez pas désactiver votre propre compte');
            return;
        }
        adminToDeactivate = admin;
        deactivateModalOpen = true;
    }

    async function confirmDeactivate() {
        if (!adminToDeactivate) return;

        processingAction = `deactivate-${adminToDeactivate.id}`;
        deactivateModalOpen = false;

        try {
            const formData = new FormData();
            formData.append('adminId', adminToDeactivate.id);

            const response = await fetch('/api/admin/team/admin/deactivate', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Échec de la désactivation du compte admin');
            }

            toast.success('Succès', result.success || 'Compte admin désactivé avec succès');
            await loadAdmins();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Échec de la désactivation du compte admin';
            toast.error('Erreur', errorMsg);
        } finally {
            processingAction = null;
            adminToDeactivate = null;
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
            <h2 class="text-2xl font-semibold">Comptes Admin</h2>
            <p class="text-muted-foreground">Gérer les comptes et accès du back-office</p>
        </div>
        <button
            onclick={openCreateForm}
            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
        >
            <Plus size={18} />
            <span>Ajouter un compte admin</span>
        </button>
    </div>

    <!-- Create Admin Form -->
    {#if showCreateForm}
        <div class="bg-background border border-border-card rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">Créer un nouveau compte admin</h3>

            {#if createFormError}
                <div class="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                    <p class="text-sm font-medium">{createFormError}</p>
                </div>
            {/if}

            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="admin-firstname" class="block text-sm font-medium text-foreground mb-1">
                            Prénom <span class="text-red-500">*</span>
                        </label>
                        <input
                            id="admin-firstname"
                            type="text"
                            bind:value={newAdminFirstName}
                            placeholder="Jean"
                            class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processingAction === 'create'}
                        />
                    </div>
                    <div>
                        <label for="admin-lastname" class="block text-sm font-medium text-foreground mb-1">
                            Nom <span class="text-red-500">*</span>
                        </label>
                        <input
                            id="admin-lastname"
                            type="text"
                            bind:value={newAdminLastName}
                            placeholder="Dupont"
                            class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={processingAction === 'create'}
                        />
                    </div>
                </div>

                <div>
                    <label for="admin-email" class="block text-sm font-medium text-foreground mb-1">
                        Adresse email
                    </label>
                    <input
                        id="admin-email"
                        type="email"
                        bind:value={newAdminEmail}
                        placeholder="admin@exemple.com"
                        class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={processingAction === 'create'}
                    />
                </div>

                <div>
                    <label for="admin-password" class="block text-sm font-medium text-foreground mb-1">
                        Mot de passe temporaire (généré automatiquement)
                    </label>
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <input
                                id="admin-password"
                                type={showPassword ? "text" : "password"}
                                bind:value={newAdminPassword}
                                placeholder="Génération..."
                                class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
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
                            class="inline-flex items-center gap-2 px-3 py-2 border border-border-input text-foreground rounded-lg hover:bg-muted transition-colors"
                            title="Régénérer le mot de passe"
                            disabled={processingAction === 'create'}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        Un email d'invitation sera envoyé au nouvel administrateur pour définir son mot de passe.
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
                            onclick={createAdmin}
                            class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
                        >
                            <CheckCircle2 size={16} />
                            <span>Créer le compte</span>
                        </button>
                    {/if}
                    <button
                        onclick={() => {
                            showCreateForm = false;
                            newAdminFirstName = '';
                            newAdminLastName = '';
                            newAdminEmail = '';
                            newAdminPassword = '';
                            createFormError = null;
                        }}
                        class="inline-flex items-center gap-2 px-4 py-2 border border-border-input text-foreground rounded-lg hover:bg-muted transition-colors"
                        disabled={processingAction === 'create'}
                    >
                        <XCircle size={16} />
                        <span>Annuler</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Admin List -->
    {#if loading}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <Loader2 size={32} class="animate-spin mx-auto text-muted-foreground" />
            <p class="text-muted-foreground mt-4">Chargement des comptes admin...</p>
        </div>
    {:else if error}
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p class="text-sm font-medium">{error}</p>
        </div>
    {:else if adminList.length === 0}
        <div class="bg-background border border-border-card rounded-lg p-8 text-center">
            <UserX size={48} class="mx-auto text-muted-foreground mb-4" />
            <h3 class="text-lg font-semibold text-foreground mb-2">Aucun compte admin</h3>
            <p class="text-muted-foreground mb-4">
                Créez des comptes admin pour donner accès au back-office à d'autres membres de l'équipe.
            </p>
            <button
                onclick={openCreateForm}
                class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors"
            >
                <Plus size={18} />
                <span>Ajouter le premier compte admin</span>
            </button>
        </div>
    {:else}
        <div class="bg-background border border-border-card rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-muted border-b border-border-card">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                                Administrateur
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
                        {#each adminList as admin (admin.id)}
                            {@const isSelf = admin.id === currentUserId}
                            <tr class="hover:bg-muted/50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span class="text-xs font-semibold text-primary uppercase">
                                                {admin.firstName[0]}{admin.lastName[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-foreground">
                                                {admin.firstName} {admin.lastName}
                                                {#if isSelf}
                                                    <span class="text-xs text-muted-foreground">(vous)</span>
                                                {/if}
                                            </p>
                                            <p class="text-xs text-muted-foreground">{admin.email}</p>
                                            {#if admin.phone}
                                                <p class="text-xs text-muted-foreground">{admin.phone}</p>
                                            {/if}
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                        {admin.role}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    <p class="text-sm text-muted-foreground">{formatDate(admin.createdAt)}</p>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-2">
                                        {#if isSelf}
                                            <span
                                                class="p-2 text-muted-foreground/50 cursor-not-allowed"
                                                title="Vous ne pouvez pas désactiver votre propre compte"
                                            >
                                                <ShieldAlert size={16} />
                                            </span>
                                        {:else}
                                            <button
                                                onclick={() => openDeactivateModal(admin)}
                                                class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Désactiver l'administrateur"
                                                disabled={processingAction === `deactivate-${admin.id}`}
                                            >
                                                {#if processingAction === `deactivate-${admin.id}`}
                                                    <Loader2 size={16} class="animate-spin" />
                                                {:else}
                                                    <UserX size={16} />
                                                {/if}
                                            </button>
                                        {/if}
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

<Modal
    bind:isOpen={deactivateModalOpen}
    title="Désactiver le compte admin"
    description="Êtes-vous sûr de vouloir désactiver {adminToDeactivate?.firstName} {adminToDeactivate?.lastName} ({adminToDeactivate?.email}) ? Cela l'empêchera d'accéder au back-office admin."
>
    <div class="flex justify-end gap-3 mt-6">
        <button
            type="button"
            onclick={() => { deactivateModalOpen = false; adminToDeactivate = null; }}
            class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium"
        >
            Annuler
        </button>
        <button
            type="button"
            onclick={confirmDeactivate}
            class="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
        >
            Désactiver
        </button>
    </div>
</Modal>
