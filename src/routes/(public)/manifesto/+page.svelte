<script lang="ts">
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
</script>

<svelte:head>
    <title>{$t("manifesto.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">
    <div class="mb-16 lg:mb-24" use:reveal={{ preset: "fade-down" }}>
        <h1 class="text-3xl lg:text-5xl font-normal">{$t("manifesto.title")}</h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-24">
        <div use:reveal={{ preset: "fade-up", delay: 100 }}>
            <p class="text-dark-800 text-lg lg:text-xl leading-relaxed">
                {$t("manifesto.intro")}
            </p>
        </div>

        <div class="flex flex-col gap-16 lg:gap-24">
            {#each [1, 2, 3] as i}
                <div
                    class="grid gap-4 border-t border-dark-100 pt-8"
                    use:reveal={{ preset: "fade-up", delay: 100 * i }}
                >
                    <p class="uppercase text-dark-300 text-xxs tracking-widest">
                        {$t(`manifesto.section${i}Title`)}
                    </p>
                    <p class="text-dark-700 text-base lg:text-lg leading-relaxed max-w-prose">
                        {$t(`manifesto.section${i}Body`)}
                    </p>
                </div>
            {/each}
        </div>
    </div>
</div>
