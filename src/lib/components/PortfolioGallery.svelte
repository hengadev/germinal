<script lang="ts">
    import type { EventWithMedia } from '$lib/types/events';

    interface Props {
        events: EventWithMedia[];
    }

    let { events }: Props = $props();

    let hoveredIndex = $state<number | null>(null);
    let loadedImages = $state<Set<number>>(new Set());

    function handleImageLoad(index: number) {
        loadedImages = new Set([...loadedImages, index]);
    }

    const EXPANDED_FLEX = 4;
    const COLLAPSED_FLEX = 1;

    function panelFlex(index: number): number {
        if (hoveredIndex === null) return 1;
        return hoveredIndex === index ? EXPANDED_FLEX : COLLAPSED_FLEX;
    }
</script>

<!-- Desktop-only gallery -->
<div class="flex h-[50vh] max-h-[520px] gap-1.5" role="list">
    {#each events as event, index}
        <a
            href="/events/{event.slug}"
            role="listitem"
            class="relative overflow-hidden cursor-pointer"
            style="flex: {panelFlex(index)}; transition: flex 420ms cubic-bezier(0.25, 0.46, 0.45, 0.94);"
            onmouseenter={() => hoveredIndex = index}
            onmouseleave={() => hoveredIndex = null}
        >
            {#if !loadedImages.has(index)}
                <div class="absolute inset-0 bg-surface-hover animate-pulse"></div>
            {/if}

            {#if event.coverMedia}
                <img
                    src={event.coverMedia.url}
                    alt=""
                    class="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onload={() => handleImageLoad(index)}
                />
            {:else}
                <div class="absolute inset-0 bg-surface-hover"></div>
            {/if}

            <div class="absolute inset-0 bg-black/20"></div>
        </a>
    {/each}
</div>
