<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Eye, EyeOff } from 'lucide-svelte';
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
	<title>Changer le Mot de Passe | Tableau de bord Admin</title>
</svelte:head>

<div class="min-h-screen bg-dark-50">
	<nav class="bg-white border-b border-border-card">
		<div class="container mx-auto px-4">
			<div class="flex items-center h-16">
				<a
					href="/admin"
					class="flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors"
				>
					<ArrowLeft size={20} />
					<span>Retour au Tableau de Bord</span>
				</a>
			</div>
		</div>
	</nav>

	<main class="container mx-auto px-4 py-12">
		<div class="max-w-md mx-auto">
			<div class="bg-white rounded-lg border border-border-card p-8">
				<h1 class="text-2xl font-bold mb-6">Changer le Mot de Passe</h1>

				<div class="mb-6 p-4 bg-dark-50 rounded-lg">
					<p class="text-sm text-dark-700">
						<strong>Email :</strong> {data.user.email}
					</p>
				</div>

				<form method="POST" use:enhance={changePasswordEnhance()} class="space-y-6">
					<div>
						<label for="currentPassword" class="block text-sm font-medium text-dark-700 mb-2">
							Mot de Passe Actuel
						</label>
						<div class="relative">
							<input
								id="currentPassword"
								name="currentPassword"
								type={showCurrent ? 'text' : 'password'}
								autocomplete="current-password"
								required
								placeholder="••••••••"
								class="w-full px-4 py-3 pr-12 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
							<button
								type="button"
								onclick={() => (showCurrent = !showCurrent)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700 transition-colors"
								aria-label={showCurrent ? 'Hide password' : 'Show password'}
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
						<label for="newPassword" class="block text-sm font-medium text-dark-700 mb-2">
							Nouveau Mot de Passe
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
								class="w-full px-4 py-3 pr-12 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
							<button
								type="button"
								onclick={() => (showNew = !showNew)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700 transition-colors"
								aria-label={showNew ? 'Hide password' : 'Show password'}
							>
								{#if showNew}
									<EyeOff size={20} />
								{:else}
									<Eye size={20} />
								{/if}
							</button>
						</div>
						<p class="mt-1 text-sm text-dark-400">Doit contenir au moins 8 caractères</p>
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-dark-700 mb-2">
							Confirmer le Nouveau Mot de Passe
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
								class="w-full px-4 py-3 pr-12 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
							<button
								type="button"
								onclick={() => (showConfirm = !showConfirm)}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700 transition-colors"
								aria-label={showConfirm ? 'Hide password' : 'Show password'}
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
						class="w-full bg-dark-900 text-white py-3 px-4 rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors"
					>
						Mettre à jour le Mot de Passe
					</button>
				</form>
			</div>
		</div>
	</main>
</div>
