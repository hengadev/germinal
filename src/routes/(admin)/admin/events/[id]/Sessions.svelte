<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Plus,
		Calendar,
		Clock,
		Users,
		Ticket,
		Eye,
		EyeOff,
		Edit,
		Trash2,
		X,
		CheckCircle2,
		AlertCircle
	} from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import Drawer from '$lib/components/ui/Drawer.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { formatCurrency } from '$lib/utils/currency';

	interface Props {
		data: {
			event: any;
			sessions: any[];
		};
		form?: any;
	}

	let { data, form }: Props = $props();

	// Detect if we're on mobile
	let isMobile = $state(false);

	// Setup resize listener with proper cleanup
	$effect(() => {
		if (!browser) return;

		// Set initial value
		isMobile = window.innerWidth < 768;

		const handleResize = () => {
			isMobile = window.innerWidth < 768;
		};

		window.addEventListener('resize', handleResize);

		// Cleanup function - automatically called when effect is destroyed
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Session type
	type Session = (typeof data.sessions)[number];

	// Dialog states
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	// Currently selected session for edit/delete
	let selectedSession: Session | null = $state(null);

	// Form state for create
	let createTitle = $state('');
	let createDescription = $state('');
	let createStartTime = $state('');
	let createEndTime = $state('');
	let createTotalCapacity = $state(1);
	let createPriceDecimal = $state(0);
	let createCurrency = $state('EUR');
	let createPublished = $state(false);
	let createAllowWaitlist = $state(false);

	// Form state for edit
	let editTitle = $state('');
	let editDescription = $state('');
	let editStartTime = $state('');
	let editEndTime = $state('');
	let editTotalCapacity = $state(1);
	let editPriceDecimal = $state(0);
	let editCurrency = $state('EUR');
	let editPublished = $state(false);
	let editAllowWaitlist = $state(false);

	// Reset form after successful action
	$effect(() => {
		if (form?.success) {
			createDialogOpen = false;
			editDialogOpen = false;
			deleteDialogOpen = false;
			resetCreateForm();
		}
	});

	function resetCreateForm() {
		createTitle = '';
		createDescription = '';
		createStartTime = '';
		createEndTime = '';
		createTotalCapacity = 1;
		createPriceDecimal = 0;
		createCurrency = 'EUR';
		createPublished = false;
		createAllowWaitlist = false;
	}

	function centsToDecimal(cents: number): number {
		return cents / 100;
	}

	function decimalToCents(decimal: number): number {
		return Math.round(decimal * 100);
	}

	function formatDateForInput(date: Date | string): string {
		const d = new Date(date);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const hours = String(d.getHours()).padStart(2, '0');
		const minutes = String(d.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	function openCreateDialog() {
		resetCreateForm();
		createDialogOpen = true;
	}

	function openEditDialog(session: Session) {
		selectedSession = session;
		editTitle = session.title;
		editDescription = session.description || '';
		editStartTime = formatDateForInput(session.startTime);
		editEndTime = formatDateForInput(session.endTime);
		editTotalCapacity = session.totalCapacity;
		editPriceDecimal = centsToDecimal(session.priceAmount);
		editCurrency = session.currency;
		editPublished = session.published;
		editAllowWaitlist = session.allowWaitlist;
		editDialogOpen = true;
	}

	function openDeleteDialog(session: Session) {
		selectedSession = session;
		deleteDialogOpen = true;
	}

	function formatDateTime(date: Date | string): string {
		return new Date(date).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatTime(date: Date | string): string {
		return new Date(date).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Snippet for form fields
	type InputSnippet = Snippet<[fieldName: string]>;
</script>

{#snippet createInput(fieldName: string)}
	{#if fieldName === "title"}
		<input
			id="createTitle"
			name="title"
			type="text"
			bind:value={createTitle}
			required
			placeholder="Opening Night"
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "description"}
		<textarea
			id="createDescription"
			name="description"
			bind:value={createDescription}
			rows="3"
			placeholder="Optional description"
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
		></textarea>
	{:else if fieldName === "startTime"}
		<input
			id="createStartTime"
			name="startTime"
			type="datetime-local"
			bind:value={createStartTime}
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "endTime"}
		<input
			id="createEndTime"
			name="endTime"
			type="datetime-local"
			bind:value={createEndTime}
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "totalCapacity"}
		<input
			id="createTotalCapacity"
			name="totalCapacity"
			type="number"
			bind:value={createTotalCapacity}
			min="1"
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "priceAmount"}
		<input
			id="createPriceAmount"
			name="priceAmount"
			type="number"
			step="0.01"
			min="0"
			bind:value={createPriceDecimal}
			placeholder="25.00"
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
		<p class="text-xs text-dark-500 mt-1">Enter price in {createCurrency} (e.g., 25.00)</p>
	{:else if fieldName === "currency"}
		<select
			id="createCurrency"
			name="currency"
			bind:value={createCurrency}
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		>
			<option value="EUR">EUR</option>
			<option value="USD">USD</option>
			<option value="GBP">GBP</option>
			<option value="CHF">CHF</option>
		</select>
	{/if}
{/snippet}

{#snippet editInput(fieldName: string)}
	{#if fieldName === "title"}
		<input
			id="editTitle"
			name="title"
			type="text"
			bind:value={editTitle}
			required
			placeholder="Opening Night"
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "description"}
		<textarea
			id="editDescription"
			name="description"
			bind:value={editDescription}
			rows="3"
			placeholder="Optional description"
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
		></textarea>
	{:else if fieldName === "startTime"}
		<input
			id="editStartTime"
			name="startTime"
			type="datetime-local"
			bind:value={editStartTime}
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "endTime"}
		<input
			id="editEndTime"
			name="endTime"
			type="datetime-local"
			bind:value={editEndTime}
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "totalCapacity"}
		<input
			id="editTotalCapacity"
			name="totalCapacity"
			type="number"
			bind:value={editTotalCapacity}
			min="1"
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
	{:else if fieldName === "priceAmount"}
		<input
			id="editPriceAmount"
			name="priceAmount"
			type="number"
			step="0.01"
			min="0"
			bind:value={editPriceDecimal}
			placeholder="25.00"
			required
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		/>
		<p class="text-xs text-dark-500 mt-1">Enter price in {editCurrency} (e.g., 25.00)</p>
	{:else if fieldName === "currency"}
		<select
			id="editCurrency"
			name="currency"
			bind:value={editCurrency}
			class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
		>
			<option value="EUR">EUR</option>
			<option value="USD">USD</option>
			<option value="GBP">GBP</option>
			<option value="CHF">CHF</option>
		</select>
	{/if}
{/snippet}

{#snippet field(
	name: string,
	label: string,
	inputSnippet: InputSnippet,
	value: string,
	error: string | null,
)}
	<label for={name} class="block text-sm font-medium text-dark-700 mb-1">
		{label}
	</label>
	<div class="relative w-full">
		{@render inputSnippet(name)}
		{#if error}
			<p class="text-xs text-red-600 mt-1">{error}</p>
		{/if}
	</div>
{/snippet}

<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
	<button
		onclick={openCreateDialog}
		class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
	>
		<Plus size={18} />
		<span>New Session</span>
	</button>
</div>

{#if data.sessions.length === 0}
	<div class="bg-white rounded-lg border border-border-card p-12 text-center">
		<Calendar size={48} class="mx-auto mb-4 text-dark-300" />
		<h3 class="text-xl font-semibold text-dark-900 mb-2">
			No sessions yet
		</h3>
		<p class="text-dark-400 mb-6">
			Create sessions for this event to start selling tickets
		</p>
		<button
			onclick={openCreateDialog}
			class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
		>
			<Plus size={18} />
			<span>Create Session</span>
		</button>
	</div>
{:else}
	<!-- Table view for desktop -->
	<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
		<table class="w-full">
			<thead class="bg-dark-50 border-b border-border-card">
				<tr>
					<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Session
					</th>
					<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Date & Time
					</th>
					<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Price
					</th>
					<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Capacity
					</th>
					<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Status
					</th>
					<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
						Actions
					</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border-card">
				{#each data.sessions as session}
					<tr class="hover:bg-dark-50 transition-colors">
						<td class="px-6 py-4">
							<div class="font-medium text-dark-900">
								{session.title}
							</div>
							{#if session.reservationCount > 0}
								<div class="text-sm text-dark-400">
									{session.reservationCount} reservation{session.reservationCount > 1 ? 's' : ''}
								</div>
							{/if}
						</td>
						<td class="px-6 py-4">
							<div class="text-sm">
								<div class="font-medium text-dark-900">
									{formatDateTime(session.startTime)}
								</div>
								<div class="text-dark-400">
									{formatTime(session.startTime)} - {formatTime(session.endTime)}
								</div>
							</div>
						</td>
						<td class="px-6 py-4">
							<div class="text-sm font-medium text-dark-900">
								{formatCurrency(session.priceAmount, session.currency)}
							</div>
						</td>
						<td class="px-6 py-4">
							<div class="flex items-center gap-2 text-sm">
								<Users size={16} class="text-dark-400" />
								<span class="text-dark-900">{session.availableCapacity}</span>
								<span class="text-dark-400">/ {session.totalCapacity}</span>
							</div>
						</td>
						<td class="px-6 py-4">
							{#if session.published}
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full">
									<Eye size={14} />
									Published
								</span>
							{:else}
								<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-dark-100 text-dark-600 rounded-full">
									<EyeOff size={14} />
									Draft
								</span>
							{/if}
						</td>
						<td class="px-6 py-4">
							<div class="flex items-center justify-end gap-2">
								<button
									onclick={() => openEditDialog(session)}
									class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
									title="Edit"
								>
									<Edit size={18} />
								</button>
								<button
									onclick={() => openDeleteDialog(session)}
									class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
									title="Delete"
								>
									<Trash2 size={18} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Card view for mobile -->
	<div class="lg:hidden space-y-4">
		{#each data.sessions as session}
			<div class="bg-white rounded-lg border border-border-card p-4">
				<div class="flex items-start justify-between mb-3">
					<div class="flex-1">
						<h3 class="font-semibold text-dark-900">
							{session.title}
						</h3>
						<p class="text-sm text-dark-400">
							{formatDateTime(session.startTime)}
						</p>
					</div>
					{#if session.published}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full flex-shrink-0">
							<Eye size={12} />
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-dark-100 text-dark-600 rounded-full flex-shrink-0">
							<EyeOff size={12} />
						</span>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-3 mb-3">
					<div>
						<div class="text-xs text-dark-400">Price</div>
						<div class="font-medium text-dark-900">
							{formatCurrency(session.priceAmount, session.currency)}
						</div>
					</div>
					<div>
						<div class="text-xs text-dark-400">Capacity</div>
						<div class="flex items-center gap-1 font-medium text-dark-900">
							<Users size={14} class="text-dark-400" />
							{session.availableCapacity} / {session.totalCapacity}
						</div>
					</div>
				</div>

				<div class="flex items-center justify-end gap-2 pt-3 border-t border-border-card">
					<button
						onclick={() => openEditDialog(session)}
						class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
					>
						<Edit size={16} />
						Edit
					</button>
					<button
						onclick={() => openDeleteDialog(session)}
						class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
					>
						<Trash2 size={16} />
						Delete
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Create Session Dialog/Drawer -->
{#if isMobile}
	<Drawer bind:isOpen={createDialogOpen}>
		<div class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-xl font-semibold tracking-tight">
					Create New Session
				</h2>
				<button
					type="button"
					onclick={() => (createDialogOpen = false)}
					class="p-2 hover:bg-dark-100 rounded-md transition-colors"
				>
					<X class="text-dark-900 size-5" />
				</button>
			</div>
			<p class="text-dark-400 text-sm">
				Fill in the session details
			</p>
		</div>

		<form
			method="POST"
			action="?/createSession"
			use:enhance
			class="grid gap-4 pt-4"
		>
			<div class="grid grid-cols-1 gap-4 w-full">
				{@render field("title", "Title", createInput, createTitle, null)}
				{@render field("description", "Description", createInput, createDescription, null)}
				{@render field("startTime", "Start Time", createInput, createStartTime, null)}
				{@render field("endTime", "End Time", createInput, createEndTime, null)}
				{@render field("totalCapacity", "Total Capacity", createInput, createTotalCapacity, null)}
				{@render field("priceAmount", "Price", createInput, createPriceDecimal, null)}
				<input type="hidden" name="priceAmount" value={decimalToCents(createPriceDecimal)} />
				{@render field("currency", "Currency", createInput, createCurrency, null)}

				<div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
					<input
						id="createPublished"
						name="published"
						type="checkbox"
						bind:checked={createPublished}
						class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label
							for="createPublished"
							class="block text-sm font-medium text-dark-900 cursor-pointer"
						>
							Published
						</label>
						<p class="text-xs text-dark-400">
							Visible to users
						</p>
					</div>
				</div>

				<div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
					<input
						id="createAllowWaitlist"
						name="allowWaitlist"
						type="checkbox"
						bind:checked={createAllowWaitlist}
						class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label
							for="createAllowWaitlist"
							class="block text-sm font-medium text-dark-900 cursor-pointer"
						>
							Allow Waitlist
						</label>
						<p class="text-xs text-dark-400">
							Users can join waitlist when sold out
						</p>
					</div>
				</div>
			</div>
			<div class="flex w-full justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (createDialogOpen = false)}
					class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
				>
					Create Session
				</button>
			</div>
		</form>
	</Drawer>
{:else}
	<Modal
		bind:isOpen={createDialogOpen}
		title="Create New Session"
		description="Fill in the session details"
	>
		<form
			method="POST"
			action="?/createSession"
			use:enhance
			class="grid gap-4"
		>
			<div class="grid grid-cols-2 gap-4 w-full">
				<div class="col-span-2">
					{@render field("title", "Title", createInput, createTitle, null)}
				</div>
				<div class="col-span-2">
					{@render field("description", "Description", createInput, createDescription, null)}
				</div>
				{@render field("startTime", "Start Time", createInput, createStartTime, null)}
				{@render field("endTime", "End Time", createInput, createEndTime, null)}
				{@render field("totalCapacity", "Total Capacity", createInput, createTotalCapacity, null)}
				{@render field("priceAmount", "Price", createInput, createPriceDecimal, null)}
				<input type="hidden" name="priceAmount" value={decimalToCents(createPriceDecimal)} />
				{@render field("currency", "Currency", createInput, createCurrency, null)}
			</div>

			<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
				<input
					id="createPublished"
					name="published"
					type="checkbox"
					bind:checked={createPublished}
					class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
				/>
				<div>
					<label
						for="createPublished"
						class="block text-sm font-medium text-dark-900 cursor-pointer"
					>
						Published
					</label>
					<p class="text-xs text-dark-400">
						Visible to users
					</p>
				</div>
			</div>

			<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
				<input
					id="createAllowWaitlist"
					name="allowWaitlist"
					type="checkbox"
					bind:checked={createAllowWaitlist}
					class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
				/>
				<div>
					<label
						for="createAllowWaitlist"
						class="block text-sm font-medium text-dark-900 cursor-pointer"
					>
						Allow Waitlist
					</label>
					<p class="text-xs text-dark-400">
						Users can join waitlist when sold out
					</p>
				</div>
			</div>

			<div class="flex w-full justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (createDialogOpen = false)}
					class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
				>
					Create Session
				</button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Edit Session Dialog/Drawer -->
{#if isMobile}
	<Drawer bind:isOpen={editDialogOpen}>
		<div class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-xl font-semibold tracking-tight">Edit Session</h2>
				<button
					type="button"
					onclick={() => (editDialogOpen = false)}
					class="p-2 hover:bg-dark-100 rounded-md transition-colors"
				>
					<X class="text-dark-900 size-5" />
				</button>
			</div>
			<p class="text-dark-400 text-sm">Update the session details</p>
		</div>

		<form
			method="POST"
			action="?/updateSession"
			use:enhance
			class="grid gap-4 pt-4"
		>
			<input type="hidden" name="id" value={selectedSession?.id} />

			<div class="grid grid-cols-1 gap-4 w-full">
				{@render field("title", "Title", editInput, editTitle, null)}
				{@render field("description", "Description", editInput, editDescription, null)}
				{@render field("startTime", "Start Time", editInput, editStartTime, null)}
				{@render field("endTime", "End Time", editInput, editEndTime, null)}
				{@render field("totalCapacity", "Total Capacity", editInput, editTotalCapacity, null)}
				{@render field("priceAmount", "Price", editInput, editPriceDecimal, null)}
				<input type="hidden" name="priceAmount" value={decimalToCents(editPriceDecimal)} />
				{@render field("currency", "Currency", editInput, editCurrency, null)}

				<div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
					<input
						id="editPublished"
						name="published"
						type="checkbox"
						bind:checked={editPublished}
						class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label
							for="editPublished"
							class="block text-sm font-medium text-dark-900 cursor-pointer"
						>
							Published
						</label>
						<p class="text-xs text-dark-400">
							Visible to users
						</p>
					</div>
				</div>

				<div class="flex items-center gap-3 p-3 bg-dark-50 rounded-lg">
					<input
						id="editAllowWaitlist"
						name="allowWaitlist"
						type="checkbox"
						bind:checked={editAllowWaitlist}
						class="w-4 h-4 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label
							for="editAllowWaitlist"
							class="block text-sm font-medium text-dark-900 cursor-pointer"
						>
							Allow Waitlist
						</label>
						<p class="text-xs text-dark-400">
							Users can join waitlist when sold out
						</p>
					</div>
				</div>
			</div>
			<div class="flex w-full justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (editDialogOpen = false)}
					class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
				>
					Save Changes
				</button>
			</div>
		</form>
	</Drawer>
{:else}
	<Modal
		bind:isOpen={editDialogOpen}
		title="Edit Session"
		description="Update the session details"
	>
		<form
			method="POST"
			action="?/updateSession"
			use:enhance
			class="grid gap-4"
		>
			<input type="hidden" name="id" value={selectedSession?.id} />

			<div class="grid grid-cols-2 gap-4 w-full">
				<div class="col-span-2">
					{@render field("title", "Title", editInput, editTitle, null)}
				</div>
				<div class="col-span-2">
					{@render field("description", "Description", editInput, editDescription, null)}
				</div>
				{@render field("startTime", "Start Time", editInput, editStartTime, null)}
				{@render field("endTime", "End Time", editInput, editEndTime, null)}
				{@render field("totalCapacity", "Total Capacity", editInput, editTotalCapacity, null)}
				{@render field("priceAmount", "Price", editInput, editPriceDecimal, null)}
				<input type="hidden" name="priceAmount" value={decimalToCents(editPriceDecimal)} />
				{@render field("currency", "Currency", editInput, editCurrency, null)}
			</div>

			<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
				<input
					id="editPublished"
					name="published"
					type="checkbox"
					bind:checked={editPublished}
					class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
				/>
				<div>
					<label
						for="editPublished"
						class="block text-sm font-medium text-dark-900 cursor-pointer"
					>
						Published
					</label>
					<p class="text-xs text-dark-400">
						Visible to users
					</p>
				</div>
			</div>

			<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
				<input
					id="editAllowWaitlist"
					name="allowWaitlist"
					type="checkbox"
					bind:checked={editAllowWaitlist}
					class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
				/>
				<div>
					<label
						for="editAllowWaitlist"
						class="block text-sm font-medium text-dark-900 cursor-pointer"
					>
						Allow Waitlist
					</label>
					<p class="text-xs text-dark-400">
						Users can join waitlist when sold out
					</p>
				</div>
			</div>

			<div class="flex w-full justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (editDialogOpen = false)}
					class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-6 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
				>
					Save Changes
				</button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Delete Session Dialog/Drawer -->
{#if isMobile}
	<Drawer bind:isOpen={deleteDialogOpen}>
		<div class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-xl font-semibold tracking-tight">
					Delete Session
				</h2>
				<button
					type="button"
					onclick={() => (deleteDialogOpen = false)}
					class="p-2 hover:bg-dark-100 rounded-md transition-colors"
				>
					<X class="text-dark-900 size-5" />
				</button>
			</div>
			<p class="text-dark-400 text-sm">
				Are you sure you want to delete "{selectedSession?.title}"?
			</p>
		</div>

		<div class="pt-4">
			{#if selectedSession?.reservationCount > 0}
				<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-3">
					<AlertCircle size={20} class="text-yellow-600 flex-shrink-0 mt-0.5" />
					<div class="text-sm text-yellow-900">
						<p class="font-medium mb-1">Warning</p>
						<p class="text-yellow-700">
							This session has {selectedSession.reservationCount} reservation{selectedSession.reservationCount > 1 ? 's' : ''}. You cannot delete sessions with existing reservations.
						</p>
					</div>
				</div>
			{/if}

			<form method="POST" action="?/deleteSession" use:enhance>
				<input type="hidden" name="id" value={selectedSession?.id} />

				<div class="flex w-full justify-end gap-3">
					<button
						type="button"
						onclick={() => (deleteDialogOpen = false)}
						class="px-4 py-2 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={selectedSession?.reservationCount > 0}
						class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:bg-dark-300 disabled:cursor-not-allowed"
					>
						Delete
					</button>
				</div>
			</form>
		</div>
	</Drawer>
{:else}
	<Modal
		bind:isOpen={deleteDialogOpen}
		title="Delete Session"
	>
		{#if selectedSession?.reservationCount > 0}
			<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-3">
				<AlertCircle size={20} class="text-yellow-600 flex-shrink-0 mt-0.5" />
				<div class="text-sm text-yellow-900">
					<p class="font-medium mb-1">Warning</p>
					<p class="text-yellow-700">
						This session has {selectedSession.reservationCount} reservation{selectedSession.reservationCount > 1 ? 's' : ''}. You cannot delete sessions with existing reservations.
					</p>
				</div>
			</div>
		{/if}

		<p class="text-dark-600 mb-6">
			Are you sure you want to delete <strong>"{selectedSession?.title}"</strong>? This action cannot be undone.
		</p>

		<form method="POST" action="?/deleteSession" use:enhance>
			<input type="hidden" name="id" value={selectedSession?.id} />

			<div class="flex w-full justify-end gap-3">
				<button
					type="button"
					onclick={() => (deleteDialogOpen = false)}
					class="px-6 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={selectedSession?.reservationCount > 0}
					class="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:bg-dark-300 disabled:cursor-not-allowed"
				>
					Delete
				</button>
			</div>
		</form>
	</Modal>
{/if}
