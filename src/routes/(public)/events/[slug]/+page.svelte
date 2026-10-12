<script lang="ts">
    import EventDetailLayout from "$lib/components/EventDetailLayout.svelte";
    import EventGallery from "$lib/components/EventGallery.svelte";
    import SessionSelector from "$lib/components/booking/SessionSelector.svelte";
    import type { PageData } from "./$types";
    import { reveal } from "$lib/actions/reveal";
    import { t, locale } from "svelte-i18n";

    let { data }: { data: PageData } = $props();

    const canBook = $derived(
        data.event.published && data.sessions.some((s: { isPast: boolean }) => !s.isPast)
    );

    function getEventTitle(): string {
        return ($locale === "en" ? data.event.titleEn : data.event.titleFr) || "";
    }

    function formatDay(date: string): string {
        // Day keys are UTC calendar dates — render them in the reader's locale
        return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(
            $locale === "fr" ? "fr-FR" : "en-US",
            { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        );
    }
</script>

<EventDetailLayout event={data.event}>
    {#if canBook}
        <section class="mt-12 lg:mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
            <h2 class="text-2xl lg:text-3xl font-serif mb-6 lg:mb-8">{$t("events.bookTickets")}</h2>
            <div class="flex flex-col gap-10 lg:gap-14">
                {#each data.schedule as day (day.date)}
                    <article>
                        <h3 class="font-serif text-xl lg:text-2xl pb-4 border-b border-border-card">
                            {formatDay(day.date)}
                        </h3>
                        {#each day.services as service (service.kind)}
                            <div class="mt-6 lg:mt-8">
                                <p class="uppercase text-xxs tracking-widest text-muted-foreground mb-4">
                                    {$t(service.kind === "lunch" ? "events.lunch" : "events.dinner")}
                                </p>
                                <SessionSelector
                                    sessions={service.sessions}
                                    eventTitle={getEventTitle()}
                                    eventSlug={data.event.slug}
                                />
                            </div>
                        {/each}
                    </article>
                {/each}
            </div>
        </section>
    {/if}

    {#if data.event.media && data.event.media.length > 0}
        <section
            class="mt-8 lg:mt-12"
            use:reveal={{ preset: "fade-up", delay: 200 }}
        >
            <h2 class="text-2xl lg:text-3xl font-serif mb-4 lg:mb-6">{$t("events.gallery")}</h2>
            <EventGallery media={data.event.media} />
        </section>
    {/if}
</EventDetailLayout>
