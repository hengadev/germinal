<script lang="ts">
    import type { TalentWithMedia } from "$lib/types/talents";

    interface Props {
        talent: TalentWithMedia;
    }

    let { talent }: Props = $props();
</script>

<a
    href="/talents/{talent.id}"
    class="block bg-white overflow-hidden items-center group cursor-pointer"
>
    <div class="w-full aspect-3/4 overflow-hidden">
        {#if talent.profileMedia}
            <img
                src={talent.profileMedia.url}
                alt="{talent.firstName} {talent.lastName}"
                class="w-full h-full grayscale object-cover hover:scale-105 transition-transform"
            />
        {:else}
            <div
                class="w-full h-full bg-gray-200 flex items-center justify-center"
            >
                <span class="text-gray-400 text-6xl"></span>
            </div>
        {/if}
    </div>

    <div class="grid gap-1 mt-4">
        <h3 class="text-lg font-bold">
            {talent.firstName}
            {talent.lastName?.[0]}.
        </h3>
        <p class="text-dark-400 font-base text-xs uppercase">
            {talent.role}
        </p>
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
