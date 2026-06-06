<script lang="ts">
    import EventDetailLayout from "$lib/components/EventDetailLayout.svelte";
    import EventGallery from "$lib/components/EventGallery.svelte";
    import type { PageData } from "./$types";
    import { reveal } from "$lib/actions/reveal";
    import { t } from "svelte-i18n";

    let { data }: { data: PageData } = $props();
</script>

<EventDetailLayout event={data.event}>
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
