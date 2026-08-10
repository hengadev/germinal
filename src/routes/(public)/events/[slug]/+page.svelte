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
</script>

<EventDetailLayout event={data.event}>
    {#if canBook}
        <section class="mt-12 lg:mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
            <h2 class="text-2xl lg:text-3xl font-serif mb-6 lg:mb-8">{$t("events.bookTickets")}</h2>
            <SessionSelector
                sessions={data.sessions}
                eventTitle={getEventTitle()}
                eventSlug={data.event.slug}
            />
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
