<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import type { PageData } from "./$types";
    import { Grid2x2, LayoutList, ArrowDown } from "lucide-svelte";
    import { t } from 'svelte-i18n';
    import { reveal } from '$lib/actions/reveal';

    let { data }: { data: PageData } = $props();
    let filters = $derived([$t('events.filters.exhibitions'), $t('events.filters.dining'), $t('events.filters.workshops')]);
</script>

<svelte:head>
    <title>{$t('events.pageTitle')}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32">
    <div class="mb-16 grid gap-4" use:reveal={{ preset: 'fade-down' }}>
        <h1 class="text-4xl font-normal">{$t('events.title')}</h1>
        <p class="text-dark-400 w-160">
            {$t('events.description')}
        </p>
    </div>
    <div class="flex items-center justify-between mb-16" use:reveal={{ preset: 'fade-in', delay: 100 }}>
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
            <p>{$t('events.view')}</p>
            <button>
                <Grid2x2 />
            </button>
            <button>
                <LayoutList class="text-dark-300" />
            </button>
        </div>
    </div>

    {#if data.events.length === 0}
        <p class="text-gray-500">{$t('events.noEvents')}</p>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each data.events as event, index}
                <div use:reveal={{ preset: 'fade-up', delay: Math.min(index * 60, 300) }}>
                    <EventCard {event} />
                </div>
            {/each}
        </div>
    {/if}
    <div class="flex justify-center items-center mt-16">
        <button
            class="flex items-center gap-3 text-dark-600 px-6 py-3 rounded-full border border-border-dark"
        >
            <p>{$t('events.loadMore')}</p>
            <ArrowDown size={16}/>
        </button>
    </div>
</div>
