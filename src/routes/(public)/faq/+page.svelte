<script lang="ts">
    import { t } from "svelte-i18n";

    const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
</script>

<svelte:head>
    <title>{$t("faq.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-3xl">
    <h1 class="text-3xl md:text-4xl font-normal mb-12">{$t("faq.title")}</h1>

    <div class="grid gap-0">
        {#each faqKeys as key, i}
            <div class="border-t border-dark-100 py-8 first:border-t-0">
                <h2 class="text-lg font-medium text-dark-900 mb-3">
                    {$t(`faq.${key}.question`)}
                </h2>
                <p class="text-dark-600 leading-relaxed">
                    {$t(`faq.${key}.answer`)}
                </p>
            </div>
        {/each}
    </div>
</div>
