<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import type { PageData } from "./$types";
    import {
        Grid2x2,
        LayoutList,
        ArrowDown,
        ArrowRight,
        Loader2,
        Search,
        X,
    } from "lucide-svelte";
    import { t, locale } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";

    const VIEW_MODE = {
        GRID: "grid",
        LIST: "list",
    } as const;

    const SEARCH_DEBOUNCE_MS = 400;

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

    // Pagination state — resynced from `data` whenever a new search navigation loads
    let allEvents = $state(data.events);
    let currentPage = $state(1);
    let isLoading = $state(false);
    let hasMore = $state(data.pagination?.hasNextPage ?? false);
    let error = $state<string | null>(null);

    // `requestedQuery` tracks the last query we've already asked the server for
    // (via goto), separately from `data.searchQuery`, which only updates once
    // that navigation resolves. Comparing against it (rather than data.searchQuery)
    // avoids re-triggering a navigation we already have in flight.
    let searchInput = $state(data.searchQuery ?? "");
    let requestedQuery = $state(data.searchQuery ?? "");
    let isSearchPending = $state(false);
    let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
        allEvents = data.events;
        currentPage = 1;
        hasMore = data.pagination?.hasNextPage ?? false;
        error = null;

        // Keep local search state in sync with the URL for navigations we didn't
        // initiate ourselves (browser back/forward, a shared link with `?q=`).
        const loadedQuery = data.searchQuery ?? "";
        if (loadedQuery !== requestedQuery) {
            requestedQuery = loadedQuery;
            searchInput = loadedQuery;
        }
    });

    // Filtered events based on selected category
    let filteredEvents = $derived(
        selectedCategoryId
            ? allEvents.filter((e) => e.categoryId === selectedCategoryId)
            : allEvents,
    );

    function navigateSearch(query: string) {
        const trimmed = query.trim();
        requestedQuery = trimmed;

        const params = new URLSearchParams(page.url.searchParams);
        if (trimmed) {
            params.set("q", trimmed);
        } else {
            params.delete("q");
        }
        const queryString = params.toString();
        goto(`${page.url.pathname}${queryString ? `?${queryString}` : ""}`, {
            keepFocus: true,
            noScroll: true,
            replaceState: true,
        }).finally(() => {
            isSearchPending = false;
        });
    }

    // Debounce typing into a navigation wired to the backend's existing `q`
    // keyword-search query param — no new backend search logic needed.
    $effect(() => {
        const value = searchInput;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

        if (value.trim() === requestedQuery) {
            return;
        }

        isSearchPending = true;
        searchDebounceTimer = setTimeout(
            () => navigateSearch(value),
            SEARCH_DEBOUNCE_MS,
        );

        return () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        };
    });

    function clearSearch() {
        searchInput = "";
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        if (requestedQuery !== "") {
            isSearchPending = true;
            navigateSearch("");
        }
    }

    // Compute button class strings to avoid Safari iOS reactive state issues
    function getFilterButtonClass(isSelected: boolean): string {
        const base = "px-4 py-2 rounded-full text-sm font-medium transition-colors";
        if (isSelected) {
            return `${base} bg-foreground text-white`;
        }
        return `${base} bg-transparent text-muted-foreground border border-foreground-alt hover:border-foreground cursor-pointer`;
    }

    function getViewModeButtonClass(isActive: boolean): string {
        return `cursor-pointer p-1 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`;
    }

    async function loadMoreEvents() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        error = null;

        try {
            const nextPage = currentPage + 1;
            const params = new URLSearchParams({
                page: String(nextPage),
                limit: "6",
                excludeSpotlight: "true",
            });
            if (data.searchQuery) params.set("q", data.searchQuery);

            const response = await fetch(`/api/events?${params.toString()}`);

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
        <p class="text-muted-foreground max-w-2xl">
            {$t("events.description")}
        </p>
    </div>
    <div
        class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-16"
        use:reveal={{ preset: "fade-in", delay: 100 }}
    >
        {#if filters.length > 1}
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
        {/if}

        <div
            class="flex flex-col sm:flex-row sm:items-center gap-4 md:ml-auto"
        >
            <div class="relative w-full sm:w-64">
                <Search
                    size={16}
                    class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    type="search"
                    bind:value={searchInput}
                    placeholder={$t("events.searchPlaceholder")}
                    aria-label={$t("events.searchPlaceholder")}
                    class="w-full border-b border-b-border-input-hover bg-transparent py-2 pl-6 pr-7 text-sm placeholder:text-muted-foreground focus:border-b-foreground focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
                />
                {#if isSearchPending}
                    <Loader2
                        size={14}
                        class="absolute right-0 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                    />
                {:else if searchInput}
                    <button
                        type="button"
                        onclick={clearSearch}
                        aria-label={$t("events.clearSearch")}
                        class="absolute right-0 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                        <X size={14} />
                    </button>
                {/if}
            </div>

            <div class="hidden items-center gap-4 md:flex">
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
    </div>

    {#if filteredEvents.length === 0}
        <p class="text-muted-foreground">
            {#if data.searchQuery}
                {$t("events.noSearchResults", { values: { query: data.searchQuery } })}
            {:else if selectedCategoryId}
                {$t("events.noEventsInCategory")}
            {:else}
                {$t("events.noEvents")}
            {/if}
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
                    class="flex flex-col sm:flex-row gap-6 bg-white p-4 hover:shadow-popover transition-shadow group"
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
                            class="sm:w-64 sm:flex-shrink-0 aspect-4/3 bg-surface-hover flex items-center justify-center rounded"
                        >
                            <span class="text-muted-foreground text-4xl"></span>
                        </div>
                    {/if}
                    <div class="flex flex-col justify-between flex-1">
                        <div>
                            <h3 class="text-xl font-medium mb-2">
                                {event.titleEn}
                            </h3>
                            <p class="text-muted-foreground text-sm line-clamp-2 mb-4">
                                {event.location}
                            </p>
                            <p class="text-muted-foreground text-sm line-clamp-3">
                                {event.descriptionEn}
                            </p>
                        </div>
                        <div
                            class="w-full border border-border-card/20 mt-4"
                        ></div>
                        <div class="mt-4 flex items-center gap-4">
                            <span class="text-sm text-muted-foreground"
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
                class="flex items-center gap-3 text-muted-foreground px-6 py-3 rounded-none border border-border-input disabled:opacity-50"
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
