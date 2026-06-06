<script lang="ts">
    import { t } from "svelte-i18n";
</script>

<svelte:head>
    <title>{$t("legal.mentions.pageTitle")}</title>
</svelte:head>

<div>
    <h1 class="text-3xl md:text-4xl font-serif mb-4">{$t("legal.mentions.title")}</h1>
    <p class="text-dark-400 text-sm mb-12">{$t("legal.lastUpdated", { date: "2026-05-27" })}</p>

    <div class="grid gap-10 text-dark-700 leading-relaxed">
        <!-- 1. Publisher -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.mentions.publisherTitle")}</h2>
            <p>{$t("legal.mentions.publisherBody")}</p>
            <div class="pl-4 border-l-2 border-dark-200 grid gap-1">
                <p class="font-medium text-dark-900">{$t("legal.mentions.publisherName")}</p>
                <p class="text-red-600 font-medium">{$t("legal.mentions.publisherAddress")}</p>
                <p>{$t("legal.mentions.publisherEmail")}</p>
                <p class="text-red-600 font-medium">{$t("legal.mentions.publisherDirector")}</p>
            </div>
        </section>

        <!-- 2. Hosting -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.mentions.hostingTitle")}</h2>
            <p>{$t("legal.mentions.hostingBody")}</p>
            <div class="pl-4 border-l-2 border-dark-200 grid gap-1">
                <p class="text-red-600 font-medium">{$t("legal.mentions.hostingName")}</p>
                <p class="text-red-600 font-medium">{$t("legal.mentions.hostingAddress")}</p>
            </div>
        </section>

        <!-- 3. Intellectual Property -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.mentions.ipTitle")}</h2>
            <p>{$t("legal.mentions.ipBody")}</p>
        </section>

        <!-- 4. Personal Data -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.mentions.dataTitle")}</h2>
            <p>
                {$t("legal.mentions.dataBody")}
                {" "}
                <a href="/legal/privacy" class="underline text-dark-900 hover:text-dark-600 transition-colors">
                    {$t("footer.privacyPolicy")}
                </a>.
            </p>
        </section>
    </div>
</div>
