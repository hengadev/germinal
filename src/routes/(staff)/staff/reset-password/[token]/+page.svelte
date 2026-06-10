<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/state";
    import { Loader2, CheckCircle2, AlertCircle } from "lucide-svelte";
    import { getToastContext } from "$lib/components/toast/state.svelte";

    interface Props {
        form?: {
            success?: string;
            error?: string;
        };
    }

    let { form }: Props = $props();

    const toast = getToastContext();

    let newPassword = $state("");
    let confirmPassword = $state("");
    let showPassword = $state(false);
    let showConfirmPassword = $state(false);
    let clientError = $state<string | null>(null);

    function validateForm(): boolean {
        clientError = null;

        if (!newPassword || newPassword.length < 8) {
            clientError = "Le mot de passe doit contenir au moins 8 caractères";
            return false;
        }

        if (newPassword !== confirmPassword) {
            clientError = "Les mots de passe ne correspondent pas";
            return false;
        }

        return true;
    }

    function handleSubmit() {
        if (!validateForm()) {
            return;
        }
    }

    $effect(() => {
        if (form?.success) {
            toast.success("Succès", form.success);
        } else if (form?.error) {
            toast.error("Erreur", form.error);
        }
    });
</script>

<div class="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
    <div class="max-w-md w-full">
        <div class="bg-background border border-border-card rounded-lg shadow-mini p-8">
            <div class="text-center mb-8">
                <h1 class="text-2xl font-bold text-foreground">Définir votre mot de passe</h1>
                <p class="text-muted-foreground mt-2">
                    Créez un nouveau mot de passe pour accéder au portail staff
                </p>
            </div>

            {#if form?.success}
                <div class="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <CheckCircle2 class="w-12 h-12 text-green-600 mx-auto mb-4" />
                    <h2 class="text-lg font-semibold text-green-900 mb-2">
                        Mot de passe défini avec succès
                    </h2>
                    <p class="text-sm text-green-700 mb-6">
                        Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                    </p>
                    <a
                        href="/staff/login"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                        Se connecter
                    </a>
                </div>
            {:else}
                <form
                    method="POST"
                    use:enhance
                    onsubmit={handleSubmit}
                    class="space-y-6"
                >
                    {#if clientError}
                        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-3">
                            <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <p class="text-sm">{clientError}</p>
                        </div>
                    {/if}

                    {#if form?.error}
                        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-3">
                            <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <p class="text-sm">{form.error}</p>
                        </div>
                    {/if}

                    <div>
                        <label for="new-password" class="block text-sm font-medium text-foreground mb-2">
                            Nouveau mot de passe
                        </label>
                        <div class="relative">
                            <input
                                id="new-password"
                                name="newPassword"
                                type={showPassword ? "text" : "password"}
                                bind:value={newPassword}
                                placeholder="••••••••"
                                class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                                autocomplete="new-password"
                            />
                            <button
                                type="button"
                                onclick={() => showPassword = !showPassword}
                                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {#if showPassword}
                                    👁️
                                {:else}
                                    🙈
                                {/if}
                            </button>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1">
                            Minimum 8 caractères
                        </p>
                    </div>

                    <div>
                        <label for="confirm-password" class="block text-sm font-medium text-foreground mb-2">
                            Confirmer le mot de passe
                        </label>
                        <div class="relative">
                            <input
                                id="confirm-password"
                                name="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                bind:value={confirmPassword}
                                placeholder="••••••••"
                                class="w-full px-3 py-2 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                                autocomplete="new-password"
                            />
                            <button
                                type="button"
                                onclick={() => showConfirmPassword = !showConfirmPassword}
                                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {#if showConfirmPassword}
                                    👁️
                                {:else}
                                    🙈
                                {/if}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                        {#if form?.success}
                            <CheckCircle2 class="w-4 h-4" />
                        {:else}
                            Définir le mot de passe
                        {/if}
                    </button>

                    <p class="text-xs text-center text-muted-foreground">
                        Ce lien expire dans 24 heures.
                    </p>
                </form>
            {/if}
        </div>
    </div>
</div>
