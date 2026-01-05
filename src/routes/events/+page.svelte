<script lang="ts">
  import EventCard from '$lib/components/EventCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Events | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-12">
  <h1 class="text-4xl font-bold mb-8">Upcoming Events</h1>

  {#if data.events.length === 0}
    <p class="text-gray-500">No events available at the moment.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.events as event}
        <EventCard {event} />
      {/each}
    </div>
  {/if}
</div>
