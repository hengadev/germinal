<script lang="ts">
  import { getAllEvents } from '$lib/server/services/events';
  import { getAllTalents } from '$lib/server/services/talents';
  import EventCard from '$lib/components/EventCard.svelte';
  import TalentCard from '$lib/components/TalentCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Germinal - Events & Talents</title>
  <meta name="description" content="Discover amazing events and talented individuals at Germinal" />
</svelte:head>

<div class="container mx-auto px-4 py-16">
  <section class="text-center mb-16">
    <h1 class="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
      Welcome to Germinal
    </h1>
    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
      Discover amazing events and connect with talented individuals from around the world.
    </p>
  </section>

  <section class="mb-16">
    <div class="flex justify-between items-center mb-8">
      <h2 class="text-4xl font-bold">Featured Events</h2>
      <a href="/events" class="text-blue-600 hover:text-blue-800 font-medium">View All Events →</a>
    </div>

    {#if data.events.length === 0}
      <p class="text-gray-500 text-center">No events available at the moment.</p>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each data.events.slice(0, 3) as event}
          <EventCard {event} />
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <div class="flex justify-between items-center mb-8">
      <h2 class="text-4xl font-bold">Featured Talents</h2>
      <a href="/talents" class="text-blue-600 hover:text-blue-800 font-medium">View All Talents →</a>
    </div>

    {#if data.talents.length === 0}
      <p class="text-gray-500 text-center">No talents available at the moment.</p>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each data.talents.slice(0, 3) as talent}
          <TalentCard {talent} />
        {/each}
      </div>
    {/if}
  </section>
</div>
