<script lang="ts">
	import { enhance } from '$app/forms';
	import { AlertCircle } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { t } from 'svelte-i18n';

	let { data, form }: { data: PageData; form: import('./$types').ActionData } = $props();
</script>

<svelte:head>
	<title>{$t('admin.login.pageTitle')}</title>
	<meta
		name="description"
		content="Sign in to your Germinal account"
	/>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="max-w-md w-full">
		<div class="text-center mb-12">
			<h1 class="text-4xl font-bold mb-4">{$t('admin.login.title')}</h1>
			<p class="text-dark-400">
				{$t('admin.login.description')}
			</p>
		</div>

		<form method="POST" use:enhance class="space-y-6">
			{#if form?.error}
				<div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-3">
					<AlertCircle size={20} class="shrink-0 mt-0.5" />
					<p class="text-sm">{form.error}</p>
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-dark-700 mb-2">
						{$t('admin.login.email')}
					</label>
					<input
						id="email"
						name="email"
						type="email"
					 autocomplete="email"
						required
						placeholder="you@example.com"
						class="w-full px-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
					/>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-dark-700 mb-2">
						{$t('admin.login.password')}
					</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						placeholder="••••••••"
						class="w-full px-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
					/>
				</div>
			</div>

			<button
				type="submit"
				disabled={form?.rateLimited}
				class="w-full bg-dark-900 text-white py-3 px-4 rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-dark-900"
			>
				{form?.rateLimited ? $t('admin.login.rateLimited') : $t('admin.login.signIn')}
			</button>
		</form>

		{#if data.showMockCredentials}
			<div class="mt-6 text-center text-sm text-dark-400">
				<p>For development, use:</p>
				<p class="font-mono mt-1">{data.mockEmail} / (your password)</p>
			</div>
		{/if}
	</div>
</div>
