<script lang="ts">
	import { enhance } from '$app/forms';
	import { Eye, EyeOff } from 'lucide-svelte';
	import type { ActionData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data, form } = $props();

	const toast = getToastContext();

	function changePasswordEnhance() {
		return ({ formElement }: { formElement: HTMLFormElement }) =>
			async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
				if (result.type === 'success') {
					toast.success('Succès', (result.data as { message?: string })?.message ?? 'Mot de passe mis à jour');
					formElement.reset();
				} else if (result.type === 'failure') {
					toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
				}
			};
	}

	let showCurrent = $state(false);
	let showNew = $state(false);
	let showConfirm = $state(false);
</script>

<svelte:head>
	<title>Changer le mot de passe | Portail Staff</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="max-w-md mx-auto">
		<div class="bg-background rounded-lg border border-border-card p-8">
			<h1 class="text-2xl font-bold mb-6">Changer le mot de passe</h1>

			<div class="mb-6 p-4 bg-muted rounded-lg">
				<p class="text-sm text-foreground-alt">
					<strong>Email :</strong> {data.user.email}
				</p>
			</div>

			{#if form?.error}
				<div class="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
					<p class="text-sm text-red-700 dark:text-red-300">{form.error}</p>
				</div>
			{/if}

			<form method="POST" use:enhance={changePasswordEnhance()} class="space-y-6">
				<div>
					<label for="currentPassword" class="block text-sm font-medium text-foreground-alt mb-2">
						Mot de passe actuel
					</label>
					<div class="relative">
						<input
							id="currentPassword"
							name="currentPassword"
							type={showCurrent ? 'text' : 'password'}
							autocomplete="current-password"
							required
							placeholder="••••••••"
							class="w-full px-4 py-3 pr-12 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
						/>
						<button
							type="button"
							onclick={() => (showCurrent = !showCurrent)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground-alt transition-colors"
							aria-label={showCurrent ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
						>
							{#if showCurrent}
								<EyeOff size={20} />
							{:else}
								<Eye size={20} />
							{/if}
						</button>
					</div>
				</div>

				<div>
					<label for="newPassword" class="block text-sm font-medium text-foreground-alt mb-2">
						Nouveau mot de passe
					</label>
					<div class="relative">
						<input
							id="newPassword"
							name="newPassword"
							type={showNew ? 'text' : 'password'}
							autocomplete="new-password"
							required
							minlength="8"
							placeholder="••••••••"
							class="w-full px-4 py-3 pr-12 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
						/>
						<button
							type="button"
							onclick={() => (showNew = !showNew)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground-alt transition-colors"
							aria-label={showNew ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
						>
							{#if showNew}
								<EyeOff size={20} />
							{:else}
								<Eye size={20} />
							{/if}
						</button>
					</div>
					<p class="mt-1 text-sm text-muted-foreground">Doit contenir au moins 8 caractères</p>
				</div>

				<div>
					<label for="confirmPassword" class="block text-sm font-medium text-foreground-alt mb-2">
						Confirmer le nouveau mot de passe
					</label>
					<div class="relative">
						<input
							id="confirmPassword"
							name="confirmPassword"
							type={showConfirm ? 'text' : 'password'}
							autocomplete="new-password"
							required
							minlength="8"
							placeholder="••••••••"
							class="w-full px-4 py-3 pr-12 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
						/>
						<button
							type="button"
							onclick={() => (showConfirm = !showConfirm)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground-alt transition-colors"
							aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
						>
							{#if showConfirm}
								<EyeOff size={20} />
							{:else}
								<Eye size={20} />
							{/if}
						</button>
					</div>
				</div>

				<button
					type="submit"
					class="w-full bg-foreground text-background py-3 px-4 rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors"
				>
					Mettre à jour le mot de passe
				</button>
			</form>
		</div>

		<!-- Sur téléphone, la déconnexion vit ici (la barre latérale l'offre sur ordinateur). -->
		<form method="POST" action="/logout" class="lg:hidden mt-6">
			<button
				type="submit"
				class="w-full py-3 px-4 text-sm text-red-600 border border-border-card rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
			>
				Déconnexion
			</button>
		</form>
	</div>
</div>
