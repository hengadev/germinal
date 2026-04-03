<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import TalentCard from "$lib/components/TalentCard.svelte";
    import type { PageData } from "./$types";
    import { ArrowRight, ArrowUpRight } from "lucide-svelte";
    import { t, locale } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import { page } from "$app/state";
    let { data }: { data: PageData } = $props();

    const hasSpotlightEvent = $derived(page.data.hasSpotlightEvent ?? false);

    function getEventField(event: typeof data.events[0], field: 'title' | 'description' | 'subtitle'): string {
        const enField = (field + 'En') as 'titleEn' | 'descriptionEn' | 'subtitleEn';
        const frField = (field + 'Fr') as 'titleFr' | 'descriptionFr' | 'subtitleFr';
        return $locale === 'en' ? (event[enField] || '') : (event[frField] || '');
    }
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
    <section
        class="relative min-h-[60vh] md:h-screen w-full flex items-center justify-center"
    >
        <!-- Background Image -->
        <img
            src="/hero/hero.webp"
            alt="Germinal Hero"
            class="absolute inset-0 w-full h-full object-fill"
        />

        <!-- Dark Overlay -->
        <div class="absolute inset-0 bg-black/80"></div>

        <!-- Content -->
        <div
            class="relative z-10 text-center px-4 max-w-4xl grid gap-8 md:gap-12"
            use:reveal={{ preset: "fade-in", duration: 800 }}
        >
            <div class="grid gap-3">
                <h1
                    class="text-4xl md:text-5xl lg:text-8xl font-sans font-bold text-white mb-4 md:mb-6"
                >
                    {$t("home.heroTitle")}
                </h1>
                <p
                    class="text-base md:text-lg lg:text-xl text-dark-300 leading-relaxed"
                >
                    {$t("home.heroSubtitle")}
                </p>
            </div>
            <a
                href={hasSpotlightEvent ? "/spotlight" : "/events"}
                class="mx-auto text-dark-900 font-medium px-6 py-3 bg-white flex items-center gap-2 rounded-full cursor-pointer"
            >
                <p>{hasSpotlightEvent ? $t("home.viewUpcoming") : $t("home.viewEvents")}</p>
                <ArrowUpRight size={20} />
            </a>
        </div>
    </section>

    <!-- Content Sections -->
    <div
        class="container mx-auto mb-32 px-4 grid gap-y-24 md:gap-y-40 pt-24 md:pt-32"
    >
        <section
            class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12"
            use:reveal={{ preset: "fade-up", delay: 100 }}
        >
            {#if data.events.length === 0}
                <div></div>
            {:else}
                <div>
                    {#if data.events[0].coverMedia}
                        <img
                            src={data.events[0].coverMedia.url}
                            alt={getEventField(data.events[0], 'title')}
                            class="w-full max-h-[25rem] md:max-h-[30rem] object-cover grayscale"
                        />
                    {:else}
                        <div class="w-full max-h-[25rem] md:max-h-[30rem] aspect-video bg-gray-200"></div>
                    {/if}
                </div>
                <div class="flex flex-col justify-between gap-6 md:gap-4">
                    <div class="grid gap-2">
                        <p class="text-dark-500 uppercase text-sm">
                            {$t("nav.upcomingEvent")}
                        </p>
                        <h2 class="text-xl md:text-2xl lg:text-3xl font-base">
                            {getEventField(data.events[0], 'title')}
                        </h2>
                        <p class="text-dark-500 font-base">
                            {$t("home.heroDescription")}
                        </p>
                    </div>
                    <div class="w-full border border-dark-50/80"></div>
                    {#if data.events[0]}
                        {@const event = data.events[0]}
                        {@const start = new Date(event.startDate)}
                        {@const end = new Date(event.endDate)}
                        {@const isSameDay = start.toDateString() === end.toDateString()}
                        {@const admissionInfo = $locale === 'en' ? event.admissionInfoEn : event.admissionInfoFr}

                        <div class="grid grid-cols-2 grid-rows-2 gap-y-8">
                            <!-- Date range -->
                            <div class="grid gap-0.5">
                                <p class="uppercase text-xs text-dark-300">{$t("home.date")}</p>
                                <p class="text-dark-900 text-sm font-medium">
                                    {isSameDay
                                        ? start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
                                        : `${start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                                </p>
                            </div>

                            <!-- Time -->
                            <div class="grid gap-0.5">
                                <p class="uppercase text-xs text-dark-300">{$t("home.time")}</p>
                                <p class="text-dark-900 text-sm font-medium">
                                    {start.toLocaleTimeString($locale === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>

                            <!-- Location -->
                            <div class="grid gap-0.5">
                                <p class="uppercase text-xs text-dark-300">{$t("home.location")}</p>
                                <p class="text-dark-900 text-sm font-medium">{event.location}</p>
                            </div>

                            <!-- Admission info -->
                            {#if admissionInfo}
                                <div class="grid gap-0.5">
                                    <p class="uppercase text-xs text-dark-300">{$t("home.admission")}</p>
                                    <p class="text-dark-900 text-sm font-medium">{admissionInfo}</p>
                                </div>
                            {/if}
                        </div>
                    {/if}
                    <div class="w-full border border-dark-50/80"></div>
                    <a
                        href="/spotlight"
                        class="inline-flex w-fit items-center gap-2 px-6 py-3 rounded-lg bg-dark-900 hover:bg-dark-700 text-white"
                    >
                        <p>{$t("home.reserveSeat")}</p>
                        <ArrowRight />
                    </a>
                </div>
            {/if}
        </section>
        <section class="">
            <div
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <h2 class="text-2xl md:text-3xl font-base">
                    {$t("home.selectedEvents")}
                </h2>
                <a
                    href="/events"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>{$t("home.viewEvents")}</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.events.length === 0}
                <div class="flex items-center justify-center py-16">
                    <p class="text-dark-500 text-center">
                        {$t("home.noEvents")}
                    </p>
                </div>
            {:else}
                <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {#each data.events.slice(0, 3) as event, index}
                        <div
                            use:reveal={{
                                preset: "fade-up",
                                delay: 200 + index * 60,
                            }}
                        >
                            <EventCard {event} />
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <section class="">
            <div
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <h2 class="text-2xl md:text-3xl font-base">
                    {$t("home.featuredTalents")}
                </h2>
                <a
                    href="/talents"
                    class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal"
                >
                    <p>{$t("home.viewTalents")}</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.talents.length === 0}
                <div class="flex items-center justify-center py-16">
                    <p class="text-dark-500 text-center">
                        {$t("home.noTalents")}
                    </p>
                </div>
            {:else}
                <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {#each data.talents.slice(0, 3) as talent, index}
                        <div
                            use:reveal={{
                                preset: "fade-up",
                                delay: 200 + index * 60,
                            }}
                        >
                            <TalentCard {talent} />
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    </div>
</div>
