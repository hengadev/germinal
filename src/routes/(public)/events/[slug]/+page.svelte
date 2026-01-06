<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import type { PageData } from "./$types";
    import { ArrowLeft, MapPin } from "lucide-svelte";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{data.event.title} | Germinal</title>
    <meta name="description" content={data.event.description.slice(0, 160)} />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-4xl">
    <div class="flex items-center gap-2 mb-8">
        <ArrowLeft />
        <p class="text-700">Back to all events</p>
    </div>
    <article>
        <header class="mb-16 grid gap-2">
            <h1 class="text-5xl font-bold">{data.event.title}</h1>
            <p class="text-dark-300 text-lg font-medium">
                An exploration of architectural negative space and the
                soundscapes that inhabit them.
            </p>
        </header>
        <div class="w-full border border-border-card/20 mb-16"></div>
        <section class="grid grid-cols-[1fr_auto]">
            <div>
                <p class="text-lg text-dark-300 leading-relaxed">
                    {data.event.description}
                </p>
                <p class="text-lg text-dark-300 leading-relaxed">
                    {data.event.description}
                </p>
                <p class="text-lg text-dark-300 leading-relaxed">
                    {data.event.description}
                </p>
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <MapPin />
                    <p>Location</p>
                </div>
                <p>Kyoto Art Center</p>
            </div>
        </section>

        {#if data.event.media && data.event.media.length > 0}
            <section class="mt-12">
                <h2 class="text-3xl font-bold mb-6">Gallery</h2>
                <EventGallery media={data.event.media} />
            </section>
        {/if}
    </article>
</div>
