<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import type { PageData } from "./$types";
    import { ArrowLeft, MapPin, Clock, Info } from "lucide-svelte";
    import { Icon } from "lucide-svelte";
    import { t, locale } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    let { data }: { data: PageData } = $props();

    let collaborators = $derived(
        data.event.collaborators ? JSON.parse(data.event.collaborators) : [],
    );

    let timings = $derived(
        data.event.timings ? JSON.parse(data.event.timings) : [],
    );

    function getEventField(field: 'title' | 'description' | 'subtitle' | 'curator' | 'materials' | 'admissionInfo' | 'location' | 'venueName' | 'streetAddress' | 'district' | 'city' | 'country'): string {
        const enField = (field + 'En') as 'titleEn' | 'descriptionEn' | 'subtitleEn' | 'curatorEn' | 'materialsEn' | 'admissionInfoEn' | 'locationEn' | 'venueNameEn' | 'streetAddressEn' | 'districtEn' | 'cityEn' | 'countryEn';
        const frField = (field + 'Fr') as 'titleFr' | 'descriptionFr' | 'subtitleFr' | 'curatorFr' | 'materialsFr' | 'admissionInfoFr' | 'locationFr' | 'venueNameFr' | 'streetAddressFr' | 'districtFr' | 'cityFr' | 'countryFr';
        return $locale === 'en' ? data.event[enField] || '' : data.event[frField] || '';
    }
</script>

<svelte:head>
    <title>{getEventField('title')} | Germinal</title>
    <meta name="description" content={getEventField('description').slice(0, 160)} />
</svelte:head>

<!-- Full-height hero -->
<section class="relative h-screen w-full overflow-hidden">
    <!-- Background media -->
    {#if data.event.coverMedia?.type === 'video'}
        <video
            src={data.event.coverMedia.url}
            autoplay
            muted
            loop
            playsinline
            class="absolute inset-0 w-full h-full object-cover"
        ></video>
    {:else}
        <img
            src={data.event.coverMedia?.url ?? ''}
            alt={getEventField('title')}
            class="absolute inset-0 w-full h-full object-cover"
        />
    {/if}

    <!-- Gradient overlay -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60"></div>

    <!-- Back button — sits below the fixed nav -->
    <a
        href="/events"
        class="absolute top-24 left-6 lg:left-12 z-10 flex items-center gap-2 text-white/90 hover:text-white transition-colors"
        use:reveal={{ preset: 'fade-in', duration: 600 }}
    >
        <ArrowLeft size={18} />
        <p class="text-sm lg:text-base">{$t("events.backToAll")}</p>
    </a>

    <!-- Title and subtitle at bottom -->
    <div
        class="absolute bottom-0 left-0 right-0 px-6 pb-12 lg:px-12 lg:pb-16 z-10"
        use:reveal={{ preset: 'fade-up', delay: 100, duration: 700 }}
    >
        <div class="flex items-baseline gap-4 flex-wrap">
            <h1 class="text-3xl lg:text-6xl font-bold text-white leading-tight">
                {getEventField('title')}
            </h1>
            {#if getEventField('subtitle')}
                <p class="text-white/70 text-base lg:text-xl font-light">
                    {getEventField('subtitle')}
                </p>
            {/if}
        </div>
    </div>
</section>

<!-- Page content -->
<div class="container mx-auto px-4 py-16 lg:py-24 max-w-8xl">
    <article>
        <section class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-32 text-sm lg:text-base">
            <div class="grid gap-6 lg:gap-8">
                <div use:reveal={{ preset: "fade-up", delay: 100 }}>
                    <p class="text-base lg:text-lg text-dark-500 leading-relaxed">
                        {getEventField('description')}
                    </p>
                </div>
                {#if collaborators.length > 0}
                    <div
                        class="bg-dark-50/60 p-4 lg:p-8 grid gap-3 lg:gap-4"
                        use:reveal={{ preset: "fade-up", delay: 150 }}
                    >
                        <p class="text-xs lg:text-md text-dark-300 text-bold leading-relaxed uppercase">
                            {$t("events.inCollaborationWith")}
                        </p>
                        <div class="flex gap-6 lg:gap-12 items-center flex-wrap">
                            {#each collaborators as collab}
                                <div class="flex gap-2 items-center">
                                    <div class="rounded-full bg-dark-400 w-10 h-10 lg:w-12 lg:h-12"></div>
                                    <div>
                                        <p class="text-dark-900 font-bold text-sm lg:text-base">
                                            {collab.name}
                                        </p>
                                        <p class="text-dark-500 text-xs lg:text-sm">{collab.role}</p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
            <div
                class="grid gap-6 lg:gap-8"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <div class="grid gap-3 lg:gap-4">
                    {@render asideTitle($t("events.location"), MapPin)}
                    <div class="text-dark-500 text-sm lg:text-base">
                        {#if getEventField('venueName')}
                            <p>{getEventField('venueName')}</p>
                        {/if}
                        {#if getEventField('streetAddress')}
                            <p>{getEventField('streetAddress')}</p>
                        {/if}
                        {#if getEventField('district') || getEventField('city') || data.event.postalCode}
                            <p>
                                {#if getEventField('district')}{getEventField('district')},
                                {/if}
                                {#if getEventField('city')}{getEventField('city')}
                                {/if}
                                {#if data.event.postalCode}{data.event.postalCode}{/if}
                            </p>
                        {/if}
                        {#if getEventField('country')}
                            <p>{getEventField('country')}</p>
                        {/if}
                    </div>
                </div>
                <div class="grid gap-3 lg:gap-4">
                    {@render asideTitle($t("events.timings"), Clock)}
                    <div class="text-dark-500 text-sm lg:text-base">
                        {#if timings.length > 0}
                            {#each timings as timing}
                                <p>{timing.label}: {timing.time}</p>
                            {/each}
                        {:else}
                            <p>{$t("events.seeEventDates")}</p>
                        {/if}
                    </div>
                </div>
                <div class="grid gap-3 lg:gap-4">
                    {@render asideTitle($t("events.details"), Info)}
                    <div class="grid gap-2">
                        {#if getEventField('curator')}
                            {@render asideLastPart($t("events.curator"), getEventField('curator'))}
                        {/if}
                        {#if getEventField('materials')}
                            {@render asideLastPart($t("events.materials"), getEventField('materials'))}
                        {/if}
                        {#if getEventField('admissionInfo')}
                            {@render asideLastPart($t("events.admission"), getEventField('admissionInfo'))}
                        {/if}
                    </div>
                </div>
            </div>
        </section>

        {#if data.event.media && data.event.media.length > 0}
            <section
                class="mt-8 lg:mt-12"
                use:reveal={{ preset: "fade-up", delay: 200 }}
            >
                <h2 class="text-2xl lg:text-3xl font-bold mb-4 lg:mb-6">{$t("events.gallery")}</h2>
                <EventGallery media={data.event.media} />
            </section>
        {/if}

    </article>
</div>

{#snippet asideTitle(title: string, AsideIcon: typeof Icon)}
    <div class="flex items-center gap-2">
        <AsideIcon size={14} class="lg:size-[16px]" />
        <p class="capitalize text-dark-900 text-sm lg:text-base">{title}</p>
    </div>
{/snippet}

{#snippet asideLastPart(title: string, value: string)}
    <div class="grid gap-2">
        <div class="flex items-center justify-between gap-4">
            <p class="text-dark-500 capitalize text-sm lg:text-base">{title}</p>
            <p class="text-dark-700 text-sm lg:text-base text-right">{value}</p>
        </div>
        <div class="border border-dark-50 w-full"></div>
    </div>
{/snippet}
