<script lang="ts">
    import TalentCard from "$lib/components/TalentCard.svelte";
    import type { PageData } from "./$types";
    import type { TalentWithMedia } from "$lib/types/talents";
    import { Grid2x2, LayoutList, ArrowDown, ArrowRight, Loader2 } from "lucide-svelte";
    import { t, locale } from 'svelte-i18n';
    import { reveal } from '$lib/actions/reveal';

    const VIEW_MODE = {
        GRID: "grid",
        LIST: "list",
    } as const;

    let { data }: { data: PageData } = $props();
    let filters = $derived(data.categories || []);

    let viewMode: "grid" | "list" = $state(VIEW_MODE.GRID);
    let selectedCategoryId = $state<string | null>(null);

    // Helper function to get localized category display name
    function getCategoryDisplayName(category: typeof filters[number]): string {
        return $locale === 'en' ? category.displayNameEn : category.displayNameFr;
    }

    // Pagination state
    let allTalents: TalentWithMedia[] = $state(data.talents as TalentWithMedia[]);
    let currentPage = $state(1);
    let isLoading = $state(false);
    let hasMore = $state(data.pagination?.hasNextPage ?? false);
    let error = $state<string | null>(null);

    // Filtered talents based on selected category
    let filteredTalents = $derived(
        selectedCategoryId
            ? allTalents.filter(t => t.categoryId === selectedCategoryId)
            : allTalents
    );

    async function loadMoreTalents() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        error = null;

        try {
            const nextPage = currentPage + 1;
            const response = await fetch(`/api/talents?page=${nextPage}&limit=6`);

            if (!response.ok) throw new Error('Failed to load more talents');

            const result = await response.json();

            allTalents = [...allTalents, ...result.data];
            currentPage = nextPage;
            hasMore = result.pagination.hasNextPage;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load talents';
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>{$t('talents.pageTitle')}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32">
    <div class="mb-16 grid gap-4" use:reveal={{ preset: 'fade-down' }}>
        <h1 class="text-4xl font-normal">{$t('talents.title')}</h1>
        <p class="text-dark-400 max-w-2xl">
            {$t('talents.description')}
        </p>
    </div>

    {#if filters.length > 1}
        <div
            class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-16"
            use:reveal={{ preset: 'fade-in', delay: 100 }}
        >
            <div class="flex flex-wrap items-center gap-3">
                <button
                    onclick={() => (selectedCategoryId = null)}
                    class="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                    class:bg-dark-900={selectedCategoryId === null}
                    class:text-white={selectedCategoryId === null}
                    class:bg-transparent={selectedCategoryId !== null}
                    class:text-dark-600={selectedCategoryId !== null}
                    class:border={selectedCategoryId !== null}
                    class:border-border-card={selectedCategoryId !== null}
                >
                    All
                </button>
                {#each filters as filter}
                    <button
                        onclick={() => (selectedCategoryId = filter.id)}
                        class="px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors"
                        class:bg-dark-900={selectedCategoryId === filter.id}
                        class:text-white={selectedCategoryId === filter.id}
                        class:bg-transparent={selectedCategoryId !== filter.id}
                        style:border-color={selectedCategoryId !== filter.id ? filter.color : undefined}
                        style:color={selectedCategoryId === filter.id ? undefined : filter.color}
                        class:border={selectedCategoryId !== filter.id}
                    >
                        {getCategoryDisplayName(filter)}
                    </button>
                {/each}
            </div>
            <div
                class="hidden md:flex items-center gap-4 justify-start md:justify-end"
            >
                <p class="text-sm">{$t('talents.view')}</p>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.GRID)}
                    class="cursor-pointer p-1"
                    class:text-dark-900={viewMode === VIEW_MODE.GRID}
                    class:text-dark-300={viewMode === VIEW_MODE.LIST}
                >
                    <Grid2x2 />
                </button>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.LIST)}
                    class="cursor-pointer p-1"
                    class:text-dark-900={viewMode === VIEW_MODE.LIST}
                    class:text-dark-300={viewMode === VIEW_MODE.GRID}
                >
                    <LayoutList />
                </button>
            </div>
        </div>
    {:else}
        <div
            class="flex justify-end mb-16"
            use:reveal={{ preset: 'fade-in', delay: 100 }}
        >
            <div class="hidden md:flex items-center gap-4">
                <p class="text-sm">{$t('talents.view')}</p>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.GRID)}
                    class="cursor-pointer p-1"
                    class:text-dark-900={viewMode === VIEW_MODE.GRID}
                    class:text-dark-300={viewMode === VIEW_MODE.LIST}
                >
                    <Grid2x2 />
                </button>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.LIST)}
                    class="cursor-pointer p-1"
                    class:text-dark-900={viewMode === VIEW_MODE.LIST}
                    class:text-dark-300={viewMode === VIEW_MODE.GRID}
                >
                    <LayoutList />
                </button>
            </div>
        </div>
    {/if}

    {#if filteredTalents.length === 0}
        <p class="text-gray-500">
            {selectedCategoryId ? 'No talents found in this category.' : $t('talents.noTalents')}
        </p>
    {:else if viewMode === VIEW_MODE.GRID}
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6"
        >
            {#each filteredTalents as talent, index}
                <div
                    use:reveal={{
                        preset: "fade-up",
                        delay: Math.min(index * 60, 300),
                    }}
                >
                    <TalentCard {talent} />
                </div>
            {/each}
        </div>
    {:else}
        <div class="flex flex-col gap-6">
            {#each filteredTalents as talent, index}
                <a
                    href="/talents/{talent.id}"
                    use:reveal={{
                        preset: "fade-up",
                        delay: Math.min(index * 60, 300),
                    }}
                    class="flex flex-col sm:flex-row gap-6 bg-white p-4 rounded-lg hover:shadow-md transition-shadow"
                >
                    {#if talent.profileMedia}
                        <div
                            class="sm:w-48 sm:flex-shrink-0 aspect-[3/4] sm:aspect-auto overflow-hidden rounded"
                        >
                            <img
                                src={talent.profileMedia.url}
                                alt="{talent.firstName} {talent.lastName}"
                                class="w-full h-full object-cover grayscale hover:scale-105 transition-transform"
                            />
                        </div>
                    {:else}
                        <div
                            class="sm:w-48 sm:flex-shrink-0 aspect-[3/4] bg-gray-200 flex items-center justify-center rounded"
                        >
                            <span class="text-gray-400 text-4xl"></span>
                        </div>
                    {/if}
                    <div class="flex flex-col justify-between flex-1">
                        <div>
                            <h3 class="text-xl font-medium mb-2">
                                {talent.firstName} {talent.lastName}
                            </h3>
                            <p class="text-dark-500 text-sm line-clamp-2 mb-4">
                                {talent.role}
                            </p>
                            <p class="text-dark-400 text-sm line-clamp-3">
                                {talent.bio}
                            </p>
                            <p class="text-dark-600 text-sm mt-2">
                                {talent.city}, {talent.country}
                            </p>
                        </div>
                        <div
                            class="w-full border border-border-card/20 mt-4"
                        ></div>
                        <div class="mt-4 flex items-center gap-4">
                            <span class="text-sm text-dark-600"
                                >View Details</span
                            >
                            <ArrowRight size={16} />
                        </div>
                    </div>
                </a>
            {/each}
        </div>
    {/if}

    {#if error}
        <div class="flex justify-center items-center mt-8">
            <p class="text-red-500">{error}</p>
        </div>
    {/if}

    {#if hasMore}
        <div class="flex justify-center items-center mt-16">
            <button
                onclick={loadMoreTalents}
                disabled={isLoading}
                class="flex items-center gap-3 text-dark-600 px-6 py-3 rounded-full border border-border-dark disabled:opacity-50"
            >
                {#if isLoading}
                    <Loader2 size={16} class="animate-spin" />
                {:else}
                    <p>{$t('talents.loadMore')}</p>
                    <ArrowDown size={16} />
                {/if}
            </button>
        </div>
    {/if}
</div>
