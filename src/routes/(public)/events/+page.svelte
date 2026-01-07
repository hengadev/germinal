<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import type { PageData } from "./$types";
    import { Grid2x2, LayoutList, ArrowDown } from "lucide-svelte";

    let { data }: { data: PageData } = $props();
    let filters = ["Exhibitions", "Dining", "Workshops"];
</script>

<svelte:head>
    <title>Events | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-32">
    <div class="mb-16 grid gap-4">
        <h1 class="text-4xl font-normal">Selected Events</h1>
        <p class="text-dark-400 w-160">
            Explore our curated selection of upcoming exhibition, dining
            experiences, and architectural tours. Click on any event to view
            full details.
        </p>
    </div>
    <div class="flex items-center justify-between mb-16">
        <div class="flex items-center gap-4">
            <p class="px-4 py-2 bg-dark-900 text-white rounded-full">All</p>
            {#each filters as filter}
                <p
                    class="px-4 py-2 border border-border-card rounded-full text-dark-600"
                >
                    {filter}
                </p>
            {/each}
        </div>
        <div class="flex items-center gap-4">
            <p>View:</p>
            <button>
                <Grid2x2 />
            </button>
            <button>
                <LayoutList class="text-dark-300" />
            </button>
        </div>
    </div>

    {#if data.events.length === 0}
        <p class="text-gray-500">No events available at the moment.</p>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each data.events as event}
                <EventCard {event} />
            {/each}
        </div>
    {/if}
    <div class="flex justify-center items-center mt-16">
        <button
            class="flex items-center gap-3 text-dark-600 px-6 py-3 rounded-full border border-border-dark"
        >
            <p>Load more events</p>
            <ArrowDown size={16}/>
        </button>
    </div>
</div>
