<script lang="ts">
	import { enhance } from '$app/forms';
	import { LogOut, KeyRound } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Admin Dashboard | Germinal</title>
</svelte:head>

<div class="min-h-screen bg-dark-50">
	<nav class="bg-white border-b border-border-card">
		<div class="container mx-auto px-4">
			<div class="flex justify-between items-center h-16">
				<div class="flex items-center">
					<h1 class="text-xl font-semibold">Admin Dashboard</h1>
				</div>

				<div class="flex items-center gap-6">
					<div class="text-sm">
						<span class="text-dark-700">{data.user.email}</span>
						<span class="text-dark-400 ml-2">({data.user.role})</span>
					</div>

					<a
						href="/admin/change-password"
						class="flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors text-sm"
					>
						<KeyRound size={16} />
						<span>Change Password</span>
					</a>

					<form method="POST" action="/logout" use:enhance>
						<button
							type="submit"
							class="flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors text-sm"
						>
							<LogOut size={16} />
							<span>Logout</span>
						</button>
					</form>
				</div>
			</div>
		</div>
	</nav>

	<main class="container mx-auto px-4 py-12">
		<div class="max-w-4xl mx-auto">
			<div class="bg-white rounded-lg border border-border-card p-8">
				<h2 class="text-2xl font-bold mb-6">Welcome to Admin Dashboard</h2>

				<div class="space-y-4">
					<div class="flex items-center justify-between py-3 border-b border-border-card">
						<span class="text-dark-600">Email</span>
						<span class="font-medium text-dark-900">{data.user.email}</span>
					</div>

					<div class="flex items-center justify-between py-3 border-b border-border-card">
						<span class="text-dark-600">Role</span>
						<span class="font-medium text-dark-900">{data.user.role}</span>
					</div>

					<div class="flex items-center justify-between py-3">
						<span class="text-dark-600">Member since</span>
						<span class="font-medium text-dark-900">{new Date(data.user.createdAt).toLocaleDateString()}</span>
					</div>
				</div>

				<div class="mt-8 p-4 bg-dark-50 rounded-lg">
					<p class="text-sm text-dark-600">
						You have full admin access to manage events, talents, and media content.
					</p>
				</div>
			</div>
		</div>
	</main>
</div>
