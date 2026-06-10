<script lang="ts">
    import type { EventWithMedia } from "$lib/types/events";
    import { locale } from "svelte-i18n";

    interface Props {
        event: EventWithMedia;
    }

    let { event }: Props = $props();

    const formattedDate = $derived(
        new Date(event.startDate).toLocaleDateString($locale === 'fr' ? 'fr-FR' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    );
</script>

<a href="/events/{event.slug}" class="block bg-white overflow-hidden group">
    {#if event.coverMedia}
        <div class="aspect-video overflow-hidden">
            {#if event.coverMedia.type === "image"}
                <img
                    src={event.coverMedia.url}
                    alt={event.titleEn}
                    class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-[filter] duration-500"
                />
            {:else}
                <video
                    src={event.coverMedia.url}
                    class="w-full h-full object-cover"
                    muted
                />
            {/if}
        </div>
    {:else}
        <div class="aspect-4/3 bg-surface-hover flex items-center justify-center">
            <span class="text-muted-foreground text-4xl"></span>
        </div>
    {/if}
    <div class="w-full border border-border-card/40 mt-6"></div>

    <div class="mt-4">
        <h3 class="text-lg font-medium">{event.titleEn}</h3>
        <p class="text-muted-foreground text-sm line-clamp-2">{$locale === "en" ? event.locationEn : event.locationFr}</p>
        <p class="text-xs text-muted-foreground uppercase tracking-widest mt-1">{formattedDate}</p>
    </div>
</a>

<style>
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>
