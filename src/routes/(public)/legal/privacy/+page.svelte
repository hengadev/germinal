<script lang="ts">
    import { t } from "svelte-i18n";
</script>

<svelte:head>
    <title>{$t("legal.privacy.pageTitle")}</title>
</svelte:head>

<div>
    <h1 class="text-3xl md:text-4xl font-serif mb-4">{$t("legal.privacy.title")}</h1>
    <p class="text-dark-400 text-sm mb-12">{$t("legal.lastUpdated", { date: "2026-05-23" })}</p>

    <div class="grid gap-10 text-dark-700 leading-relaxed">
        <!-- Intro -->
        <p>{$t("legal.privacy.intro")}</p>

        <!-- 1. Data Controller -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.privacy.controllerTitle")}</h2>
            <p>{$t("legal.privacy.controllerBody")}</p>
            <div class="pl-4 border-l-2 border-dark-200 grid gap-1">
                <p class="font-medium text-dark-900">{$t("legal.privacy.controllerName")}</p>
                <p class="text-red-600 font-medium">{$t("legal.privacy.controllerAddress")}</p>
                <p>{$t("legal.privacy.controllerEmail")}</p>
            </div>
        </section>

        <!-- 2. Personal Data -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.privacy.dataTitle")}</h2>
            <p>{$t("legal.privacy.dataIntro")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.dataReservation")}</li>
                <li>{$t("legal.privacy.dataTechnical")}</li>
            </ul>
        </section>

        <!-- 3. Legal Basis -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.privacy.basisTitle")}</h2>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.basisContractual")}</li>
                <li>{$t("legal.privacy.basisLegitimate")}</li>
            </ul>
        </section>

        <!-- 4. Retention -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.privacy.retentionTitle")}</h2>
            <p>{$t("legal.privacy.retentionBody")}</p>
        </section>

        <!-- 5. Rights -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.privacy.rightsTitle")}</h2>
            <p>{$t("legal.privacy.rightsBody")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.rightAccess")}</li>
                <li>{$t("legal.privacy.rightRectification")}</li>
                <li>{$t("legal.privacy.rightErasure")}</li>
                <li>{$t("legal.privacy.rightPortability")}</li>
                <li>{$t("legal.privacy.rightObject")}</li>
                <li>{$t("legal.privacy.rightWithdraw")}</li>
            </ul>
            <p>{$t("legal.privacy.rightsExercice")}</p>
        </section>
    </div>
</div>
