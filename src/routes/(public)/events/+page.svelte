<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import type { PageData } from "./$types";
    import { Grid2x2, LayoutList, ArrowDown, ArrowRight, Loader2 } from "lucide-svelte";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    const VIEW_MODE = {
        GRID: "grid",
        LIST: "list",
    } as const;

    let { data }: { data: PageData } = $props();
    let filters = $derived(data.categories || []);

    let viewMode: "grid" | "list" = $state(VIEW_MODE.GRID);

    // Pagination state
    let allEvents = $state(data.events);
    let currentPage = $state(1);
    let isLoading = $state(false);
    let hasMore = $state(data.pagination?.hasNextPage ?? false);
    let error = $state<string | null>(null);

    async function loadMoreEvents() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        error = null;

        try {
            const nextPage = currentPage + 1;
            const response = await fetch(`/api/events?page=${nextPage}&limit=6`);

            if (!response.ok) throw new Error('Failed to load more events');

            const result = await response.json();

            allEvents = [...allEvents, ...result.data];
            currentPage = nextPage;
            hasMore = result.pagination.hasNextPage;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load events';
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
        <h1 class="text-4xl font-normal">{$t("events.title")}</h1>
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
                    class="px-4 py-2 bg-dark-900 text-white rounded-full text-sm font-medium transition-colors"
                >
                    All
                </button>
                {#each filters as filter}
                    <button
                        class="px-4 py-2 border border-border-card rounded-full text-sm whitespace-nowrap transition-colors hover:border-dark-900"
                        style="border-color: {filter.color}; color: {filter.color}"
                    >
                        {filter.displayName}
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
            use:reveal={{ preset: "fade-in", delay: 100 }}
        >
            <div class="hidden md:flex items-center gap-4">
                <p class="text-sm">{$t("events.view")}</p>
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

    {#if allEvents.length === 0}
        <p class="text-gray-500">{$t("events.noEvents")}</p>
    {:else if viewMode === VIEW_MODE.GRID}
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6"
        >
            {#each allEvents as event, index}
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
            {#each allEvents as event, index}
                <a
                    href="/events/{event.slug}"
                    use:reveal={{
                        preset: "fade-up",
                        delay: Math.min(index * 60, 300),
                    }}
                    class="flex flex-col sm:flex-row gap-6 bg-white p-4 rounded-lg hover:shadow-md transition-shadow"
                >
                    {#if event.coverMedia}
                        <div
                            class="sm:w-64 sm:flex-shrink-0 aspect-video sm:aspect-auto overflow-hidden rounded"
                        >
                            {#if event.coverMedia.type === "image"}
                                <img
                                    src={event.coverMedia.url}
                                    alt={event.title}
                                    class="w-full h-full object-cover grayscale hover:scale-105 transition-transform"
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
                            class="sm:w-64 sm:flex-shrink-0 aspect-4/3 bg-gray-200 flex items-center justify-center rounded"
                        >
                            <span class="text-gray-400 text-4xl"></span>
                        </div>
                    {/if}
                    <div class="flex flex-col justify-between flex-1">
                        <div>
                            <h3 class="text-xl font-medium mb-2">
                                {event.title}
                            </h3>
                            <p class="text-dark-500 text-sm line-clamp-2 mb-4">
                                {event.location}
                            </p>
                            <p class="text-dark-400 text-sm line-clamp-3">
                                {event.description}
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
                onclick={loadMoreEvents}
                disabled={isLoading}
                class="flex items-center gap-3 text-dark-600 px-6 py-3 rounded-full border border-border-dark disabled:opacity-50"
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
