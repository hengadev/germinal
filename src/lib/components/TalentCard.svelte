<script lang="ts">
  import type { TalentWithMedia } from '$lib/types/talents';

  interface Props {
    talent: TalentWithMedia;
  }

  let { talent }: Props = $props();
</script>

<a
  href="/talents/{talent.id}"
  class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
>
  <div class="aspect-square overflow-hidden">
    {#if talent.profileMedia}
      <img
        src={talent.profileMedia.url}
        alt="{talent.firstName} {talent.lastName}"
        class="w-full h-full object-cover hover:scale-105 transition-transform"
      />
    {:else}
      <div class="w-full h-full bg-gray-200 flex items-center justify-center">
        <span class="text-gray-400 text-6xl">👤</span>
      </div>
    {/if}
  </div>

  <div class="p-6">
    <h3 class="text-2xl font-bold mb-1">
      {talent.firstName} {talent.lastName}
    </h3>
    <p class="text-gray-600 font-medium mb-3">{talent.role}</p>
    <p class="text-gray-700 line-clamp-3">{talent.bio}</p>
  </div>
</a>

<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
