<script lang="ts">
    import type { EventWithMedia } from "$lib/types/events";

    interface Props {
        event: EventWithMedia;
    }

    let { event }: Props = $props();
</script>

<a href="/events/{event.slug}" class="block bg-white overflow-hidden">
    {#if event.coverMedia}
        <div class="aspect-video overflow-hidden">
            {#if event.coverMedia.type === "image"}
                <img
                    src={event.coverMedia.url}
                    alt={event.title}
                    class="w-full h-full object-cover hover:scale-105 transition-transform"
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
        <div class="aspect-4/3 bg-gray-200 flex items-center justify-center">
            <span class="text-gray-400 text-4xl"></span>
        </div>
    {/if}
    <div class="w-full border border-border-card/40 mt-6"></div>

    <div class="mt-4">
        <h3 class="text-lg font-medium">{event.title}</h3>
        <p class="text-dark-500 text-sm line-clamp-2">{event.location}</p>
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
