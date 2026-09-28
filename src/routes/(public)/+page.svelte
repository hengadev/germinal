<script lang="ts">
    import EventCard from "$lib/components/EventCard.svelte";
    import TalentCard from "$lib/components/TalentCard.svelte";
    import PortfolioGallery from "$lib/components/PortfolioGallery.svelte";
    import type { PageData } from "./$types";
    import { ArrowRight, ArrowUpRight } from "lucide-svelte";
    import { t, locale } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import { page } from "$app/state";
    let { data }: { data: PageData } = $props();

    const hasSpotlightEvent = $derived(page.data.hasSpotlightEvent ?? false);

    const portfolioEvents = $derived(
        data.events.filter(e => e.isPortfolio && e.coverMedia && !e.isSpotlight).slice(0, 9)
    );
    const showGallery = $derived(portfolioEvents.length >= 5);

    const serviceKeys = ['artDirection', 'scenography', 'production'] as const;
    const placeholderPartners = [
        'Fondation Louis Vuitton', 'Centre Pompidou', 'Palais de Tokyo', 'Musée Guimet',
        'Galerie Perrotin', 'FIAC', 'Maison & Objet', 'Villa Noailles',
    ];
    let newsletterEmail = $state('');
    let newsletterSubmitted = $state(false);
    function handleNewsletter(e: SubmitEvent) {
        e.preventDefault();
        if (newsletterEmail.trim()) {
            newsletterSubmitted = true;
            newsletterEmail = '';
        }
    }

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
        <!-- Background Media -->
        {#if data.heroVideo}
            <video
                src={data.heroVideo.url}
                class="absolute inset-0 w-full h-full object-cover"
                autoplay
                muted
                loop
                playsinline
            ></video>
        {:else}
            <img
                src={data.heroImage?.url ?? '/hero/hero.webp'}
                alt="Germinal Hero"
                class="absolute inset-0 w-full h-full object-fill"
            />
        {/if}

        <!-- Dark Overlay -->
        <div class="absolute inset-0 bg-black/80"></div>

        <!-- Content -->
        <div
            class="relative z-10 text-center px-4 max-w-4xl grid gap-8 md:gap-12"
            use:reveal={{ preset: "fade-in", duration: 800 }}
        >
            <div class="grid gap-3">
                <h1
                    class="text-4xl md:text-5xl lg:text-8xl font-serif font-bold text-white mb-4 md:mb-6"
                >
                    {$t("home.heroTitle")}
                </h1>
                <p
                    class="text-base md:text-lg lg:text-xl text-white leading-relaxed"
                >
                    {$t("home.heroSubtitle")}
                </p>
            </div>
            <a
                href={hasSpotlightEvent ? "/spotlight" : "/events"}
                class="mx-auto text-foreground font-medium px-6 py-3 bg-white flex items-center gap-2 rounded-none cursor-pointer"
            >
                <p>{hasSpotlightEvent ? $t("home.viewUpcoming") : $t("home.viewCreations")}</p>
                <ArrowUpRight size={20} />
            </a>
        </div>
    </section>

    <!-- Content Sections -->
    <div class="container mx-auto px-4 grid grid-cols-1 gap-y-24 md:gap-y-40 pt-24 md:pt-32 pb-16 md:pb-24">
        <!-- About — statement with the brand line set as a vertical spine -->
        <section class="grid md:grid-cols-[minmax(0,1fr)_auto] gap-8 md:gap-12 items-stretch">
            <div class="grid gap-10 md:gap-14 content-start">
                <h2
                    class="text-4xl md:text-6xl lg:text-7xl font-serif max-w-5xl leading-tight text-balance"
                    use:reveal={{ preset: "fade-up", delay: 100 }}
                >
                    {$t("home.aboutTitle")}
                </h2>
                <div class="grid gap-6" use:reveal={{ preset: "fade-up", delay: 200 }}>
                    <p class="text-foreground-alt text-base md:text-lg leading-relaxed max-w-[65ch]">{$t("home.aboutBody")}</p>
                    <a
                        href="/manifesto"
                        class="flex items-center gap-2 text-muted-foreground hover:text-foreground-alt font-normal w-fit"
                    >
                        <p>{$t("home.aboutManifestoLink")}</p>
                        <ArrowRight />
                    </a>
                </div>
            </div>
            <div class="hidden md:flex items-center" use:reveal={{ preset: "fade-in", delay: 250 }}>
                <p class="[writing-mode:vertical-rl] rotate-180 font-sans italic text-2xl lg:text-3xl text-foreground-alt tracking-wide whitespace-nowrap">
                    {$t("home.heroTitle")}
                </p>
            </div>
        </section>

        <!-- Upcoming event (Spotlight) -->
        {#if data.events.length > 0}
            {@const event = data.events.find(e => e.isSpotlight) ?? data.events[0]}
            {@const start = new Date(event.startDate)}
            {@const end = new Date(event.endDate)}
            {@const isSameDay = start.toDateString() === end.toDateString()}
            {@const admissionInfo = $locale === 'en' ? event.admissionInfoEn : event.admissionInfoFr}
            {@const description = getEventField(event, 'description')}
            <section
                class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12"
                use:reveal={{ preset: "fade-up", delay: 100 }}
            >
                <div>
                    {#if event.coverMedia}
                        <img
                            src={event.coverMedia.url}
                            alt={getEventField(event, 'title')}
                            class="w-full max-h-[25rem] md:max-h-[30rem] object-cover"
                        />
                    {:else}
                        <div class="w-full max-h-[25rem] md:max-h-[30rem] aspect-video bg-surface-hover"></div>
                    {/if}
                </div>
                <div class="flex flex-col justify-between gap-6 md:gap-8">
                    <div class="grid gap-2">
                        <p class="text-muted-foreground uppercase text-sm tracking-widest">
                            {$t("nav.upcomingEvent")}
                        </p>
                        <h2 class="text-xl md:text-2xl lg:text-3xl font-serif">
                            {getEventField(event, 'title')}
                        </h2>
                        {#if description}
                            <p class="text-muted-foreground leading-relaxed line-clamp-3">
                                {description}
                            </p>
                        {/if}
                    </div>
                    <dl class="grid grid-cols-2 gap-x-6 md:gap-x-12 gap-y-6 border-t border-border-input-hover pt-6">
                        <!-- Date range -->
                        <div class="grid gap-0.5">
                            <dt class="uppercase text-xxs tracking-widest text-muted-foreground">{$t("home.date")}</dt>
                            <dd class="text-foreground text-sm font-medium">
                                {isSameDay
                                    ? start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : `${start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </dd>
                        </div>

                        <!-- Time -->
                        <div class="grid gap-0.5">
                            <dt class="uppercase text-xxs tracking-widest text-muted-foreground">{$t("home.time")}</dt>
                            <dd class="text-foreground text-sm font-medium">
                                {start.toLocaleTimeString($locale === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </dd>
                        </div>

                        <!-- Location -->
                        <div class="grid gap-0.5">
                            <dt class="uppercase text-xxs tracking-widest text-muted-foreground">{$t("home.location")}</dt>
                            <dd class="text-foreground text-sm font-medium">{$locale === 'en' ? event.locationEn : event.locationFr}</dd>
                        </div>

                        <!-- Admission info -->
                        {#if admissionInfo}
                            <div class="grid gap-0.5">
                                <dt class="uppercase text-xxs tracking-widest text-muted-foreground">{$t("home.admission")}</dt>
                                <dd class="text-foreground text-sm font-medium">{admissionInfo}</dd>
                            </div>
                        {/if}
                    </dl>
                    <a
                        href="/spotlight"
                        class="inline-flex w-fit items-center gap-2 px-6 py-3 rounded-none bg-foreground hover:bg-foreground-alt text-white transition-colors"
                    >
                        <p>{$t("home.reserveSeat")}</p>
                        <ArrowRight />
                    </a>
                </div>
            </section>
        {/if}
        <section>
            <div
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <h2 class="text-2xl md:text-3xl font-serif">
                    {$t("home.selectedEvents")}
                </h2>
                <a
                    href="/events"
                    class="flex items-center gap-2 text-muted-foreground hover:text-foreground-alt font-normal"
                >
                    <p>{$t("home.viewEvents")}</p>
                    <ArrowRight />
                </a>
            </div>

            <!-- Desktop: gallery when ≥5 portfolio events, otherwise list -->
            {#if showGallery}
                <div class="hidden md:block" use:reveal={{ preset: "fade-up", delay: 100 }}>
                    <PortfolioGallery events={portfolioEvents} />
                </div>
            {:else if data.events.filter(e => !e.isSpotlight).length === 0}
                <div class="hidden md:flex items-center justify-center py-16 border-t border-border-input-hover mt-6">
                    <p class="text-muted-foreground text-center">{$t("home.noEvents")}</p>
                </div>
            {:else}
                <div class="hidden md:block">
                    {#each data.events.filter(e => !e.isSpotlight).slice(0, 3) as event, index}
                        {@const start = new Date(event.startDate)}
                        {@const title = $locale === 'en' ? event.titleEn : event.titleFr}
                        {@const location = $locale === 'en' ? event.locationEn : event.locationFr}
                        <a href="/events/{event.slug}" class="block pt-8 pb-10 group" use:reveal={{ preset: "fade-up", delay: 100 + index * 80 }}>
                            {#if event.coverVideo}
                                <video src={event.coverVideo.url} class="w-full aspect-[16/9] object-cover mb-6" autoplay muted loop playsinline></video>
                            {:else if event.coverMedia}
                                <img src={event.coverMedia.url} alt={title} class="w-full aspect-[16/9] object-cover mb-6" loading="lazy" />
                            {:else}
                                <div class="w-full aspect-[16/9] bg-surface mb-6"></div>
                            {/if}
                            <div class="flex items-center justify-between gap-6">
                                <div class="flex items-center gap-4 min-w-0">
                                    <p class="uppercase text-muted-foreground text-xxs tracking-widest shrink-0">{String(index + 1).padStart(2, '0')}</p>
                                    <h3 class="text-xl md:text-2xl font-normal truncate group-hover:text-muted-foreground transition-colors">{title}</h3>
                                </div>
                                <div class="flex items-center gap-4 shrink-0">
                                    <p class="text-muted-foreground text-sm">{start.toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', { month: 'long', day: 'numeric', year: 'numeric' })}{#if location}<span class="mx-2 text-muted-foreground">·</span>{location}{/if}</p>
                                    <ArrowUpRight size={20} class="text-muted-foreground group-hover:text-foreground transition-colors" />
                                </div>
                            </div>
                        </a>
                    {/each}
                </div>
            {/if}

            <!-- Mobile: always use the standard list -->
            {#if data.events.filter(e => !e.isSpotlight).length === 0}
                <div class="md:hidden flex items-center justify-center py-16 border-t border-border-input-hover mt-6">
                    <p class="text-muted-foreground text-center">{$t("home.noEvents")}</p>
                </div>
            {:else}
                <div class="md:hidden">
                    {#each data.events.filter(e => !e.isSpotlight).slice(0, 3) as event, index}
                        {@const start = new Date(event.startDate)}
                        {@const title = $locale === 'en' ? event.titleEn : event.titleFr}
                        {@const location = $locale === 'en' ? event.locationEn : event.locationFr}
                        <a href="/events/{event.slug}" class="block pt-8 pb-10 group" use:reveal={{ preset: "fade-up", delay: 100 + index * 80 }}>
                            {#if event.coverVideo}
                                <video src={event.coverVideo.url} class="w-full aspect-[16/9] object-cover mb-6" autoplay muted loop playsinline></video>
                            {:else if event.coverMedia}
                                <img src={event.coverMedia.url} alt={title} class="w-full aspect-[16/9] object-cover mb-6" loading="lazy" />
                            {:else}
                                <div class="w-full aspect-[16/9] bg-surface mb-6"></div>
                            {/if}
                            <div class="flex items-center justify-between gap-6">
                                <div class="flex items-center gap-4 min-w-0">
                                    <p class="uppercase text-muted-foreground text-xxs tracking-widest shrink-0">{String(index + 1).padStart(2, '0')}</p>
                                    <h3 class="text-xl font-normal truncate group-hover:text-muted-foreground transition-colors">{title}</h3>
                                </div>
                                <div class="flex items-center gap-4 shrink-0">
                                    <ArrowUpRight size={20} class="text-muted-foreground group-hover:text-foreground transition-colors" />
                                </div>
                            </div>
                        </a>
                    {/each}
                </div>
            {/if}
        </section>

        <section class="">
            <div
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <h2 class="text-2xl md:text-3xl font-serif">
                    {$t("home.featuredTalents")}
                </h2>
                <a
                    href="/talents"
                    class="flex items-center gap-2 text-muted-foreground hover:text-foreground-alt font-normal"
                >
                    <p>{$t("home.viewTalents")}</p>
                    <ArrowRight />
                </a>
            </div>

            {#if data.talents.length === 0}
                <div class="flex items-center justify-center py-16">
                    <p class="text-muted-foreground text-center">
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
                    <p class="text-muted-foreground uppercase text-sm tracking-widest">{$t("home.servicesEyebrow")}</p>
                    <h2 class="text-2xl md:text-3xl font-serif">{$t("home.servicesTitle")}</h2>
                </div>
                <a href="/manifesto" class="flex items-center gap-2 text-muted-foreground hover:text-foreground-alt font-normal">
                    <p>{$t("home.viewServices")}</p>
                    <ArrowRight />
                </a>
            </div>
            {#each serviceKeys as key, index}
                <div
                    class="flex items-start gap-6 md:gap-16 py-8 border-t border-border-input-hover last:border-b last:border-border-input-hover"
                    use:reveal={{ preset: "fade-up", delay: 100 + index * 80 }}
                >
                    <p class="text-muted-foreground text-xs uppercase tracking-widest shrink-0 pt-1">
                        {$t(`manifesto.${key}.number`)}
                    </p>
                    <div class="grid gap-1 flex-1 min-w-0">
                        <h3 class="text-lg font-medium">{$t(`manifesto.${key}.title`)}</h3>
                        <p class="text-muted-foreground text-sm">{$t(`manifesto.${key}.tagline`)}</p>
                    </div>
                </div>
            {/each}
        </section>

        <!-- Stats -->
        <section use:reveal={{ preset: "fade-up", delay: 100 }}>
            <p class="text-muted-foreground uppercase text-sm tracking-widest mb-8">{$t("home.statsEyebrow")}</p>
            <div class="grid grid-cols-1 md:grid-cols-3">
                <div class="py-10 px-6 text-center grid gap-2">
                    <p class="text-6xl md:text-7xl font-bold">30+</p>
                    <p class="text-muted-foreground text-xs uppercase tracking-widest">{$t("home.statsProductions")}</p>
                </div>
                <div class="py-10 px-6 text-center grid gap-2 border-t border-border-input-hover md:border-t-0 md:border-l">
                    <p class="text-6xl md:text-7xl font-bold">80+</p>
                    <p class="text-muted-foreground text-xs uppercase tracking-widest">{$t("home.statsArtists")}</p>
                </div>
                <div class="py-10 px-6 text-center grid gap-2 border-t border-border-input-hover md:border-t-0 md:border-l">
                    <p class="text-6xl md:text-7xl font-bold">5</p>
                    <p class="text-muted-foreground text-xs uppercase tracking-widest">{$t("home.statsYears")}</p>
                </div>
            </div>
        </section>

        <!-- Partners — uncomment when real partner names are available -->
        <!-- <section use:reveal={{ preset: "fade-up", delay: 100 }}>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
                <div class="grid gap-2">
                    <p class="text-muted-foreground uppercase text-sm tracking-widest">{$t("home.partnersEyebrow")}</p>
                    <h2 class="text-2xl md:text-3xl font-serif">{$t("home.partnersTitle")}</h2>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4">
                {#each placeholderPartners as partner, index}
                    <div
                        class="group relative h-32 flex items-center justify-center px-8 overflow-hidden"
                        use:reveal={{ preset: "fade-up", delay: 80 + index * 40 }}
                    >
                        <div class="absolute inset-0 bg-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <p class="relative z-10 text-muted-foreground text-xs font-medium uppercase tracking-widest text-center group-hover:text-white transition-colors duration-300">
                            {partner}
                        </p>
                    </div>
                {/each}
            </div>
        </section> -->

    </div>

    <!-- Newsletter — full-bleed dark band -->
    <section class="bg-foreground text-white">
        <div
            class="max-w-lg mx-auto text-center grid gap-6 px-4 py-24 md:py-32"
            use:reveal={{ preset: "fade-up", delay: 100 }}
        >
            <div class="grid gap-3">
                <p class="text-white/60 uppercase text-sm tracking-widest">{$t("home.newsletter.eyebrow")}</p>
                <h2 class="text-2xl md:text-3xl font-serif">{$t("home.newsletter.title")}</h2>
                <p class="text-white/60">{$t("home.newsletter.subtitle")}</p>
            </div>
            {#if newsletterSubmitted}
                <p class="text-white font-medium" role="status">{$t("home.newsletter.success")}</p>
            {:else}
                <form class="flex" onsubmit={handleNewsletter}>
                    <input
                        type="email"
                        placeholder={$t("home.newsletter.placeholder")}
                        class="flex-1 border border-white/30 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-white focus-visible:ring-white/70 focus-visible:ring-offset-foreground min-w-0"
                        bind:value={newsletterEmail}
                        required
                    />
                    <button
                        type="submit"
                        class="px-6 py-3 bg-white text-foreground text-sm font-medium hover:bg-white/90 focus-visible:ring-offset-foreground transition-colors shrink-0"
                    >
                        {$t("home.newsletter.button")}
                    </button>
                </form>
            {/if}
        </div>
    </section>

    <div class="container mx-auto mb-32 px-4 pt-20 md:pt-28">
        <!-- CTA -->
        <section
            class="text-center py-8 md:py-16"
            use:reveal={{ preset: "fade-up", delay: 100 }}
        >
            <div class="grid gap-6 max-w-2xl mx-auto">
                <p class="text-muted-foreground uppercase text-sm tracking-widest">{$t("home.cta.eyebrow")}</p>
                <h2 class="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight">{$t("home.cta.title")}</h2>
                <a
                    href="/contact"
                    class="mx-auto inline-flex items-center gap-2 px-8 py-4 bg-foreground text-white hover:bg-foreground-alt transition-colors rounded-none"
                >
                    <p>{$t("home.cta.button")}</p>
                    <ArrowUpRight size={20} />
                </a>
            </div>
        </section>
    </div>
</div>
