<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import TalentCard from "$lib/components/TalentCard.svelte";
    import type { PageData } from "./$types";
    import { ArrowRight, ArrowUpRight } from "lucide-svelte";
    import { t } from 'svelte-i18n';
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
        <div class="relative z-10 text-center px-4 max-w-4xl grid gap-12">
            <div class="grid gap-3">
                <h1
                    class="text-5xl md:text-8xl font-sans font-bold text-white mb-6"
                >
                    Sublimer <br /> l’éphémère
                </h1>
                <p class="text-lg md:text-xl text-dark-300 leading-relaxed">
                    Un collectif dédié à l’architecture des expériences
                    sensorielles. Nous façonnons des instants où le goût, le son et
                    l’espace entrent en résonance.
                </p>
            </div>
            <a
                href="/upcoming"
                class="mx-auto text-dark-900 font-medium px-6 py-3 bg-white flex items-center gap-2 rounded-full cursor-pointer"
            >
                <p>Voir le prochain evenement</p>
                <ArrowUpRight size={20} />
            </a>
        </div>
    </section>

    <!-- Content Sections -->
    <div class="container mx-auto mb-32 px-4 grid gap-y-40 pt-32">
        <section class="grid grid-cols-2 gap-12">
            {#if data.events.length === 0}
                <div></div>
            {:else}
            <div>
                <img
                    src={data.events[0].coverMedia.url}
                    alt={data.events[0].title}
                    class="w-full max-h-100 object-cover grayscale"
                />
            </div>
            <div class="flex flex-col justify-between"> 
                <div class="grid gap-2">
                    <p class="text-dark-500 uppercase text-sm">{$t('nav.upcomingEvent')}</p>
                    <h2 class="text-4xl font-base">{data.events[0].title}</h2>
                    <p class="text-dark-500 font-base">{$t('home.heroDescription')}</p>
                </div>
                <div class="w-full border border-dark-50/80"></div>
                <div class="grid grid-cols-2 grid-rows-2 gap-y-8">
                    {#each Array(4) as _, index}
                        <div class="grid gap-0.5">
                            <p class="uppercase text-xs text-dark-300">Date</p>
                            <p class="text-dark-900 text-sm font-medium">October 24, 2024</p>
                        </div>
                    {/each}
                </div>
                <div class="w-full border border-dark-50/80"></div>
                <button class="inline-flex w-fit items-center gap-2 px-6 py-3 rounded-lg bg-dark-900 hover:bg-dark-700 text-white">
                    <p>{$t('home.reserveSeat')}</p>
                    <ArrowRight />
                </button>
            </div>
            {/if}
        </section>
        <section class="">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-3xl font-base">{$t('home.selectedEvents')}</h2>
                <a
                    href="/events"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>{$t('home.viewEvents')}</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.events.length === 0}
                <p class="text-dark-500 text-center">
                    {$t('home.noEvents')}
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
                <h2 class="text-3xl font-base">{$t('home.featuredTalents')}</h2>
                <a
                    href="/talents"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>{$t('home.viewTalents')}</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.talents.length === 0}
                <p class="text-dark-500 text-center">
                    {$t('home.noTalents')}
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
