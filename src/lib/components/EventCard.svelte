<script lang="ts">
    import type { EventWithMedia } from "$lib/types/events";
    import { locale } from "svelte-i18n";
    import { formatSeatingDate } from "$lib/utils/event-time";
    import { localizedText } from "$lib/utils/event-text";

    interface Props {
        event: EventWithMedia;
    }

    let { event }: Props = $props();

    const formattedDate = $derived(
        // The Event's first Day, at the venue (ADR 0006) — none while it has
        // no Days (issue 036).
        event.startDate
            ? formatSeatingDate(new Date(event.startDate), event.timeZone, $locale === 'fr' ? 'fr' : 'en', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
            : ''
    );
    // Either language may be missing: fall back to the other.
    const title = $derived(localizedText(event.titleEn, event.titleFr, $locale));
    const location = $derived(localizedText(event.locationEn, event.locationFr, $locale));
</script>

<a href="/events/{event.id}" class="block bg-white overflow-hidden group">
    {#if event.coverMedia}
        <div class="aspect-video overflow-hidden">
            {#if event.coverMedia.type === "image"}
                <img
                    src={event.coverMedia.url}
                    alt={title}
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
        <h3 class="text-lg font-medium">{title}</h3>
        {#if location}<p class="text-muted-foreground text-sm line-clamp-2">{location}</p>{/if}
        {#if formattedDate}<p class="text-xs text-muted-foreground uppercase tracking-widest mt-1">{formattedDate}</p>{/if}
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
