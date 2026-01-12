<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import SessionSelector from "$lib/components/booking/SessionSelector.svelte";
    import type { PageData } from "./$types";
    import { ArrowLeft, MapPin, Clock, Info } from "lucide-svelte";
    import { Icon } from "lucide-svelte";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    let { data }: { data: PageData } = $props();

    let collaborators = $derived(
        data.event.collaborators ? JSON.parse(data.event.collaborators) : [],
    );

    let timings = $derived(
        data.event.timings ? JSON.parse(data.event.timings) : [],
    );
</script>

<svelte:head>
    <title>{data.event.title} | Germinal</title>
    <meta name="description" content={data.event.description.slice(0, 160)} />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">
    <a
        href="/events"
        class="flex items-center gap-2 mb-8 cursor-pointer"
        use:reveal={{ preset: "fade-in" }}
    >
        <ArrowLeft />
        <p class="text-700">{$t("events.backToAll")}</p>
    </a>
    <article>
        <header
            class="mb-16 grid gap-2"
            use:reveal={{ preset: "fade-up", delay: 50 }}
        >
            <h1 class="text-5xl font-bold">{data.event.title}</h1>
            {#if data.event.subtitle}
                <p class="text-dark-500 text-lg font-light">
                    {data.event.subtitle}
                </p>
            {/if}
        </header>
        <div class="w-full border border-border-card/20 mb-16"></div>
        <section class="grid grid-cols-[1fr_auto] gap-32 text-sm">
            <div class="grid gap-8">
                <div use:reveal={{ preset: "fade-up", delay: 100 }}>
                    <p class="text-lg text-dark-500 leading-relaxed">
                        {data.event.description}
                    </p>
                </div>
                <div
                    class="bg-dark-50/60 p-8 grid gap-0"
                    use:reveal={{ preset: "fade-up", delay: 150 }}
                >
                    <p
                        class="text-md text-dark-300 text-bold leading-relaxed uppercase"
                    >
                        {$t("events.inCollaborationWith")}
                    </p>
                    <div class="flex gap-12 items-center">
                        {#each collaborators as collab}
                            <div class="flex gap-2 items-center">
                                <div
                                    class="rounded-full bg-dark-400 w-12 h-12"
                                ></div>
                                <div>
                                    <p class="text-dark-900 font-bold">
                                        {collab.name}
                                    </p>
                                    <p class="text-dark-500">{collab.role}</p>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
            <div
                class="grid gap-8 min-w-90"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <div class="grid gap-4">
                    {@render asideTitle($t("events.location"), MapPin)}
                    <div class="text-dark-500">
                        {#if data.event.venueName}
                            <p>{data.event.venueName}</p>
                        {/if}
                        {#if data.event.streetAddress}
                            <p>{data.event.streetAddress}</p>
                        {/if}
                        {#if data.event.district || data.event.city || data.event.postalCode}
                            <p>
                                {#if data.event.district}{data.event.district},
                                {/if}
                                {#if data.event.city}{data.event.city}
                                {/if}
                                {#if data.event.postalCode}{data.event
                                        .postalCode}{/if}
                            </p>
                        {/if}
                        {#if data.event.country}
                            <p>{data.event.country}</p>
                        {/if}
                    </div>
                </div>
                <div class="grid gap-4">
                    {@render asideTitle($t("events.timings"), Clock)}
                    <div class="text-dark-500">
                        {#if timings.length > 0}
                            {#each timings as timing}
                                <p>{timing.label}: {timing.time}</p>
                            {/each}
                        {:else}
                            <p>{$t("events.seeEventDates")}</p>
                        {/if}
                    </div>
                </div>
                <div class="grid gap-4">
                    {@render asideTitle($t("events.details"), Info)}
                    <div class="grid gap-2">
                        {#if data.event.curator}
                            {@render asideLastPart(
                                $t("events.curator"),
                                data.event.curator,
                            )}
                        {/if}
                        {#if data.event.materials}
                            {@render asideLastPart(
                                $t("events.materials"),
                                data.event.materials,
                            )}
                        {/if}
                        {#if data.event.admissionInfo}
                            {@render asideLastPart(
                                $t("events.admission"),
                                data.event.admissionInfo,
                            )}
                        {/if}
                    </div>
                </div>
            </div>
        </section>

        {#if data.event.media && data.event.media.length > 0}
            <section
                class="mt-12"
                use:reveal={{ preset: "fade-up", delay: 200 }}
            >
                <h2 class="text-3xl font-bold mb-6">{$t("events.gallery")}</h2>
                <EventGallery media={data.event.media} />
            </section>
        {/if}

        {#if data.sessions && data.sessions.length > 0}
            <section class="mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
                <h2 class="text-3xl font-bold mb-8">{$t("events.bookTickets")}</h2>
                <SessionSelector
                    sessions={data.sessions}
                    eventTitle={data.event.title}
                    eventSlug={data.event.slug}
                />
            </section>
        {:else}
            <section class="mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
                <h2 class="text-3xl font-bold mb-8">{$t("events.bookTickets")}</h2>
                <div class="bg-dark-50 rounded-lg border border-border-card p-8 text-center">
                    <p class="text-dark-500">No sessions available at this time. Please check back later.</p>
                </div>
            </section>
        {/if}
    </article>
</div>

{#snippet asideTitle(title: string, AsideIcon: typeof Icon)}
    <div class="flex items-center gap-2">
        <AsideIcon size={16} />
        <p class="capitalize text-dark-900">{title}</p>
    </div>
{/snippet}

{#snippet asideLastPart(title: string, value: string)}
    <div class="grid gap-2">
        <div class="flex items-center justify-between">
            <p class="text-dark-500 capitalize">{title}</p>
            <p class="text-dark-700">{value}</p>
        </div>
        <div class="border border-dark-50 w-full"></div>
    </div>
{/snippet}
