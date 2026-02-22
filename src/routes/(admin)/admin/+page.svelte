<script lang="ts">
	import { Calendar, Users, ArrowRight, BarChart3 } from 'lucide-svelte';
    import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Tableau de bord Admin | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Tableau de bord</h1>
		<p class="text-dark-400">
			Bonjour ! Voici un aperçu de votre contenu Germinal.
		</p>
	</div>

	<!-- Quick Actions -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
		<a
			href="/admin/events/new"
			class="group bg-white rounded-lg border border-border-card p-6 hover:shadow-md hover:border-dark-200 transition-all"
		>
			<div class="flex items-center gap-4 mb-4">
				<div class="p-3 bg-dark-100 rounded-lg">
					<Calendar size={24} class="text-dark-700" />
				</div>
				<h3 class="text-lg font-semibold">Nouvel Événement</h3>
			</div>
			<p class="text-dark-400 text-sm mb-4">Créer un nouvel événement ou une exposition</p>
			<div class="flex items-center gap-2 text-dark-600 text-sm font-medium group-hover:text-dark-900">
				<span>Créer un Événement</span>
				<ArrowRight size={16} class="group-hover:translate-x-1 transition-transform" />
			</div>
		</a>

		<a
			href="/admin/talents/new"
			class="group bg-white rounded-lg border border-border-card p-6 hover:shadow-md hover:border-dark-200 transition-all"
		>
			<div class="flex items-center gap-4 mb-4">
				<div class="p-3 bg-dark-100 rounded-lg">
					<Users size={24} class="text-dark-700" />
				</div>
				<h3 class="text-lg font-semibold">Nouveau Talent</h3>
			</div>
			<p class="text-dark-400 text-sm mb-4">Ajouter un nouveau talent à la collection</p>
			<div class="flex items-center gap-2 text-dark-600 text-sm font-medium group-hover:text-dark-900">
				<span>Ajouter un Talent</span>
				<ArrowRight size={16} class="group-hover:translate-x-1 transition-transform" />
			</div>
		</a>

		<a
			href="/admin/analytics"
			class="group bg-white rounded-lg border border-border-card p-6 hover:shadow-md hover:border-dark-200 transition-all"
		>
			<div class="flex items-center gap-4 mb-4">
				<div class="p-3 bg-dark-100 rounded-lg">
					<BarChart3 size={24} class="text-dark-700" />
				</div>
				<h3 class="text-lg font-semibold">Analytiques</h3>
			</div>
			<p class="text-dark-400 text-sm mb-4">Voir les paiements et les revenus</p>
			<div class="flex items-center gap-2 text-dark-600 text-sm font-medium group-hover:text-dark-900">
				<span>Voir les Analytiques</span>
				<ArrowRight size={16} class="group-hover:translate-x-1 transition-transform" />
			</div>
		</a>

		<a
			href="/admin/change-password"
			class="group bg-white rounded-lg border border-border-card p-6 hover:shadow-md hover:border-dark-200 transition-all"
		>
			<div class="flex items-center gap-4 mb-4">
				<div class="p-3 bg-dark-100 rounded-lg">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-dark-700"
					>
						<path
							d="M2 18a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z"
						></path>
						<circle cx="12" cy="11" r="3"></circle>
					</svg>
				</div>
				<h3 class="text-lg font-semibold">Paramètres</h3>
			</div>
			<p class="text-dark-400 text-sm mb-4">Gérer les paramètres de votre compte</p>
			<div class="flex items-center gap-2 text-dark-600 text-sm font-medium group-hover:text-dark-900">
				<span>Changer le Mot de Passe</span>
				<ArrowRight size={16} class="group-hover:translate-x-1 transition-transform" />
			</div>
		</a>
	</div>

	<!-- Account Info -->
	<div class="max-w-4xl">
		<div class="bg-white rounded-lg border border-border-card p-8">
			<h2 class="text-2xl font-bold mb-6">Informations du Compte</h2>

			<div class="space-y-4">
				<div class="flex items-center justify-between py-3 border-b border-border-card">
					<span class="text-dark-600">Email</span>
					<span class="font-medium text-dark-900">{data.user.email}</span>
				</div>

				<div class="flex items-center justify-between py-3 border-b border-border-card">
					<span class="text-dark-600">Rôle</span>
					<span class="font-medium text-dark-900 capitalize">{data.user.role}</span>
				</div>

				<div class="flex items-center justify-between py-3">
					<span class="text-dark-600">Membre depuis</span>
					<span class="font-medium text-dark-900">{new Date(data.user.createdAt).toLocaleDateString()}</span>
				</div>
			</div>
		</div>
	</div>
</div>
