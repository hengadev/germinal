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

    const serviceKeys = ['artDirection', 'scenography', 'production'] as const;
    const placeholderPartners = [
        'Fondation Louis Vuitton', 'Centre Pompidou', 'Palais de Tokyo', 'Musée Guimet',
        'Galerie Perrotin', 'FIAC', 'Maison & Objet', 'Villa Noailles',
    ];

    function getEventField(event: typeof data.events[0], field: 'title' | 'description' | 'subtitle'): string {
        const enField = (field + 'En') as 'titleEn' | 'descriptionEn' | 'subtitleEn';
        const frField = (field + 'Fr') as 'titleFr' | 'descriptionFr' | 'subtitleFr';
        return $locale === 'en' ? (event[enField] || '') : (event[frField] || '');
    }
</script>

<svelte:head>
    <title>Germinal - {$t("home.metaTitle")}</title>
    <meta
        name="description"
        content={$t("home.metaDescription")}
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
                <p>{hasSpotlightEvent ? $t("home.viewUpcoming") : $t("home.viewCreations")}</p>
                <ArrowUpRight size={20} />
            </a>
        </div>
    </section>

    <!-- Content Sections -->
    <div
        class="container mx-auto mb-32 px-4 grid gap-y-24 md:gap-y-40 pt-24 md:pt-32"
    >
        <!-- About block -->
        <section
            class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start mb-16 md:mb-24"
            use:reveal={{ preset: "fade-up", delay: 100 }}
        >
            <div class="grid gap-3">
                <p class="text-dark-500 uppercase text-sm tracking-widest">{$t("home.aboutEyebrow")}</p>
                <h2 class="text-2xl md:text-3xl lg:text-4xl font-base leading-snug">{$t("home.aboutTitle")}</h2>
            </div>
            <p class="text-dark-500 leading-relaxed md:pt-10">{$t("home.aboutBody")}</p>
        </section>

        <!-- Upcoming event -->
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
                            class="w-full max-h-[25rem] md:max-h-[30rem] object-cover"
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
                                <p class="text-dark-900 text-sm font-medium">{$locale === 'en' ? event.locationEn : event.locationFr}</p>
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
        <section>
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

            {#if data.events.filter(e => !e.isSpotlight).length === 0}
                <div class="flex items-center justify-center py-16 border-t border-dark-100 mt-6">
                    <p class="text-dark-500 text-center">
                        {$t("home.noEvents")}
                    </p>
                </div>
            {:else}
                {#each data.events.filter(e => !e.isSpotlight).slice(0, 3) as event, index}
                    {@const start = new Date(event.startDate)}
                    {@const title = $locale === 'en' ? event.titleEn : event.titleFr}
                    {@const location = $locale === 'en' ? event.locationEn : event.locationFr}
                    <a
                        href="/events/{event.slug}"
                        class="block pt-8 pb-10 group"
                        use:reveal={{ preset: "fade-up", delay: 100 + index * 80 }}
                    >
                        <!-- Media -->
                        {#if event.coverVideo}
                            <video
                                src={event.coverVideo.url}
                                class="w-full aspect-[16/9] object-cover mb-6"
                                autoplay
                                muted
                                loop
                                playsinline
                            ></video>
                        {:else if event.coverMedia}
                            <img
                                src={event.coverMedia.url}
                                alt={title}
                                class="w-full aspect-[16/9] object-cover mb-6"
                                loading="lazy"
                            />
                        {:else}
                            <div class="w-full aspect-[16/9] bg-dark-50 mb-6"></div>
                        {/if}

                        <!-- Info -->
                        <div class="flex items-center justify-between gap-6">
                            <div class="flex items-center gap-4 min-w-0">
                                <p class="uppercase text-dark-300 text-xxs tracking-widest shrink-0">
                                    {String(index + 1).padStart(2, '0')}
                                </p>
                                <h3 class="text-xl md:text-2xl font-normal truncate group-hover:text-dark-500 transition-colors">
                                    {title}
                                </h3>
                            </div>
                            <div class="flex items-center gap-4 shrink-0">
                                <p class="text-dark-400 text-sm hidden md:block">
                                    {start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    {#if location}
                                        <span class="mx-2 text-dark-200">·</span>{location}
                                    {/if}
                                </p>
                                <ArrowUpRight size={20} class="text-dark-300 group-hover:text-dark-900 transition-colors" />
                            </div>
                        </div>
                    </a>
                {/each}
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

        <!-- Services -->
        <section use:reveal={{ preset: "fade-up", delay: 100 }}>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div class="grid gap-2">
                    <p class="text-dark-500 uppercase text-sm tracking-widest">{$t("home.servicesEyebrow")}</p>
                    <h2 class="text-2xl md:text-3xl font-base">{$t("home.servicesTitle")}</h2>
                </div>
                <a href="/manifesto" class="flex items-center gap-2 text-dark-600 hover:text-dark-800 font-normal">
                    <p>{$t("home.viewServices")}</p>
                    <ArrowRight />
                </a>
            </div>
            {#each serviceKeys as key, index}
                <div
                    class="flex items-start gap-6 md:gap-16 py-8 border-t border-dark-100 last:border-b last:border-dark-100"
                    use:reveal={{ preset: "fade-up", delay: 100 + index * 80 }}
                >
                    <p class="text-dark-300 text-xs uppercase tracking-widest shrink-0 pt-1">
                        {$t(`manifesto.${key}.number`)}
                    </p>
                    <div class="grid gap-1 flex-1 min-w-0">
                        <h3 class="text-lg font-medium">{$t(`manifesto.${key}.title`)}</h3>
                        <p class="text-dark-500 text-sm">{$t(`manifesto.${key}.tagline`)}</p>
                    </div>
                </div>
            {/each}
        </section>

        <!-- Stats -->
        <section use:reveal={{ preset: "fade-up", delay: 100 }}>
            <p class="text-dark-500 uppercase text-sm tracking-widest mb-8">{$t("home.statsEyebrow")}</p>
            <div class="grid grid-cols-3">
                <div class="py-10 px-6 text-center grid gap-2">
                    <p class="text-6xl md:text-7xl font-bold">30+</p>
                    <p class="text-dark-400 text-xs uppercase tracking-widest">{$t("home.statsProductions")}</p>
                </div>
                <div class="py-10 px-6 text-center grid gap-2">
                    <p class="text-6xl md:text-7xl font-bold">80+</p>
                    <p class="text-dark-400 text-xs uppercase tracking-widest">{$t("home.statsArtists")}</p>
                </div>
                <div class="py-10 px-6 text-center grid gap-2">
                    <p class="text-6xl md:text-7xl font-bold">5</p>
                    <p class="text-dark-400 text-xs uppercase tracking-widest">{$t("home.statsYears")}</p>
                </div>
            </div>
        </section>

        <!-- Partners — uncomment when real partner names are available -->
        <!-- <section use:reveal={{ preset: "fade-up", delay: 100 }}>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
                <div class="grid gap-2">
                    <p class="text-dark-500 uppercase text-sm tracking-widest">{$t("home.partnersEyebrow")}</p>
                    <h2 class="text-2xl md:text-3xl font-base">{$t("home.partnersTitle")}</h2>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4">
                {#each placeholderPartners as partner, index}
                    <div
                        class="group relative h-32 flex items-center justify-center px-8 overflow-hidden"
                        use:reveal={{ preset: "fade-up", delay: 80 + index * 40 }}
                    >
                        <div class="absolute inset-0 bg-dark-900 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <p class="relative z-10 text-dark-400 text-xs font-medium uppercase tracking-widest text-center group-hover:text-white transition-colors duration-300">
                            {partner}
                        </p>
                    </div>
                {/each}
            </div>
        </section> -->
    </div>
</div>
