<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import type { PageData } from "./$types";
    import {
        Grid2x2,
        LayoutList,
        ArrowDown,
        ArrowRight,
        Loader2,
    } from "lucide-svelte";
    import { t, locale } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    const VIEW_MODE = {
        GRID: "grid",
        LIST: "list",
    } as const;

    let { data }: { data: PageData } = $props();
    let filters = $derived(data.categories || []);

    let viewMode: "grid" | "list" = $state(VIEW_MODE.GRID);
    let selectedCategoryId = $state<string | null>(null);

    // Helper function to get localized category display name
    function getCategoryDisplayName(
        category: (typeof filters)[number],
    ): string {
        return $locale === "en"
            ? category.displayNameEn
            : category.displayNameFr;
    }

    // Pagination state
    let allEvents = $state(data.events);
    let currentPage = $state(1);
    let isLoading = $state(false);
    let hasMore = $state(data.pagination?.hasNextPage ?? false);
    let error = $state<string | null>(null);

    // Filtered events based on selected category
    let filteredEvents = $derived(
        selectedCategoryId
            ? allEvents.filter((e) => e.categoryId === selectedCategoryId)
            : allEvents,
    );

    // Compute button class strings to avoid Safari iOS reactive state issues
    function getFilterButtonClass(isSelected: boolean): string {
        const base = "px-4 py-2 rounded-full text-sm font-medium transition-colors";
        if (isSelected) {
            return `${base} bg-dark-900 text-white`;
        }
        return `${base} bg-transparent text-dark-600 border border-dark-600 hover:border-dark-900 cursor-pointer`;
    }

    function getViewModeButtonClass(isActive: boolean): string {
        return `cursor-pointer p-1 ${isActive ? 'text-dark-900' : 'text-dark-300'}`;
    }

    async function loadMoreEvents() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        error = null;

        try {
            const nextPage = currentPage + 1;
            const response = await fetch(
                `/api/events?page=${nextPage}&limit=6&excludeSpotlight=true`,
            );

            if (!response.ok) throw new Error("Failed to load more events");

            const result = await response.json();

            allEvents = [...allEvents, ...result.data];
            currentPage = nextPage;
            hasMore = result.pagination.hasNextPage;
        } catch (err) {
            error =
                err instanceof Error ? err.message : "Failed to load events";
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>{$t("events.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32">
    <div class="mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <h1 class="text-4xl font-serif">{$t("events.title")}</h1>
        <p class="text-dark-400 max-w-2xl">
            {$t("events.description")}
        </p>
    </div>
    {#if filters.length > 1}
        <div
            class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-16"
            use:reveal={{ preset: "fade-in", delay: 100 }}
        >
            <div class="flex flex-wrap items-center gap-3">
                <button
                    onclick={() => (selectedCategoryId = null)}
                    class={getFilterButtonClass(selectedCategoryId === null)}
                >
                    {$t('events.filterAll')}
                </button>
                {#each filters as filter}
                    <button
                        onclick={() => (selectedCategoryId = filter.id)}
                        class={getFilterButtonClass(selectedCategoryId === filter.id)}
                    >
                        {getCategoryDisplayName(filter)}
                    </button>
                {/each}
            </div>
            <div
                class="hidden md:flex items-center gap-4 justify-start md:justify-end"
            >
                <p class="text-sm">{$t("events.view")}</p>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.GRID)}
                    class={getViewModeButtonClass(viewMode === VIEW_MODE.GRID)}
                >
                    <Grid2x2 />
                </button>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.LIST)}
                    class={getViewModeButtonClass(viewMode === VIEW_MODE.LIST)}
                >
                    <LayoutList />
                </button>
            </div>
        </div>
    {:else}
        <div
            class="flex justify-end mb-16"
            use:reveal={{ preset: "fade-in", delay: 100 }}
        >
            <div class="hidden md:flex items-center gap-4">
                <p class="text-sm">{$t("events.view")}</p>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.GRID)}
                    class={getViewModeButtonClass(viewMode === VIEW_MODE.GRID)}
                >
                    <Grid2x2 />
                </button>
                <button
                    type="button"
                    onclick={() => (viewMode = VIEW_MODE.LIST)}
                    class={getViewModeButtonClass(viewMode === VIEW_MODE.LIST)}
                >
                    <LayoutList />
                </button>
            </div>
        </div>
    {/if}

    {#if filteredEvents.length === 0}
        <p class="text-dark-400">
            {selectedCategoryId
                ? $t("events.noEventsInCategory")
                : $t("events.noEvents")}
        </p>
    {:else if viewMode === VIEW_MODE.GRID}
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6"
        >
            {#each filteredEvents as event, index}
                <div
                    use:reveal={{
                        preset: "fade-up",
                        delay: Math.min(index * 60, 300),
                    }}
                >
                    <EventCard {event} />
                </div>
            {/each}
        </div>
    {:else}
        <div class="flex flex-col gap-6">
            {#each filteredEvents as event, index}
                <a
                    href="/events/{event.slug}"
                    use:reveal={{
                        preset: "fade-up",
                        delay: Math.min(index * 60, 300),
                    }}
                    class="flex flex-col sm:flex-row gap-6 bg-white p-4 hover:shadow-md transition-shadow group"
                >
                    {#if event.coverMedia}
                        <div
                            class="sm:w-64 sm:flex-shrink-0 aspect-video sm:aspect-auto overflow-hidden rounded"
                        >
                            {#if event.coverMedia.type === "image"}
                                <img
                                    src={event.coverMedia.url}
                                    alt={event.titleEn}
                                    class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-[filter] duration-500"
                                />
                            {:else}
                                <video
                                    src={event.coverMedia.url}
                                    class="w-full h-full object-cover"
                                    muted
                                />
                            {/if}
                        </div>
                    {:else}
                        <div
                            class="sm:w-64 sm:flex-shrink-0 aspect-4/3 bg-dark-100 flex items-center justify-center rounded"
                        >
                            <span class="text-dark-300 text-4xl"></span>
                        </div>
                    {/if}
                    <div class="flex flex-col justify-between flex-1">
                        <div>
                            <h3 class="text-xl font-medium mb-2">
                                {event.titleEn}
                            </h3>
                            <p class="text-dark-500 text-sm line-clamp-2 mb-4">
                                {event.location}
                            </p>
                            <p class="text-dark-400 text-sm line-clamp-3">
                                {event.descriptionEn}
                            </p>
                        </div>
                        <div
                            class="w-full border border-border-card/20 mt-4"
                        ></div>
                        <div class="mt-4 flex items-center gap-4">
                            <span class="text-sm text-dark-600"
                                >{$t('events.viewDetails')}</span
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
                onclick={loadMoreEvents}
                disabled={isLoading}
                class="flex items-center gap-3 text-dark-600 px-6 py-3 rounded-none border border-border-dark disabled:opacity-50"
            >
                {#if isLoading}
                    <Loader2 size={16} class="animate-spin" />
                {:else}
                    <p>{$t("events.loadMore")}</p>
                    <ArrowDown size={16} />
                {/if}
            </button>
        </div>
    {/if}
</div>
