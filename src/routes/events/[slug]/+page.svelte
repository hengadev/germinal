<script lang="ts">
  import EventGallery from '$lib/components/EventGallery.svelte';
  import { formatDate } from '$lib/utils/format';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.event.title} | Germinal</title>
  <meta name="description" content={data.event.description.slice(0, 160)} />
</svelte:head>

<article class="container mx-auto px-4 py-12 max-w-4xl">
  {#if data.event.coverMedia}
    <div class="mb-8 rounded-lg overflow-hidden">
      {#if data.event.coverMedia.type === 'image'}
        <img
          src={data.event.coverMedia.url}
          alt={data.event.title}
          class="w-full h-96 object-cover"
        />
      {:else}
        <video
          src={data.event.coverMedia.url}
          controls
          class="w-full h-96 object-cover"
        >
          Your browser does not support video.
        </video>
      {/if}
    </div>
  {/if}

  <header class="mb-8">
    <h1 class="text-5xl font-bold mb-4">{data.event.title}</h1>

    <div class="flex flex-wrap gap-4 text-gray-600 mb-4">
      <div class="flex items-center gap-2">
        <span>📅</span>
        <time>{formatDate(data.event.startDate)} - {formatDate(data.event.endDate)}</time>
      </div>
      <div class="flex items-center gap-2">
        <span>📍</span>
        <span>{data.event.location}</span>
      </div>
    </div>

    <p class="text-lg text-gray-700 leading-relaxed">{data.event.description}</p>
  </header>

  {#if data.event.media && data.event.media.length > 0}
    <section class="mt-12">
      <h2 class="text-3xl font-bold mb-6">Gallery</h2>
      <EventGallery media={data.event.media} />
    </section>
  {/if}
</article>
