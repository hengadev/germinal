<script lang="ts">
    import TalentCard from "$lib/components/TalentCard.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>Talents | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-12">
    <h1 class="text-4xl font-bold mb-8">Our Talents</h1>

    {#if data.talents.length === 0}
        <p class="text-gray-500">No talents available at the moment.</p>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each data.talents as talent}
                <TalentCard {talent} />
            {/each}
        </div>
    {/if}
</div>
