<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import type { PageData } from "./$types";
    import { ArrowLeft, MapPin, Clock, Info } from "lucide-svelte";
    import type {Component} from "svelte"

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{data.event.title} | Germinal</title>
    <meta name="description" content={data.event.description.slice(0, 160)} />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">
    <button class="flex items-center gap-2 mb-8 cursor-pointer">
        <ArrowLeft />
        <p class="text-700">Back to all events</p>
    </button>
    <article>
        <header class="mb-16 grid gap-2">
            <h1 class="text-5xl font-bold">{data.event.title}</h1>
            <p class="text-dark-500 text-lg font-light">
                An exploration of architectural negative space and the
                soundscapes that inhabit them.
            </p>
        </header>
        <div class="w-full border border-border-card/20 mb-16"></div>
        <section class="grid grid-cols-[1fr_auto] gap-32 text-sm">
            <div class="grid gap-8">
                <div>
                    <p class="text-lg text-dark-500 leading-relaxed">
                        {data.event.description}
                    </p>
                    <p class="text-lg text-dark-500 leading-relaxed">
                        {data.event.description}
                    </p>
                    <p class="text-lg text-dark-500 leading-relaxed">
                        {data.event.description}
                    </p>
                </div>
                <div class="bg-dark-50/60 p-8 grid gap-0">
                    <p class="text-md text-dark-300 text-bold leading-relaxed uppercase">in collabaration with</p>
                    <div class="flex gap-12 items-center">
                        <div class="flex gap-2 items-center">
                            <div class="rounded-full bg-dark-400 w-12 h-12"></div>
                            <div>
                                <p class="text-dark-900 font-bold">Mina H</p>
                                <p class="text-dark-500">Sound Architect</p>
                            </div>
                        </div>
                        <div class="flex gap-2 items-center">
                            <div class="rounded-full bg-dark-400 w-12 h-12"></div>
                            <div>
                                <p class="text-dark-900 font-bold">Mina H</p>
                                <p class="text-dark-500">Sound Architect</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid gap-8 min-w-90">
                <div class="grid gap-4">
                    {@render asideTitle("location", MapPin)}
                    <div class="text-dark-500">
                        <p>Kyoto Art Center</p>
                        <p>546-22 Yamafushiyama-cho</p>
                        <p>Nagayako-ku, Kyoto 604-8156</p>
                        <p>Japan</p>
                        </div>
                    </div>
                <div class="grid gap-4">
                    {@render asideTitle("timings", Clock)}
                    <div class="text-dark-500">
                        <p>Opening Night: 18:00 - 22:00</p>
                        <p>Public View: 10:00 - 20:00 (Daily)</p>
                    </div>
                </div>
                <div class="grid gap-4">
                    {@render asideTitle("details", Info)}
                    <div class="grid gap-2">
                        {@render asideLastPart("curator", "Akira Tanaka")}
                        {@render asideLastPart("materials", "Concrete, Steel, Audio")}
                        {@render asideLastPart("admission", "Free")}
                    </div>
                </div>
            </div>
        </section>

        {#if data.event.media && data.event.media.length > 0}
            <section class="mt-12">
                <h2 class="text-3xl font-bold mb-6">Gallery</h2> <EventGallery media={data.event.media} />
            </section>
        {/if}
    </article>
</div>
<!-- typeof import('@lucide/svelte').Icon -->

{#snippet asideTitle(title: string, Icon: Component)}
    <div class="flex items-center gap-2">
        <Icon size={16}/>
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
