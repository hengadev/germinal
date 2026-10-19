<script lang="ts">
    import ProjectIndex from "$lib/components/ProjectIndex.svelte";
    import type { PageData } from "./$types";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{$t("events.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto max-w-8xl px-6 pt-32 pb-24 lg:px-12">
    <div class="mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <h1 class="text-4xl font-serif">{$t("events.title")}</h1>
        <p class="text-muted-foreground max-w-2xl">
            {$t("events.description")}
        </p>
    </div>

    {#if data.events.length === 0}
        <p class="text-muted-foreground">{$t("events.noEvents")}</p>
    {:else}
        <ProjectIndex events={data.events} />
    {/if}
</div>
