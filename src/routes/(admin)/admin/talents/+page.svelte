<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Plus,
        User,
        Briefcase,
        Eye,
        EyeOff,
        Edit,
        Trash2,
        X,
        FileText,
        Link as LinkIcon,
    } from "lucide-svelte";
    import type { PageData, ActionData } from "./$types";
    import type { Snippet } from "svelte";
    import { browser } from "$app/environment";
    import Drawer from "$lib/components/ui/Drawer.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";

    let {
        data,
        form,
    }: { data: PageData; form: ActionData & { success?: string } } = $props();

    // Detect if we're on mobile
    let isMobile = $state(false);

    if (browser) {
        isMobile = window.innerWidth < 768;
        window.addEventListener("resize", () => {
            isMobile = window.innerWidth < 768;
        });
    }

    // Talent type
    type Talent = (typeof data.talents)[number];

    // Dialog states
    let createDialogOpen = $state(false);
    let editDialogOpen = $state(false);
    let deleteDialogOpen = $state(false);

    // Currently selected talent for edit/delete
    let selectedTalent: Talent | null = $state(null);

    // Form state for create
    let createFirstName = $state("");
    let createLastName = $state("");
    let createRole = $state("");
    let createBio = $state("");
    let createInstagram = $state("");
    let createLinkedin = $state("");
    let createTwitter = $state("");
    let createWebsite = $state("");
    let createPublished = $state(false);

    // Form state for edit
    let editFirstName = $state("");
    let editLastName = $state("");
    let editRole = $state("");
    let editBio = $state("");
    let editInstagram = $state("");
    let editLinkedin = $state("");
    let editTwitter = $state("");
    let editWebsite = $state("");
    let editPublished = $state(false);

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
        createFirstName = "";
        createLastName = "";
        createRole = "";
        createBio = "";
        createInstagram = "";
        createLinkedin = "";
        createTwitter = "";
        createWebsite = "";
        createPublished = false;
    }

    function openCreateDialog() {
        resetCreateForm();
        createDialogOpen = true;
    }

    function openEditDialog(talent: Talent) {
        selectedTalent = talent;
        editFirstName = talent.firstName;
        editLastName = talent.lastName;
        editRole = talent.role;
        editBio = talent.bio;
        editPublished = talent.published;

        // Parse social links
        const socialLinks = talent.socialLinks
            ? JSON.parse(talent.socialLinks)
            : {};
        editInstagram = socialLinks.instagram || "";
        editLinkedin = socialLinks.linkedin || "";
        editTwitter = socialLinks.twitter || "";
        editWebsite = socialLinks.website || "";

        editDialogOpen = true;
    }

    function openDeleteDialog(talent: Talent) {
        selectedTalent = talent;
        deleteDialogOpen = true;
    }

    function formatDate(date: Date | string): string {
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    // Snippet for form fields
    type InputSnippet = Snippet<[fieldName: string]>;
</script>

{#snippet createInput(fieldName: string)}
    {#if fieldName === "firstName"}
        <input
            id="createFirstName"
            name="firstName"
            type="text"
            bind:value={createFirstName}
            required
            placeholder="Sarah"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "lastName"}
        <input
            id="createLastName"
            name="lastName"
            type="text"
            bind:value={createLastName}
            required
            placeholder="Johnson"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "role"}
        <input
            id="createRole"
            name="role"
            type="text"
            bind:value={createRole}
            required
            placeholder="Lead Vocalist & Songwriter"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "bio"}
        <textarea
            id="createBio"
            name="bio"
            bind:value={createBio}
            required
            rows="4"
            placeholder="Tell us about this talent..."
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
        ></textarea>
    {:else if fieldName === "instagram"}
        <input
            id="createInstagram"
            name="instagram"
            type="url"
            bind:value={createInstagram}
            placeholder="https://instagram.com/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "linkedin"}
        <input
            id="createLinkedin"
            name="linkedin"
            type="url"
            bind:value={createLinkedin}
            placeholder="https://linkedin.com/in/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "twitter"}
        <input
            id="createTwitter"
            name="twitter"
            type="url"
            bind:value={createTwitter}
            placeholder="https://twitter.com/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "website"}
        <input
            id="createWebsite"
            name="website"
            type="url"
            bind:value={createWebsite}
            placeholder="https://example.com"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {/if}
{/snippet}

