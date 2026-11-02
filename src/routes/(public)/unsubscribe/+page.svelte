<script lang="ts">
    import { MailX } from "lucide-svelte";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import type { ActionData } from "./$types";
    import type { PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
    <title>{$t("unsubscribe.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-2xl">
    <div class="mb-12 lg:mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <div class="flex items-center justify-center w-12 h-12 border border-border-input mb-2">
            <MailX class="w-5 h-5 text-foreground-alt" />
        </div>
        <h1 class="text-3xl lg:text-4xl font-serif">
            {$t("unsubscribe.title")}
        </h1>
    </div>

    <section use:reveal={{ preset: "fade-up", delay: 100 }}>
        {#if form}
            {#if form.unsubscribed}
                <p class="text-foreground-alt text-base lg:text-lg leading-relaxed">
                    {$t("unsubscribe.success")}
                </p>
            {:else}
                <!-- An unknown (or already used) token: nothing is revealed. -->
                <p class="text-foreground-alt text-base lg:text-lg leading-relaxed">
                    {$t("unsubscribe.neutral")}
                </p>
            {/if}
        {:else}
            <form method="POST" class="space-y-6">
                <p class="text-muted-foreground text-base lg:text-lg leading-relaxed">
                    {$t("unsubscribe.description")}
                </p>
                <input type="hidden" name="token" value={data.token} />
                <button
                    type="submit"
                    class="px-6 py-3 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    {$t("unsubscribe.confirm")}
                </button>
            </form>
        {/if}
    </section>
</div>
