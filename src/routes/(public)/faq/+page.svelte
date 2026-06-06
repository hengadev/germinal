<script lang="ts">
    import { t } from "svelte-i18n";

    const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
</script>

<svelte:head>
    <title>{$t("faq.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-3xl">
    <h1 class="text-3xl md:text-4xl font-serif mb-12">{$t("faq.title")}</h1>

    <div class="grid gap-0">
        {#each faqKeys as key, i}
            <details class="group border-t border-dark-100 py-8 first:border-t-0" open={i === 0}>
                <summary class="flex items-center justify-between cursor-pointer list-none text-lg font-serif text-dark-900 [&::-webkit-details-marker]:hidden">
                    <span>{$t(`faq.${key}.question`)}</span>
                    <svg
                        class="faq-chevron w-5 h-5 shrink-0 ml-4 text-dark-400 transition-transform duration-200"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </summary>
                <p class="text-dark-600 leading-relaxed pt-3">
                    {$t(`faq.${key}.answer`)}
                </p>
            </details>
        {/each}
    </div>
</div>

<style>
    details[open] > summary .faq-chevron {
        transform: rotate(180deg);
    }

    @media (prefers-reduced-motion: reduce) {
        .faq-chevron {
            transition: none;
        }
    }
</style>
