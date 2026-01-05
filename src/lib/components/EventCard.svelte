<script lang="ts">
  import { formatDate } from '$lib/utils/format';
  import type { EventWithMedia } from '$lib/types/events';

  interface Props {
    event: EventWithMedia;
  }

  let { event }: Props = $props();
</script>

<a
  href="/events/{event.slug}"
  class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
>
  {#if event.coverMedia}
    <div class="aspect-video overflow-hidden">
      {#if event.coverMedia.type === 'image'}
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
    <div class="aspect-video bg-gray-200 flex items-center justify-center">
      <span class="text-gray-400 text-4xl">📸</span>
    </div>
  {/if}

  <div class="p-6">
    <h3 class="text-2xl font-bold mb-2">{event.title}</h3>
    <p class="text-gray-600 mb-4 line-clamp-2">{event.description}</p>

    <div class="flex items-center gap-4 text-sm text-gray-500">
      <div class="flex items-center gap-1">
        <span>📅</span>
        <time>{formatDate(event.startDate)}</time>
      </div>
      <div class="flex items-center gap-1">
        <span>📍</span>
        <span class="truncate">{event.location}</span>
      </div>
    </div>
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
