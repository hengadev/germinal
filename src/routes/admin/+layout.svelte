<script lang="ts">
	import { page } from '$app/states';
	import { slide } from 'svelte/transition';
	import AdminSidebar from './AdminSidebar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="min-h-screen bg-dark-50 flex flex-col lg:flex-row">
	<!-- Desktop Sidebar -->
	<AdminSidebar {data} />

	<!-- Mobile Header (shown only on small screens) -->
	<header class="lg:hidden sticky top-0 z-40 bg-white border-b border-border-card">
		<div class="flex items-center justify-between px-4 py-3">
			<div class="flex items-center gap-3">
				<h1 class="text-lg font-semibold text-dark-900">Admin</h1>
			</div>
			<div class="flex items-center gap-2">
				<a
					href="/admin/change-password"
					class="p-2 text-dark-600 hover:text-dark-900 rounded-lg hover:bg-dark-50 transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M2 18a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z"
						></path>
						<circle cx="12" cy="11" r="3"></circle>
						<path d="M22 18a3 3 0 0 1-3-3h-4a3 3 0 0 0-3 3v2h10v-2Z"></path>
					</svg>
				</a>
				<a
					href="/logout"
					class="p-2 text-dark-600 hover:text-dark-900 rounded-lg hover:bg-dark-50 transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
						<polyline points="16 17 21 12 16 7"></polyline>
						<line x1="21" x2="9" y1="12" y2="12"></line>
					</svg>
				</a>
			</div>
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-1 lg:ml-0 pb-20 lg:pb-0">
		{@render children()}
	</main>

	<!-- Mobile Bottom Navigation -->
	<nav
		class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border-card safe-area-inset-bottom"
		aria-label="Mobile navigation"
	>
		<div class="flex items-center justify-around px-2 py-2">
			{#if ['/', '/admin'].includes(page.url.pathname)}
				<a
					href="/admin"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-900"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
						<polyline points="9 22 9 12 15 12 15 22"></polyline>
					</svg>
					<span class="text-xs font-medium">Dashboard</span>
				</a>
			{:else}
				<a
					href="/admin"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-500 hover:text-dark-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
						<polyline points="9 22 9 12 15 12 15 22"></polyline>
					</svg>
					<span class="text-xs font-medium">Dashboard</span>
				</a>
			{/if}

			{#if page.url.pathname.startsWith('/admin/events')}
				<a
					href="/admin/events"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-900"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
						<line x1="16" x2="16" y1="2" y2="6"></line>
						<line x1="8" x2="8" y1="2" y2="6"></line>
						<line x1="3" x2="21" y1="10" y2="10"></line>
					</svg>
					<span class="text-xs font-medium">Events</span>
				</a>
			{:else}
				<a
					href="/admin/events"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-500 hover:text-dark-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
						<line x1="16" x2="16" y1="2" y2="6"></line>
						<line x1="8" x2="8" y1="2" y2="6"></line>
						<line x1="3" x2="21" y1="10" y2="10"></line>
					</svg>
					<span class="text-xs font-medium">Events</span>
				</a>
			{/if}

			{#if page.url.pathname.startsWith('/admin/talents')}
				<a
					href="/admin/talents"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-900"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
						<circle cx="9" cy="7" r="4"></circle>
						<path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					</svg>
					<span class="text-xs font-medium">Talents</span>
				</a>
			{:else}
				<a
					href="/admin/talents"
					class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-500 hover:text-dark-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
						<circle cx="9" cy="7" r="4"></circle>
						<path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					</svg>
					<span class="text-xs font-medium">Talents</span>
				</a>
			{/if}

			<a
				href="/admin/change-password"
				class="flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-dark-500 hover:text-dark-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M2 18a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z"
					></path>
					<circle cx="12" cy="11" r="3"></circle>
				</svg>
				<span class="text-xs font-medium">Settings</span>
			</a>
		</div>
	</nav>
</div>

<style>
	:global(.safe-area-inset-bottom) {
		padding-bottom: env(safe-area-inset-bottom);
	}
</style>