{#snippet editInput(fieldName: string)}
    {#if fieldName === "firstName"}
        <input
            id="editFirstName"
            name="firstName"
            type="text"
            bind:value={editFirstName}
            required
            placeholder="Sarah"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "lastName"}
        <input
            id="editLastName"
            name="lastName"
            type="text"
            bind:value={editLastName}
            required
            placeholder="Johnson"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "role"}
        <input
            id="editRole"
            name="role"
            type="text"
            bind:value={editRole}
            required
            placeholder="Lead Vocalist & Songwriter"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "bio"}
        <textarea
            id="editBio"
            name="bio"
            bind:value={editBio}
            required
            rows="4"
            placeholder="Tell us about this talent..."
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm resize-none"
        ></textarea>
    {:else if fieldName === "instagram"}
        <input
            id="editInstagram"
            name="instagram"
            type="url"
            bind:value={editInstagram}
            placeholder="https://instagram.com/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "linkedin"}
        <input
            id="editLinkedin"
            name="linkedin"
            type="url"
            bind:value={editLinkedin}
            placeholder="https://linkedin.com/in/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "twitter"}
        <input
            id="editTwitter"
            name="twitter"
            type="url"
            bind:value={editTwitter}
            placeholder="https://twitter.com/username"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
    {:else if fieldName === "website"}
        <input
            id="editWebsite"
            name="website"
            type="url"
            bind:value={editWebsite}
            placeholder="https://example.com"
            class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
        />
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

