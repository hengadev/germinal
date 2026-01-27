<script lang="ts">
	import { Mail, CheckCircle2, Clock, XCircle, AlertCircle, Search, RotateCcw, Trash2, Eye, Filter, Calendar, Send } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	// Filter state
	let statusFilter = $state(data.filters.status);
	let typeFilter = $state(data.filters.type);

	// Modal state for viewing email content
	let viewingEmail = $state<typeof data.emails[0] | null>(null);

	// Form state
	let form = $state<{
		success?: string;
		error?: string;
	} | undefined>();

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'sent':
				return { text: 'Sent', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'failed':
				return { text: 'Failed', class: 'bg-red-50 text-red-700', icon: XCircle };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', icon: null };
		}
	}

	// Get type badge
	function getTypeBadge(type: string) {
		switch (type) {
			case 'ticket_confirmation':
				return { text: 'Ticket Confirmation', class: 'bg-blue-50 text-blue-700', icon: Mail };
			case 'contact_notification':
				return { text: 'Contact Notification', class: 'bg-purple-50 text-purple-700', icon: Send };
			case 'event_reminder':
				return { text: 'Event Reminder', class: 'bg-orange-50 text-orange-700', icon: Calendar };
			default:
				return { text: type, class: 'bg-dark-100 text-dark-600', icon: Mail };
		}
	}

	// Build filter URL
	let filterUrl = $derived(() => {
		const params = new URLSearchParams();
		if (statusFilter !== 'all') params.set('status', statusFilter);
		if (typeFilter !== 'all') params.set('type', typeFilter);
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

	// Navigate with filters
	function applyFilters() {
		window.location.href = filterUrl();
	}

	// View email content
	function viewEmail(email: typeof data.emails[0]) {
		viewingEmail = email;
	}

	// Close modal
	function closeModal() {
		viewingEmail = null;
	}
</script>

<svelte:head>
	<title>Email Queue | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="mb-8">
		<h1 class="text-3xl lg:text-4xl font-bold mb-2">Email Queue</h1>
		<p class="text-dark-400">Monitor and manage email delivery</p>
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
			<!-- Status Filter -->
			<div class="flex-1">
				<label for="statusFilter" class="block text-sm font-medium text-dark-700 mb-1">Filter by Status</label>
				<select
					id="statusFilter"
					bind:value={statusFilter}
					class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
				>
					<option value="all">All Statuses</option>
					<option value="pending">Pending</option>
					<option value="sent">Sent</option>
					<option value="failed">Failed</option>
				</select>
			</div>

			<!-- Type Filter -->
			<div class="flex-1">
				<label for="typeFilter" class="block text-sm font-medium text-dark-700 mb-1">Filter by Type</label>
				<select
					id="typeFilter"
					bind:value={typeFilter}
					class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
				>
					<option value="all">All Types</option>
					<option value="ticket_confirmation">Ticket Confirmation</option>
					<option value="contact_notification">Contact Notification</option>
					<option value="event_reminder">Event Reminder</option>
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
			Showing {data.emails.length} emails
		</div>
	</div>

	{#if data.emails.length === 0}
		<div class="bg-white rounded-lg border border-border-card p-12 text-center">
			<Mail size={48} class="mx-auto mb-4 text-dark-300" />
			<h3 class="text-xl font-semibold text-dark-900 mb-2">
				No emails found
			</h3>
			<p class="text-dark-400">
				{#if statusFilter !== 'all' || typeFilter !== 'all'}
					Try adjusting your filters
				{:else}
					No emails in the queue
				{/if}
			</p>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-dark-50 border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Type
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Recipient
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Subject
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Status
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Attempts
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Created
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Sent
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.emails as email}
						{@const statusBadge = getStatusBadge(email.status)}
						{@const typeBadge = getTypeBadge(email.type)}
						<tr class="hover:bg-dark-50 transition-colors">
							<td class="px-6 py-4">
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {typeBadge.class} rounded-full">
									{typeBadge.text}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-900">{email.recipient}</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-900 truncate max-w-xs" title={email.subject}>
									{email.subject}
								</div>
							</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium {statusBadge.class} rounded-full">
									{#if statusBadge.icon}
										<svelte:component this={statusBadge.icon} size={12} />
									{/if}
									{statusBadge.text}
								</span>
								{#if email.lastError}
									<div class="text-xs text-red-600 mt-1 truncate max-w-xs" title={email.lastError}>
										{email.lastError}
									</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-900">
									{email.attempts} / {email.maxAttempts}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-600">
									{formatDateTime(email.createdAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-dark-600">
									{formatDateTime(email.sentAt)}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<button
										onclick={() => viewEmail(email)}
										class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
										title="View Content"
									>
										<Eye size={18} />
									</button>
									{#if email.status === 'failed'}
										<form method="POST" action="?/retry" use:enhance={() => ({
											async onSubmit({ action, cancel, formData }) {
												return async ({ result, update }) => {
													if (result.type === 'success') {
														form = { success: result.data.message };
													} else {
														form = { error: result.data?.error || 'Action failed' };
													}
													update();
												};
											}
										})}>
											<input type="hidden" name="emailId" value={email.id} />
											<button
												type="submit"
												class="p-2 text-dark-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
												title="Retry"
											>
												<RotateCcw size={18} />
											</button>
										</form>
									{/if}
									<form method="POST" action="?/delete" use:enhance={() => ({
										async onSubmit({ action, cancel, formData }) {
											if (!confirm('Are you sure you want to delete this email?')) {
												cancel();
											}
											return async ({ result, update }) => {
												if (result.type === 'success') {
													form = { success: result.data.message };
												} else {
													form = { error: result.data?.error || 'Action failed' };
												}
												update();
											};
										}
									})}>
										<input type="hidden" name="emailId" value={email.id} />
										<button
											type="submit"
											class="p-2 text-dark-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
											title="Delete"
										>
											<Trash2 size={18} />
										</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.emails as email}
				{@const statusBadge = getStatusBadge(email.status)}
				{@const typeBadge = getTypeBadge(email.type)}
				<div class="bg-white rounded-lg border border-border-card p-4">
					<div class="flex items-start justify-between mb-3">
						<div>
							<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {typeBadge.class} rounded-full">
								{typeBadge.text}
							</span>
						</div>
						<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium {statusBadge.class} rounded-full">
							{#if statusBadge.icon}
								<svelte:component this={statusBadge.icon} size={10} />
							{/if}
							{statusBadge.text}
						</span>
					</div>

					<div class="space-y-2 mb-3">
						<div>
							<div class="text-xs text-dark-400">Recipient</div>
							<div class="text-sm font-medium text-dark-900">{email.recipient}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Subject</div>
							<div class="text-sm text-dark-900 truncate">{email.subject}</div>
						</div>
						<div>
							<div class="text-xs text-dark-400">Attempts</div>
							<div class="text-sm text-dark-900">{email.attempts} / {email.maxAttempts}</div>
						</div>
						{#if email.lastError}
							<div>
								<div class="text-xs text-dark-400">Error</div>
								<div class="text-sm text-red-600 truncate">{email.lastError}</div>
							</div>
						{/if}
					</div>

					<div class="flex items-center justify-between pt-3 border-t border-border-card">
						<div class="text-xs text-dark-400">
							{formatDateTime(email.createdAt)}
						</div>
						<div class="flex items-center gap-2">
							<button
								onclick={() => viewEmail(email)}
								class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
								title="View Content"
							>
								<Eye size={16} />
							</button>
							{#if email.status === 'failed'}
								<form method="POST" action="?/retry" use:enhance={() => ({
									async onSubmit({ action, cancel, formData }) {
										return async ({ result, update }) => {
											if (result.type === 'success') {
												form = { success: result.data.message };
											} else {
												form = { error: result.data?.error || 'Action failed' };
											}
											update();
										};
									}
								})}>
									<input type="hidden" name="emailId" value={email.id} />
									<button
										type="submit"
										class="p-2 text-dark-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
										title="Retry"
									>
										<RotateCcw size={16} />
									</button>
								</form>
							{/if}
							<form method="POST" action="?/delete" use:enhance={() => ({
								async onSubmit({ action, cancel, formData }) {
									if (!confirm('Are you sure you want to delete this email?')) {
										cancel();
									}
									return async ({ result, update }) => {
										if (result.type === 'success') {
											form = { success: result.data.message };
										} else {
											form = { error: result.data?.error || 'Action failed' };
										}
										update();
									};
								}
							})}>
								<input type="hidden" name="emailId" value={email.id} />
								<button
									type="submit"
									class="p-2 text-dark-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
									title="Delete"
								>
									<Trash2 size={16} />
								</button>
							</form>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Bulk Actions -->
	{#if data.emails.length > 0}
		<div class="mt-6 bg-white rounded-lg border border-border-card p-4">
			<h3 class="text-sm font-semibold text-dark-900 mb-3">Bulk Actions</h3>
			<form method="POST" action="?/deleteOld" use:enhance={() => ({
				async onSubmit({ action, cancel, formData }) {
					if (!confirm('Are you sure you want to delete all sent emails older than 30 days?')) {
						cancel();
					}
					return async ({ result, update }) => {
						if (result.type === 'success') {
							form = { success: result.data.message };
						} else {
							form = { error: result.data?.error || 'Action failed' };
						}
						update();
					};
				}
			})}>
				<button
					type="submit"
					class="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm inline-flex items-center gap-2"
				>
					<Trash2 size={16} />
					Delete Old Sent Emails (30+ days)
				</button>
			</form>
		</div>
	{/if}
</div>

<!-- Email Content Modal -->
{#if viewingEmail}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onclick={closeModal}>
		<div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between p-6 border-b border-border-card">
				<h2 class="text-xl font-semibold text-dark-900">Email Content</h2>
				<button
					onclick={closeModal}
					class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
				>
					<XCircle size={24} />
				</button>
			</div>
			<div class="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
				<div class="space-y-4">
					<div>
						<div class="text-sm font-medium text-dark-700">Type</div>
						<div class="text-dark-900">{viewingEmail.type}</div>
					</div>
					<div>
						<div class="text-sm font-medium text-dark-700">Recipient</div>
						<div class="text-dark-900">{viewingEmail.recipient}</div>
					</div>
					<div>
						<div class="text-sm font-medium text-dark-700">Subject</div>
						<div class="text-dark-900">{viewingEmail.subject}</div>
					</div>
					<div>
						<div class="text-sm font-medium text-dark-700">Status</div>
						<div class="text-dark-900 capitalize">{viewingEmail.status}</div>
					</div>
					{#if viewingEmail.lastError}
						<div>
							<div class="text-sm font-medium text-dark-700">Last Error</div>
							<div class="text-red-600">{viewingEmail.lastError}</div>
						</div>
					{/if}
					<div>
						<div class="text-sm font-medium text-dark-700 mb-2">HTML Preview</div>
						<div class="bg-dark-50 rounded-lg p-4 border border-border-card">
							<iframe class="w-full h-64 border-0" srcdoc={viewingEmail.htmlBody}></iframe>
						</div>
					</div>
					<div>
						<div class="text-sm font-medium text-dark-700 mb-2">Text Content</div>
						<pre class="bg-dark-900 text-dark-100 rounded-lg p-4 overflow-x-auto text-sm">{viewingEmail.textBody}</pre>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
