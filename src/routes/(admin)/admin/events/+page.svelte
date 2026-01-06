<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Plus,
		Calendar,
		MapPin,
		Eye,
		EyeOff,
		Edit,
		Trash2,
		X,
		FileText
	} from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import Drawer from '$lib/components/ui/Drawer.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	let { data, form }: { data: PageData; form: ActionData & { success?: string } } = $props();

	// Detect if we're on mobile
	let isMobile = $state(false);

	if (browser) {
		isMobile = window.innerWidth < 768;
		window.addEventListener('resize', () => {
			isMobile = window.innerWidth < 768;
		});
	}

	// Event type
	type Event = (typeof data.events)[number];

	// Dialog states
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	// Currently selected event for edit/delete
	let selectedEvent: Event | null = $state(null);

	// Form state for create
	let createTitle = $state('');
	let createSlug = $state('');
	let createDescription = $state('');
	let createStartDate = $state('');
	let createEndDate = $state('');
	let createLocation = $state('');
	let createPublished = $state(false);

	// Auto-generate slug from title
	$effect(() => {
		if (createTitle) {
			createSlug = createTitle
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '');
		}
	});

	// Form state for edit
	let editTitle = $state('');
	let editSlug = $state('');
	let editDescription = $state('');
	let editStartDate = $state('');
	let editEndDate = $state('');
	let editLocation = $state('');
	let editPublished = $state(false);

	// Auto-generate slug from title for edit
	$effect(() => {
		if (editTitle) {
			editSlug = editTitle
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '');
		}
	});

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
		createSlug = '';
		createDescription = '';
		createStartDate = '';
		createEndDate = '';
		createLocation = '';
		createPublished = false;
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

	function openEditDialog(event: Event) {
		selectedEvent = event;
		editTitle = event.title;
		editSlug = event.slug;
		editDescription = event.description;
		editStartDate = formatDateForInput(event.startDate);
		editEndDate = formatDateForInput(event.endDate);
		editLocation = event.location;
		editPublished = event.published;
		editDialogOpen = true;
	}

	function openDeleteDialog(event: Event) {
		selectedEvent = event;
		deleteDialogOpen = true;
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateTime(date: Date | string): string {
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Snippet for form fields
	type InputSnippet = Snippet<[fieldName: string]>;
</script>

{#snippet createInput(fieldName: string)}
		{#if fieldName === 'title'}
			<input
				id="createTitle"
				name="title"
				type="text"
				bind:value={createTitle}
				required
				placeholder="Summer Music Festival"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'slug'}
			<input
				id="createSlug"
				name="slug"
				type="text"
				bind:value={createSlug}
				required
				pattern="^[a-z0-9-]+$"
				placeholder="summer-music-festival"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'description'}
			<textarea
				id="createDescription"
				name="description"
				bind:value={createDescription}
				required
				rows="4"
				placeholder="Describe your event..."
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
			></textarea>
		{:else if fieldName === 'startDate'}
			<input
				id="createStartDate"
				name="startDate"
				type="datetime-local"
				bind:value={createStartDate}
				required
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'endDate'}
			<input
				id="createEndDate"
				name="endDate"
				type="datetime-local"
				bind:value={createEndDate}
				required
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'location'}
			<input
				id="createLocation"
				name="location"
				type="text"
				bind:value={createLocation}
				required
				placeholder="123 Main St, City, Country"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{/if}
	{/snippet}
	//#endregion

	//#region editInput
	{#snippet editInput(fieldName: string)}
		{#if fieldName === 'title'}
			<input
				id="editTitle"
				name="title"
				type="text"
				bind:value={editTitle}
				required
				placeholder="Summer Music Festival"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'slug'}
			<input
				id="editSlug"
				name="slug"
				type="text"
				bind:value={editSlug}
				required
				pattern="^[a-z0-9-]+$"
				placeholder="summer-music-festival"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'description'}
			<textarea
				id="editDescription"
				name="description"
				bind:value={editDescription}
				required
				rows="4"
				placeholder="Describe your event..."
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
			></textarea>
		{:else if fieldName === 'startDate'}
			<input
				id="editStartDate"
				name="startDate"
				type="datetime-local"
				bind:value={editStartDate}
				required
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'endDate'}
			<input
				id="editEndDate"
				name="endDate"
				type="datetime-local"
				bind:value={editEndDate}
				required
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{:else if fieldName === 'location'}
			<input
				id="editLocation"
				name="location"
				type="text"
				bind:value={editLocation}
				required
				placeholder="123 Main St, City, Country"
				class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
			/>
		{/if}
	{/snippet}
	//#endregion

	//#region field
	{#snippet field(name: string, label: string, inputSnippet: InputSnippet)}
		<label for={name} class="block text-sm font-medium text-dark-700 mb-1">
			{label}
		</label>
		<div class="relative w-full">
			{@render inputSnippet(name)}
		</div>
	{/snippet}
	//#endregion
<svelte:head>
    <title>Events | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
    >
        <div>
            <h1 class="text-3xl lg:text-4xl font-bold mb-2">Events</h1>
            <p class="text-dark-400">Manage your events and exhibitions</p>
        </div>
        <button
            onclick={openCreateDialog}
            class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
        >
            <Plus size={18} />
            <span>New Event</span>
        </button>
    </div>

    <!-- Success/Error messages -->
    {#if form?.success}
        <div
            class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.success}</p>
        </div>
    {/if}

    {#if form?.error}
        <div
            class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg"
        >
            <p class="text-sm font-medium">{form.error}</p>
        </div>
    {/if}

    {#if data.events.length === 0}
        <div
            class="bg-white rounded-lg border border-border-card p-12 text-center"
        >
            <Calendar size={48} class="mx-auto mb-4 text-dark-300" />
            <h3 class="text-xl font-semibold text-dark-900 mb-2">
                No events yet
            </h3>
            <p class="text-dark-400 mb-6">
                Create your first event to get started
            </p>
            <button
                onclick={openCreateDialog}
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
            >
                <Plus size={18} />
                <span>Create Event</span>
            </button>
        </div>
    {:else}
        <!-- Table view for desktop -->
        <div
            class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block"
        >
            <table class="w-full">
                <thead class="bg-dark-50 border-b border-border-card">
                    <tr>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Event
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Date
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Location
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Status
                        </th>
                        <th
                            class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-card">
                    {#each data.events as event}
                        <tr class="hover:bg-dark-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-4">
                                    {#if event.coverMedia?.url}
                                        <img
                                            src={event.coverMedia.url}
                                            alt={event.title}
                                            class="w-16 h-16 object-cover rounded-lg"
                                        />
                                    {:else}
                                        <div
                                            class="w-16 h-16 bg-dark-100 rounded-lg flex items-center justify-center"
                                        >
                                            <Calendar
                                                size={24}
                                                class="text-dark-300"
                                            />
                                        </div>
                                    {/if}
                                    <div>
                                        <div class="font-medium text-dark-900">
                                            {event.title}
                                        </div>
                                        <div class="text-sm text-dark-400">
                                            {event.slug}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm">
                                    <div class="font-medium text-dark-900">
                                        {formatDate(event.startDate)}
                                    </div>
                                    <div class="text-dark-400">
                                        {formatDateTime(event.startDate)} - {formatDateTime(
                                            event.endDate,
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div
                                    class="flex items-center gap-2 text-sm text-dark-600"
                                >
                                    <MapPin size={16} />
                                    <span class="truncate max-w-[200px]"
                                        >{event.location}</span
                                    >
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                {#if event.published}
                                    <span
                                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full"
                                    >
                                        <Eye size={14} />
                                        Published
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-dark-100 text-dark-600 rounded-full"
                                    >
                                        <EyeOff size={14} />
                                        Draft
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4">
                                <div
                                    class="flex items-center justify-end gap-2"
                                >
                                    <button
                                        onclick={() => openEditDialog(event)}
                                        class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button
                                        onclick={() => openDeleteDialog(event)}
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
            {#each data.events as event}
                <div class="bg-white rounded-lg border border-border-card p-4">
                    <div class="flex gap-4 mb-4">
                        {#if event.coverMedia?.url}
                            <img
                                src={event.coverMedia.url}
                                alt={event.title}
                                class="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                            />
                        {:else}
                            <div
                                class="w-20 h-20 bg-dark-100 rounded-lg flex items-center justify-center flex-shrink-0"
                            >
                                <Calendar size={24} class="text-dark-300" />
                            </div>
                        {/if}
                        <div class="flex-1 min-w-0">
                            <div
                                class="flex items-start justify-between gap-2 mb-1"
                            >
                                <h3
                                    class="font-semibold text-dark-900 truncate"
                                >
                                    {event.title}
                                </h3>
                                {#if event.published}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full flex-shrink-0"
                                    >
                                        <Eye size={12} />
                                    </span>
                                {:else}
                                    <span
                                        class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-dark-100 text-dark-600 rounded-full flex-shrink-0"
                                    >
                                        <EyeOff size={12} />
                                    </span>
                                {/if}
                            </div>
                            <div class="text-sm text-dark-400 mb-1">
                                {formatDate(event.startDate)}
                            </div>
                            <div
                                class="flex items-center gap-1 text-sm text-dark-600"
                            >
                                <MapPin size={14} />
                                <span class="truncate">{event.location}</span>
                            </div>
                        </div>
                    </div>
                    <div
                        class="flex items-center justify-end gap-2 pt-3 border-t border-border-card"
                    >
                        <button
                            onclick={() => openEditDialog(event)}
                            class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                        >
                            <Edit size={16} />
                            Edit
                        </button>
                        <button
                            onclick={() => openDeleteDialog(event)}
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
</div>

<!-- Create Event Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={createDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Create New Event
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
                Fill in the details to create a new event
            </p>
        </div>

        <form
            method="POST"
            action="?/createEvent"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field("createTitle", "Title", createInput)}
                {@render field("createSlug", "Slug", createInput)}
                {@render field("createDescription", "Description", createInput)}
                {@render field("createStartDate", "Start Date", createInput)}
                {@render field("createEndDate", "End Date", createInput)}
                {@render field("createLocation", "Location", createInput)}

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
                            Publish immediately
                        </label>
                        <p class="text-xs text-dark-400">
                            Uncheck to save as draft
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
                    Create Event
                </button>
            </div>
        </form>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={createDialogOpen}
        title="Create New Event"
        description="Fill in the details to create a new event"
    >
        <form
            method="POST"
            action="?/createEvent"
            use:enhance
            class="grid gap-4"
        >
            <div class="grid grid-cols-2 gap-4 w-full">
                <div class="col-span-2">
                    {@render field("createTitle", "Title", createInput)}
                </div>
                <div class="col-span-2">
                    {@render field("createSlug", "Slug", createInput)}
                </div>
                <div class="col-span-2">
                    {@render field(
                        "createDescription",
                        "Description",
                        createInput,
                    )}
                </div>
                {@render field("createStartDate", "Start Date", createInput)}
                {@render field("createEndDate", "End Date", createInput)}
                <div class="col-span-2">
                    {@render field("createLocation", "Location", createInput)}
                </div>
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
                        Publish immediately
                    </label>
                    <p class="text-xs text-dark-400">
                        Uncheck to save as draft
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
                    Create Event
                </button>
            </div>
        </form>
    </Modal>
{/if}

<!-- Edit Event Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={editDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">Edit Event</h2>
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">Update the event details</p>
        </div>

        <form
            method="POST"
            action="?/updateEvent"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <input type="hidden" name="id" value={selectedEvent?.id} />

            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field("editTitle", "Title", editInput)}
                {@render field("editSlug", "Slug", editInput)}
                {@render field("editDescription", "Description", editInput)}
                {@render field("editStartDate", "Start Date", editInput)}
                {@render field("editEndDate", "End Date", editInput)}
                {@render field("editLocation", "Location", editInput)}

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
                            Uncheck to save as draft
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
        title="Edit Event"
        description="Update the event details"
    >
        <form
            method="POST"
            action="?/updateEvent"
            use:enhance
            class="grid gap-4"
        >
            <input type="hidden" name="id" value={selectedEvent?.id} />

            <div class="grid grid-cols-2 gap-4 w-full">
                <div class="col-span-2">
                    {@render field("editTitle", "Title", editInput)}
                </div>
                <div class="col-span-2">
                    {@render field("editSlug", "Slug", editInput)}
                </div>
                <div class="col-span-2">
                    {@render field("editDescription", "Description", editInput)}
                </div>
                {@render field("editStartDate", "Start Date", editInput)}
                {@render field("editEndDate", "End Date", editInput)}
                <div class="col-span-2">
                    {@render field("editLocation", "Location", editInput)}
                </div>
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
                        Uncheck to save as draft
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

<!-- Delete Event Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={deleteDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Delete Event
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
                Are you sure you want to delete "{selectedEvent?.title}"? This
                action cannot be undone.
            </p>
        </div>

        <div class="pt-4">
            <form method="POST" action="?/deleteEvent" use:enhance>
                <input type="hidden" name="id" value={selectedEvent?.id} />

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
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
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
        title="Delete Event"
        description="Are you sure you want to delete "{selectedEvent?.title}"? This action cannot be undone."
    >
        <form method="POST" action="?/deleteEvent" use:enhance class="mt-6">
            <input type="hidden" name="id" value={selectedEvent?.id} />

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
                    class="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                    Delete
                </button>
            </div>
        </form>
    </Modal>
{/if}
