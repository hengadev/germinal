<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import SessionSelector from "$lib/components/booking/SessionSelector.svelte";
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

    let hasUpcomingSessions = $derived(data.sessions.some(s => !s.isPast));

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

<div class="container mx-auto px-4 py-16 lg:py-32 max-w-8xl">
    <a
        href="/events"
        class="flex items-center gap-2 mb-6 lg:mb-8 cursor-pointer"
        use:reveal={{ preset: "fade-in" }}
    >
        <ArrowLeft size={18} />
        <p class="text-700 text-sm lg:text-base">{$t("events.backToAll")}</p>
    </a>
    <article>
        <header
            class="mb-8 lg:mb-16 grid gap-3 lg:gap-4"
            use:reveal={{ preset: "fade-up", delay: 50 }}
        >
            <h1 class="text-3xl lg:text-5xl font-bold">{getEventField('title')}</h1>
            {#if getEventField('subtitle')}
                <p class="text-dark-500 text-lg font-light">
                    {getEventField('subtitle')}
                </p>
            {/if}
        </header>
        <div class="w-full border border-border-card/20 mb-8 lg:mb-16"></div>
        <section class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-32 text-sm lg:text-base">
            <div class="grid gap-6 lg:gap-8">
                <div use:reveal={{ preset: "fade-up", delay: 100 }}>
                    <p class="text-base lg:text-lg text-dark-500 leading-relaxed">
                        {getEventField('description')}
                    </p>
                </div>
                <div
                    class="bg-dark-50/60 p-4 lg:p-8 grid gap-3 lg:gap-4"
                    use:reveal={{ preset: "fade-up", delay: 150 }}
                >
                    <p
                        class="text-xs lg:text-md text-dark-300 text-bold leading-relaxed uppercase"
                    >
                        {$t("events.inCollaborationWith")}
                    </p>
                    <div class="flex gap-6 lg:gap-12 items-center flex-wrap">
                        {#each collaborators as collab}
                            <div class="flex gap-2 items-center">
                                <div
                                    class="rounded-full bg-dark-400 w-10 h-10 lg:w-12 lg:h-12"
                                ></div>
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
                            {@render asideLastPart(
                                $t("events.curator"),
                                getEventField('curator'),
                            )}
                        {/if}
                        {#if getEventField('materials')}
                            {@render asideLastPart(
                                $t("events.materials"),
                                getEventField('materials'),
                            )}
                        {/if}
                        {#if getEventField('admissionInfo')}
                            {@render asideLastPart(
                                $t("events.admission"),
                                getEventField('admissionInfo'),
                            )}
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

        {#if hasUpcomingSessions}
            <section class="mt-12 lg:mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
                <h2 class="text-2xl lg:text-3xl font-bold mb-6 lg:mb-8">{$t("events.bookTickets")}</h2>
                <SessionSelector
                    sessions={data.sessions}
                    eventTitle={getEventField('title')}
                    eventSlug={data.event.slug}
                />
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
