<script lang="ts">
    import Upcoming from "$lib/components/home/Upcoming.svelte";
    import type { PageData } from "./$types";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{$t("upcoming.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto max-w-8xl px-6 pt-32 pb-24 lg:px-12">
    <div class="mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <h1 class="text-4xl font-serif">{$t("upcoming.title")}</h1>
        <p class="text-muted-foreground max-w-2xl">
            {$t("upcoming.intro")}
        </p>
    </div>

    {#if data.events.length === 0}
        <p class="text-muted-foreground max-w-2xl">{$t("upcoming.empty")}</p>
        <div class="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            <a href="/events" class="text-foreground-alt underline underline-offset-4 hover:text-foreground">{$t("upcoming.emptyProjects")}</a>
            <a href="/contact" class="text-foreground-alt underline underline-offset-4 hover:text-foreground">{$t("upcoming.emptyContact")}</a>
        </div>
    {:else}
        <Upcoming events={data.events} />
    {/if}
</div>
