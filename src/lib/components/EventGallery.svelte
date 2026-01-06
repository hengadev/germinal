<script lang="ts">
    import type { Media } from "$lib/types/media";

    interface Props {
        media: Media[];
    }

    let { media }: Props = $props();

    let selectedMedia = $state<Media | null>(null);

    function openLightbox(item: Media) {
        selectedMedia = item;
    }

    function closeLightbox() {
        selectedMedia = null;
    }
</script>

<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
    {#each media as item}
        <button
            onclick={() => openLightbox(item)}
            class="aspect-square overflow-hidden rounded-lg hover:opacity-90 transition-opacity"
        >
            {#if item.type === "image"}
                <img
                    src={item.url}
                    alt="Event media"
                    class="w-full h-full object-cover"
                />
            {:else}
                <video
                    src={item.url}
                    class="w-full h-full object-cover"
                    muted
                />
            {/if}
        </button>
    {/each}
</div>

{#if selectedMedia}
    <div
        class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
        onclick={closeLightbox}
        role="button"
        tabindex="-1"
    >
        <button
            class="absolute top-4 right-4 text-white text-4xl"
            onclick={closeLightbox}
        >
            ×
        </button>

        {#if selectedMedia.type === "image"}
            <img
                src={selectedMedia.url}
                alt="Full size"
                class="max-w-full max-h-full object-contain"
            />
        {:else}
            <video
                src={selectedMedia.url}
                controls
                class="max-w-full max-h-full"
            >
                Your browser does not support video.
            </video>
        {/if}
    </div>
{/if}
