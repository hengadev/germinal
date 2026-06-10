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
                class="w-full h-full grayscale object-cover group-hover:grayscale-0 transition-[filter] duration-500"
            />
        {:else}
            <div
                class="w-full h-full bg-surface-hover flex items-center justify-center"
            >
                <span class="text-muted-foreground text-6xl"></span>
            </div>
        {/if}
    </div>

    <div class="grid gap-1 mt-4">
        <h3 class="text-lg font-medium">
            {talent.firstName}
            {talent.lastName?.[0]}.
        </h3>
        <p class="text-muted-foreground font-normal text-xs uppercase">
            {talent.roleEn}
        </p>
    </div>
</a>
