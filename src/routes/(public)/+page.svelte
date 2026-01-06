<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import TalentCard from "$lib/components/TalentCard.svelte";
    import type { PageData } from "./$types";
    import { ArrowRight } from "lucide-svelte";
    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>Germinal - Events & Talents</title>
    <meta
        name="description"
        content="Discover amazing events and talented individuals at Germinal"
    />
</svelte:head>

<div>
    <!-- Hero Section -->
    <section class="relative h-screen w-full flex items-center justify-center">
        <!-- Background Image -->
        <img
            src="/hero/hero.webp"
            alt="Germinal Hero"
            class="absolute inset-0 w-full h-full object-fill"
        />

        <!-- Dark Overlay -->
        <div class="absolute inset-0 bg-black/80"></div>

        <!-- Content -->
        <div class="relative z-10 text-center px-4 max-w-4xl">
            <h1
                class="text-5xl md:text-7xl font-sans font-bold text-white mb-6"
            >
                Sublimer <br /> l’éphémère
            </h1>
            <p class="text-lg md:text-xl text-dark-300 leading-relaxed">
                Une collection d’instants, de lieux et des esprits qui les
                façonnent
            </p>
        </div>
    </section>

    <!-- Content Sections -->
    <div class="container mx-auto mb-32 px-4 grid gap-32 pt-32">
        <section class="">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-3xl font-base">Selected Events</h2>
                <a
                    href="/events"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>Voir Les Événements</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.events.length === 0}
                <p class="text-dark-500 text-center">
                    No events available at the moment.
                </p>
            {:else}
                <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {#each data.events.slice(0, 3) as event}
                        <EventCard {event} />
                    {/each}
                </div>
            {/if}
        </section>

        <section class="">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-3xl font-base">Featured Talents</h2>
                <a
                    href="/talents"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>Voir Les Talents</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.talents.length === 0}
                <p class="text-dark-500 text-center">
                    No talents available at the moment.
                </p>
            {:else}
                <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {#each data.talents.slice(0, 3) as talent}
                        <TalentCard {talent} />
                    {/each}
                </div>
            {/if}
        </section>
    </div>
</div>
