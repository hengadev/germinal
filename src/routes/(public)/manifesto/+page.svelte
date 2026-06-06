<script lang="ts">
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";

    const servicePoints = [1, 2, 3, 4] as const;
</script>

<svelte:head>
    <title>{$t("manifesto.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">

    <!-- Header -->
    <div class="mb-24 lg:mb-40" use:reveal={{ preset: "fade-down" }}>
        <p class="uppercase text-dark-300 text-xxs tracking-widest mb-6">
            {$t("manifesto.eyebrow")}
        </p>
        <h1 class="text-4xl lg:text-7xl font-serif max-w-3xl leading-tight">
            {$t("manifesto.title")}
        </h1>
    </div>

    <!-- Intro -->
    <div class="grid lg:grid-cols-[1fr_2fr] gap-12 mb-32 lg:mb-56" use:reveal={{ preset: "fade-up" }}>
        <div>
            <p class="uppercase text-dark-300 text-xxs tracking-widest">
                {$t("manifesto.introLabel")}
            </p>
        </div>
        <p class="text-dark-700 text-xl lg:text-2xl leading-relaxed">
            {$t("manifesto.intro")}
        </p>
    </div>

    <!-- Service 01: Art Direction -->
    <section class="mb-32 lg:mb-56">
        <div use:reveal={{ preset: "fade-up" }}>
            <p class="uppercase text-dark-300 text-xxs tracking-widest mb-6">
                {$t("manifesto.artDirection.number")}
            </p>
            <img
                src="https://picsum.photos/seed/germinal-artdirection/1600/700"
                alt={$t("manifesto.artDirection.imageAlt")}
                class="w-full aspect-[4/3] lg:aspect-[21/9] object-cover mb-12 lg:mb-16"
                loading="lazy"
            />
        </div>
        <div class="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
            <div use:reveal={{ preset: "fade-up" }}>
                <h2 class="text-3xl lg:text-5xl font-serif mb-3">
                    {$t("manifesto.artDirection.title")}
                </h2>
                <p class="text-dark-400 text-lg lg:text-xl mb-10">
                    {$t("manifesto.artDirection.tagline")}
                </p>
                <p class="text-dark-700 text-base lg:text-lg leading-relaxed max-w-prose">
                    {$t("manifesto.artDirection.body")}
                </p>
            </div>
            <div use:reveal={{ preset: "fade-up", delay: 150 }}>
                <ul class="flex flex-col gap-0">
                    {#each servicePoints as i}
                        <li class="flex items-start gap-5 border-t border-dark-100 py-5">
                            <span class="text-dark-300 mt-0.5 shrink-0">—</span>
                            <span class="text-dark-700 text-sm lg:text-base">
                                {$t(`manifesto.artDirection.point${i}`)}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
    </section>

    <!-- Service 02: Scenography -->
    <section class="mb-32 lg:mb-56">
        <div use:reveal={{ preset: "fade-up" }}>
            <p class="uppercase text-dark-300 text-xxs tracking-widest mb-6">
                {$t("manifesto.scenography.number")}
            </p>
            <img
                src="https://picsum.photos/seed/germinal-scenography/1600/700"
                alt={$t("manifesto.scenography.imageAlt")}
                class="w-full aspect-[4/3] lg:aspect-[21/9] object-cover mb-12 lg:mb-16"
                loading="lazy"
            />
        </div>
        <div class="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
            <div use:reveal={{ preset: "fade-up" }}>
                <h2 class="text-3xl lg:text-5xl font-serif mb-3">
                    {$t("manifesto.scenography.title")}
                </h2>
                <p class="text-dark-400 text-lg lg:text-xl mb-10">
                    {$t("manifesto.scenography.tagline")}
                </p>
                <p class="text-dark-700 text-base lg:text-lg leading-relaxed max-w-prose">
                    {$t("manifesto.scenography.body")}
                </p>
            </div>
            <div use:reveal={{ preset: "fade-up", delay: 150 }}>
                <ul class="flex flex-col gap-0">
                    {#each servicePoints as i}
                        <li class="flex items-start gap-5 border-t border-dark-100 py-5">
                            <span class="text-dark-300 mt-0.5 shrink-0">—</span>
                            <span class="text-dark-700 text-sm lg:text-base">
                                {$t(`manifesto.scenography.point${i}`)}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
    </section>

    <!-- Service 03: Creative Production -->
    <section class="mb-32 lg:mb-56">
        <div use:reveal={{ preset: "fade-up" }}>
            <p class="uppercase text-dark-300 text-xxs tracking-widest mb-6">
                {$t("manifesto.production.number")}
            </p>
            <img
                src="https://picsum.photos/seed/germinal-production/1600/700"
                alt={$t("manifesto.production.imageAlt")}
                class="w-full aspect-[4/3] lg:aspect-[21/9] object-cover mb-12 lg:mb-16"
                loading="lazy"
            />
        </div>
        <div class="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
            <div use:reveal={{ preset: "fade-up" }}>
                <h2 class="text-3xl lg:text-5xl font-serif mb-3">
                    {$t("manifesto.production.title")}
                </h2>
                <p class="text-dark-400 text-lg lg:text-xl mb-10">
                    {$t("manifesto.production.tagline")}
                </p>
                <p class="text-dark-700 text-base lg:text-lg leading-relaxed max-w-prose">
                    {$t("manifesto.production.body")}
                </p>
            </div>
            <div use:reveal={{ preset: "fade-up", delay: 150 }}>
                <ul class="flex flex-col gap-0">
                    {#each servicePoints as i}
                        <li class="flex items-start gap-5 border-t border-dark-100 py-5">
                            <span class="text-dark-300 mt-0.5 shrink-0">—</span>
                            <span class="text-dark-700 text-sm lg:text-base">
                                {$t(`manifesto.production.point${i}`)}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
    </section>

    <!-- Approach / closing -->
    <section class="border-t border-dark-100 pt-16 lg:pt-24" use:reveal={{ preset: "fade-up" }}>
        <div class="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-24">
            <div>
                <h2 class="text-2xl lg:text-3xl font-serif">
                    {$t("manifesto.approach.title")}
                </h2>
            </div>
            <p class="text-dark-700 text-base lg:text-lg leading-relaxed max-w-prose">
                {$t("manifesto.approach.body")}
            </p>
        </div>
    </section>

</div>
