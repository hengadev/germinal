<script lang="ts">
    import EventAnnouncement from "$lib/components/EventAnnouncement.svelte";
    import PortfolioProject from "$lib/components/PortfolioProject.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <!-- A Private Event is reached by its link, never indexed (issue 032). -->
    {#if !data.indexed}
        <meta name="robots" content="noindex" />
    {/if}
</svelte:head>

{#if data.project}
    <!-- A Portfolio Event is shown as its project (issue 045). -->
    <PortfolioProject project={data.project} />
{:else if data.event}
    <EventAnnouncement event={data.event} schedule={data.schedule} preview={data.view === "preview"} />
{/if}