<svelte:head>
    <title>Talents | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
    >
        <div>
            <h1 class="text-3xl lg:text-4xl font-bold mb-2">Talents</h1>
            <p class="text-dark-400">Manage your talent collection</p>
        </div>
        <button
            onclick={openCreateDialog}
            class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
        >
            <Plus size={18} />
            <span>New Talent</span>
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

    {#if data.talents.length === 0}
        <div
            class="bg-white rounded-lg border border-border-card p-12 text-center"
        >
            <User size={48} class="mx-auto mb-4 text-dark-300" />
            <h3 class="text-xl font-semibold text-dark-900 mb-2">
                No talents yet
            </h3>
            <p class="text-dark-400 mb-6">
                Add your first talent to get started
            </p>
            <button
                onclick={openCreateDialog}
                class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
            >
                <Plus size={18} />
                <span>Add Talent</span>
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
                            Talent
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Role
                        </th>
                        <th
                            class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider"
                        >
                            Bio
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
                    {#each data.talents as talent}
                        <tr class="hover:bg-dark-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-4">
                                    {#if talent.profileMedia?.url}
                                        <img
                                            src={talent.profileMedia.url}
                                            alt="{talent.firstName} {talent.lastName}"
                                            class="w-14 h-14 object-cover rounded-full"
                                        />
                                    {:else}
                                        <div
                                            class="w-14 h-14 bg-dark-100 rounded-full flex items-center justify-center"
                                        >
                                            <User
                                                size={24}
                                                class="text-dark-300"
                                            />
                                        </div>
                                    {/if}
                                    <div>
                                        <div class="font-medium text-dark-900">
                                            {talent.firstName}
                                            {talent.lastName}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <div
                                    class="flex items-center gap-2 text-sm text-dark-600"
                                >
                                    <Briefcase size={16} />
                                    <span class="truncate max-w-[200px]"
                                        >{talent.role}</span
                                    >
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <p
                                    class="text-sm text-dark-500 line-clamp-2 max-w-[300px]"
                                >
                                    {talent.bio}
                                </p>
                            </td>
                            <td class="px-6 py-4">
                                {#if talent.published}
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
                                        onclick={() => openEditDialog(talent)}
                                        class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button
                                        onclick={() => openDeleteDialog(talent)}
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
            {#each data.talents as talent}
                <div class="bg-white rounded-lg border border-border-card p-4">
                    <div class="flex gap-4 mb-4">
                        {#if talent.profileMedia?.url}
                            <img
                                src={talent.profileMedia.url}
                                alt="{talent.firstName} {talent.lastName}"
                                class="w-16 h-16 object-cover rounded-full flex-shrink-0"
                            />
                        {:else}
                            <div
                                class="w-16 h-16 bg-dark-100 rounded-full flex items-center justify-center flex-shrink-0"
                            >
                                <User size={24} class="text-dark-300" />
                            </div>
                        {/if}
                        <div class="flex-1 min-w-0">
                            <div
                                class="flex items-start justify-between gap-2 mb-1"
                            >
                                <h3 class="font-semibold text-dark-900">
                                    {talent.firstName}
                                    {talent.lastName}
                                </h3>
                                {#if talent.published}
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
                            <div
                                class="flex items-center gap-1 text-sm text-dark-600"
                            >
                                <Briefcase size={14} />
                                <span class="truncate">{talent.role}</span>
                            </div>
                        </div>
                    </div>
                    <p class="text-sm text-dark-500 line-clamp-2 mb-4">
                        {talent.bio}
                    </p>
                    <div
                        class="flex items-center justify-end gap-2 pt-3 border-t border-border-card"
                    >
                        <button
                            onclick={() => openEditDialog(talent)}
                            class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
                        >
                            <Edit size={16} />
                            Edit
                        </button>
                        <button
                            onclick={() => openDeleteDialog(talent)}
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

<!-- Create Talent Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={createDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Add New Talent
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
                Fill in the details to add a new talent
            </p>
        </div>

        <form
            method="POST"
            action="?/createTalent"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field(
                    "firstName",
                    "First Name",
                    createInput,
                    createFirstName,
                    null,
                )}
                {@render field(
                    "lastName",
                    "Last Name",
                    createInput,
                    createLastName,
                    null,
                )}
                {@render field("role", "Role", createInput, createRole, null)}
                {@render field("bio", "Bio", createInput, createBio, null)}

                <div class="space-y-3 pt-2">
                    <h3 class="text-sm font-medium text-dark-700">
                        Social Links (Optional)
                    </h3>
                    {@render field(
                        "instagram",
                        "Instagram",
                        createInput,
                        createInstagram,
                        null,
                    )}
                    {@render field(
                        "linkedin",
                        "LinkedIn",
                        createInput,
                        createLinkedin,
                        null,
                    )}
                    {@render field(
                        "twitter",
                        "Twitter",
                        createInput,
                        createTwitter,
                        null,
                    )}
                    {@render field(
                        "website",
                        "Website",
                        createInput,
                        createWebsite,
                        null,
                    )}
                </div>

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
                    Add Talent
                </button>
            </div>
        </form>
    </Drawer>
{:else}
    <Modal
        bind:isOpen={createDialogOpen}
        title="Add New Talent"
        description="Fill in the details to add a new talent"
    >
        <form
            method="POST"
            action="?/createTalent"
            use:enhance
            class="grid gap-4"
        >
            <div class="grid grid-cols-2 gap-4 w-full">
                {@render field(
                    "firstName",
                    "First Name",
                    createInput,
                    createFirstName,
                    null,
                )}
                {@render field(
                    "lastName",
                    "Last Name",
                    createInput,
                    createLastName,
                    null,
                )}
            </div>
            {@render field("role", "Role", createInput, createRole, null)}
            {@render field("bio", "Bio", createInput, createBio, null)}

            <div class="grid grid-cols-2 gap-4 pt-2">
                <div class="col-span-2">
                    <h3 class="text-sm font-medium text-dark-700 mb-3">
                        Social Links (Optional)
                    </h3>
                </div>
                {@render field(
                    "instagram",
                    "Instagram",
                    createInput,
                    createInstagram,
                    null,
                )}
                {@render field(
                    "linkedin",
                    "LinkedIn",
                    createInput,
                    createLinkedin,
                    null,
                )}
                {@render field(
                    "twitter",
                    "Twitter",
                    createInput,
                    createTwitter,
                    null,
                )}
                {@render field(
                    "website",
                    "Website",
                    createInput,
                    createWebsite,
                    null,
                )}
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
                    Add Talent
                </button>
            </div>
        </form>
    </Modal>
{/if}

<!-- Edit Talent Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={editDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Edit Talent
                </h2>
                <button
                    type="button"
                    onclick={() => (editDialogOpen = false)}
                    class="p-2 hover:bg-dark-100 rounded-md transition-colors"
                >
                    <X class="text-dark-900 size-5" />
                </button>
            </div>
            <p class="text-dark-400 text-sm">Update the talent details</p>
        </div>

        <form
            method="POST"
            action="?/updateTalent"
            use:enhance
            class="grid gap-4 pt-4"
        >
            <input type="hidden" name="id" value={selectedTalent?.id} />

            <div class="grid grid-cols-1 gap-4 w-full">
                {@render field(
                    "firstName",
                    "First Name",
                    editInput,
                    editFirstName,
                    null,
                )}
                {@render field(
                    "lastName",
                    "Last Name",
                    editInput,
                    editLastName,
                    null,
                )}
                {@render field("role", "Role", editInput, editRole, null)}
                {@render field("bio", "Bio", editInput, editBio, null)}

                <div class="space-y-3 pt-2">
                    <h3 class="text-sm font-medium text-dark-700">
                        Social Links (Optional)
                    </h3>
                    {@render field(
                        "instagram",
                        "Instagram",
                        editInput,
                        editInstagram,
                        null,
                    )}
                    {@render field(
                        "linkedin",
                        "LinkedIn",
                        editInput,
                        editLinkedin,
                        null,
                    )}
                    {@render field(
                        "twitter",
                        "Twitter",
                        editInput,
                        editTwitter,
                        null,
                    )}
                    {@render field(
                        "website",
                        "Website",
                        editInput,
                        editWebsite,
                        null,
                    )}
                </div>

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
        title="Edit Talent"
        description="Update the talent details"
    >
        <form
            method="POST"
            action="?/updateTalent"
            use:enhance
            class="grid gap-4"
        >
            <input type="hidden" name="id" value={selectedTalent?.id} />

            <div class="grid grid-cols-2 gap-4 w-full">
                {@render field(
                    "firstName",
                    "First Name",
                    editInput,
                    editFirstName,
                    null,
                )}
                {@render field(
                    "lastName",
                    "Last Name",
                    editInput,
                    editLastName,
                    null,
                )}
            </div>
            {@render field("role", "Role", editInput, editRole, null)}
            {@render field("bio", "Bio", editInput, editBio, null)}

            <div class="grid grid-cols-2 gap-4 pt-2">
                <div class="col-span-2">
                    <h3 class="text-sm font-medium text-dark-700 mb-3">
                        Social Links (Optional)
                    </h3>
                </div>
                {@render field(
                    "instagram",
                    "Instagram",
                    editInput,
                    editInstagram,
                    null,
                )}
                {@render field(
                    "linkedin",
                    "LinkedIn",
                    editInput,
                    editLinkedin,
                    null,
                )}
                {@render field(
                    "twitter",
                    "Twitter",
                    editInput,
                    editTwitter,
                    null,
                )}
                {@render field(
                    "website",
                    "Website",
                    editInput,
                    editWebsite,
                    null,
                )}
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

<!-- Delete Talent Dialog/Drawer -->
{#if isMobile}
    <Drawer bind:isOpen={deleteDialogOpen}>
        <div
            class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10"
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-semibold tracking-tight">
                    Delete Talent
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
                Are you sure you want to delete "<span class="font-medium"
                    >{selectedTalent?.firstName}</span
                >
                {selectedTalent?.lastName}"? This action cannot be undone.
            </p>
        </div>

        <div class="pt-4">
            <form method="POST" action="?/deleteTalent" use:enhance>
                <input type="hidden" name="id" value={selectedTalent?.id} />

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
        title="Delete Talent"
        description="Are you sure you want to delete '{selectedTalent?.firstName} {selectedTalent?.lastName}'? This action cannot be undone."
    >
        <form method="POST" action="?/deleteTalent" use:enhance>
            <input type="hidden" name="id" value={selectedTalent?.id} />

            <div class="flex w-full justify-end gap-3 mt-6">
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
