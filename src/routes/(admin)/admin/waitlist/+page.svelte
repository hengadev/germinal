<script lang="ts">
	import { User, Mail, Phone, CheckCircle2, Clock, XCircle, AlertCircle, Filter, Calendar, Trash2, Send, Check, ChevronRight, Ticket } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	// Filter state
	let sessionFilter = $state(data.filters.session);
	let notifiedFilter = $state(data.filters.notified);

	// Selection state
	let selectedEntries = $state<Set<string>>(new Set());

	// Form state
	let form = $state<{
		success?: string;
		error?: string;
	} | undefined>();

	// Get status badge
	function getNotifiedBadge(notified: boolean) {
		return notified
			? { text: 'Notified', class: 'bg-green-50 text-green-700', icon: CheckCircle2 }
			: { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
	}

	// Build filter URL
	let filterUrl = $derived(() => {
		const params = new URLSearchParams();
		if (sessionFilter !== 'all') params.set('session', sessionFilter);
		if (notifiedFilter !== 'all') params.set('notified', notifiedFilter);
		return `?${params.toString()}`;
	});

	// Format date and time
	function formatDateTime(dateString: string): string {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(dateString: string): string {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Check if entry is expired
	function isExpired(expiresAt: string): boolean {
		return new Date(expiresAt) < new Date();
	}

	// Toggle selection
	function toggleSelection(entryId: string) {
		if (selectedEntries.has(entryId)) {
			selectedEntries.delete(entryId);
		} else {
			selectedEntries.add(entryId);
		}
		selectedEntries = new Set(selectedEntries); // Trigger reactivity
	}

	// Toggle all selection
	function toggleAll() {
		if (selectedEntries.size === data.waitlistEntries.length) {
			selectedEntries = new Set();
		} else {
			selectedEntries = new Set(data.waitlistEntries.map(e => e.id));
		}
	}

	// Navigate with filters
	function applyFilters() {
		window.location.href = filterUrl();
	}

	// Get selected entry IDs for form submission
	function getSelectedIds() {
		return Array.from(selectedEntries);
	}
</script>

<svelte:head>
	<title>Waitlist | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Waitlist Management</h1>
		<p class="text-dark-400">Manage event waitlist entries and notifications</p>
	</div>

	<!-- Success/Error Messages -->
	{#if form?.success}
		<div class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-3">
			<CheckCircle2 size={20} />
			<span>{form.success}</span>
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-3">
			<AlertCircle size={20} />
			<span>{form.error}</span>
		</div>
	{/if}

	<!-- Filters -->
	<div class="bg-white rounded-lg border border-border-card p-4 mb-6">
		<div class="flex flex-col sm:flex-row gap-4">
			<!-- Session Filter -->
			<div class="flex-1">
				<label for="sessionFilter" class="block text-sm font-medium text-dark-700 mb-1">Filter by Session</label>
				<select
					id="sessionFilter"
					bind:value={sessionFilter}
					class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
				>
					<option value="all">All Sessions</option>
					{#each data.sessions as session}
						<option value={session.id}>{session.title}</option>
					{/each}
				</select>
			</div>

			<!-- Notified Filter -->
			<div class="flex-1">
				<label for="notifiedFilter" class="block text-sm font-medium text-dark-700 mb-1">Filter by Status</label>
				<select
					id="notifiedFilter"
					bind:value={notifiedFilter}
					class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
				>
					<option value="all">All Statuses</option>
					<option value="pending">Pending Notification</option>
					<option value="notified">Already Notified</option>
				</select>
			</div>

			<!-- Apply Button -->
			<div class="flex items-end">
				<button
					onclick={applyFilters}
					class="w-full sm:w-auto px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm inline-flex items-center justify-center gap-2"
				>
					<Filter size={16} />
					Apply Filters
				</button>
			</div>
		</div>

		<!-- Results count -->
		<div class="mt-3 text-sm text-dark-500">
			Showing {data.waitlistEntries.length} entries
		</div>
	</div>

	{#if data.waitlistEntries.length === 0}
		<div class="bg-white rounded-lg border border-border-card p-12 text-center">
			<User size={48} class="mx-auto mb-4 text-dark-300" />
			<h3 class="text-xl font-semibold text-dark-900 mb-2">
				No waitlist entries found
			</h3>
			<p class="text-dark-400">
				{#if sessionFilter !== 'all' || notifiedFilter !== 'all'}
					Try adjusting your filters
				{:else}
					No one is on the waitlist yet
				{/if}
			</p>
		</div>
	{:else}
		<!-- Bulk Actions -->
		{#if selectedEntries.size > 0}
			<div class="bg-dark-900 text-white rounded-lg p-4 mb-6">
				<div class="flex items-center justify-between flex-wrap gap-4">
					<div>
						<span class="font-semibold">{selectedEntries.size}</span> entries selected
					</div>
					<div class="flex items-center gap-3 flex-wrap">
						<form method="POST" action="?/notify" use:enhance={({ formData, action, cancel }) => {
								// Add selected entry IDs to form data
								const ids = getSelectedIds();
								for (const id of ids) {
									formData.append('entryIds', id);
								}
								return async ({ result, update }) => {
									if (result.type === 'success' && result.data) {
										form = { success: (result.data as { message: string }).message };
										selectedEntries = new Set();
									} else if (result.type === 'failure' && result.data) {
										form = { error: (result.data as { error?: string }).error || 'Action failed' };
									}
									update();
								};
							}}>
							<button
								type="submit"
								class="px-4 py-2 bg-white text-dark-900 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm inline-flex items-center gap-2"
							>
								<Send size={16} />
								Notify Selected
							</button>
						</form>

						<form method="POST" action="?/markNotified" use:enhance={({ formData, action, cancel }) => {
								const ids = getSelectedIds();
								for (const id of ids) {
									formData.append('entryIds', id);
								}
								return async ({ result, update }) => {
									if (result.type === 'success' && result.data) {
										form = { success: (result.data as { message: string }).message };
										selectedEntries = new Set();
									} else if (result.type === 'failure' && result.data) {
										form = { error: (result.data as { error?: string }).error || 'Action failed' };
									}
									update();
								};
							}}>
							<button
								type="submit"
								class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm inline-flex items-center gap-2"
							>
								<Check size={16} />
								Mark as Notified
							</button>
						</form>

						<form method="POST" action="?/delete" use:enhance={({ formData, action, cancel }) => {
								if (!confirm(`Are you sure you want to delete ${selectedEntries.size} entries?`)) {
									cancel();
								}
								const ids = getSelectedIds();
								for (const id of ids) {
									formData.append('entryIds', id);
								}
								return async ({ result, update }) => {
									if (result.type === 'success' && result.data) {
										form = { success: (result.data as { message: string }).message };
										selectedEntries = new Set();
									} else if (result.type === 'failure' && result.data) {
										form = { error: (result.data as { error?: string }).error || 'Action failed' };
									}
									update();
								};
							}}>
							<button
								type="submit"
								class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm inline-flex items-center gap-2"
							>
								<Trash2 size={16} />
								Delete Selected
							</button>
						</form>
					</div>
				</div>
			</div>
		{/if}

		<!-- Table view for desktop -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-dark-50 border-b border-border-card">
					<tr>
						<th class="px-4 py-4 text-left w-12">
							<input
								type="checkbox"
								checked={selectedEntries.size === data.waitlistEntries.length}
								onchange={toggleAll}
								class="w-4 h-4 rounded border-border-dark"
							/>
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Guest
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Event/Session
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Quantity
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Status
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Expires
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Created
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.waitlistEntries as entry}
						{@const notifiedBadge = getNotifiedBadge(entry.notified)}
						{@const expired = isExpired(entry.expiresAt)}
						<tr class="hover:bg-dark-50 transition-colors {expired ? 'bg-red-50' : ''}">
							<td class="px-4 py-4">
								<input
									type="checkbox"
									checked={selectedEntries.has(entry.id)}
									onchange={() => toggleSelection(entry.id)}
									class="w-4 h-4 rounded border-border-dark"
								/>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
										<User size={18} class="text-dark-500" />
									</div>
									<div>
										<div class="font-medium text-dark-900">{entry.name}</div>
										<div class="text-sm text-dark-400 flex items-center gap-1">
											<Mail size={12} />
											{entry.email}
										</div>
										{#if entry.phone}
											<div class="text-sm text-dark-400 flex items-center gap-1">
												<Phone size={12} />
												{entry.phone}
											</div>
										{/if}
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="font-medium text-dark-900">{entry.session.eventTitle}</div>
									<div class="text-dark-400">{entry.session.title}</div>
									<div class="text-dark-400 text-xs mt-1">
										{formatDate(entry.session.startTime)}
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center gap-2 text-dark-900">
									<Ticket size={14} />
									<span class="font-medium">{entry.quantity}</span>
								</div>
							</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {notifiedBadge.class} rounded-full">
									{#if notifiedBadge.icon}
										<svelte:component this={notifiedBadge.icon} size={12} />
									{/if}
									{notifiedBadge.text}
								</span>
								{#if expired}
									<div class="text-xs text-red-600 mt-1">Expired</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-600">
									{formatDateTime(entry.expiresAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-600">
									{formatDateTime(entry.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									{#if entry.notified && entry.notifiedAt}
										<div class="text-xs text-dark-500" title="Notified at">
											{formatDateTime(entry.notifiedAt)}
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.waitlistEntries as entry}
				{@const notifiedBadge = getNotifiedBadge(entry.notified)}
				{@const expired = isExpired(entry.expiresAt)}
				<div class="bg-white rounded-lg border border-border-card p-4 {expired ? 'border-red-200' : ''}">
					<div class="flex items-start gap-3 mb-3">
						<input
							type="checkbox"
							checked={selectedEntries.has(entry.id)}
							onchange={() => toggleSelection(entry.id)}
							class="w-4 h-4 mt-1 rounded border-border-dark flex-shrink-0"
						/>
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-semibold text-dark-900 truncate">
									{entry.name}
								</h3>
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {notifiedBadge.class} rounded-full flex-shrink-0">
									{#if notifiedBadge.icon}
										<svelte:component this={notifiedBadge.icon} size={10} />
									{/if}
									{notifiedBadge.text}
								</span>
							</div>
							<p class="text-sm text-dark-400 truncate">{entry.email}</p>
							{#if entry.phone}
								<p class="text-sm text-dark-400 flex items-center gap-1">
									<Phone size={12} />
									{entry.phone}
								</p>
							{/if}
							{#if expired}
								<p class="text-sm text-red-600 mt-1">Expired</p>
							{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<div class="text-xs text-dark-400">Event</div>
							<div class="text-sm font-medium text-dark-900 truncate">{entry.session.eventTitle}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Tickets</div>
							<div class="text-sm font-medium text-dark-900">{entry.quantity}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Expires</div>
							<div class="text-sm text-dark-900">{formatDate(entry.expiresAt)}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Created</div>
							<div class="text-sm text-dark-900">{formatDate(entry.createdAt)}</div>
						</div>
					</div>

					{#if entry.notified && entry.notifiedAt}
						<div class="text-xs text-dark-500 mb-3">
							Notified: {formatDateTime(entry.notifiedAt)}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Cleanup Actions -->
	{#if data.waitlistEntries.length > 0}
		<div class="mt-6 bg-white rounded-lg border border-border-card p-4">
			<h3 class="text-sm font-semibold text-dark-900 mb-3">Cleanup Actions</h3>
			<form method="POST" action="?/deleteExpired" use:enhance={({ formData, action, cancel }) => {
					if (!confirm('Are you sure you want to delete all expired entries that have already been notified?')) {
						cancel();
					}
					return async ({ result, update }) => {
						if (result.type === 'success' && result.data) {
							form = { success: (result.data as { message: string }).message };
						} else if (result.type === 'failure' && result.data) {
							form = { error: (result.data as { error?: string }).error || 'Action failed' };
						}
						update();
					};
				}}>
				<button
					type="submit"
					class="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm inline-flex items-center gap-2"
				>
					<Trash2 size={16} />
					Delete Expired & Notified Entries
				</button>
			</form>
		</div>
	{/if}
</div>
