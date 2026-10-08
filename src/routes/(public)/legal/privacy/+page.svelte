<script lang="ts">
    import { t } from "svelte-i18n";
</script>

<svelte:head>
    <title>{$t("legal.privacy.pageTitle")}</title>
</svelte:head>

<div>
    <h1 class="text-3xl md:text-4xl font-serif mb-4">{$t("legal.privacy.title")}</h1>
    <p class="text-muted-foreground text-sm mb-12">{$t("legal.lastUpdated", { date: "2026-10-08" })}</p>

    <div class="grid gap-10 text-foreground-alt leading-relaxed">
        <!-- Intro -->
        <p>{$t("legal.privacy.intro")}</p>

        <!-- 1. Data Controller -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.controllerTitle")}</h2>
            <p>{$t("legal.privacy.controllerBody")}</p>
            <div class="pl-4 border-l-2 border-border-input grid gap-1">
                <p class="font-medium text-foreground">{$t("legal.privacy.controllerName")}</p>
                <p class="text-red-600 font-medium">{$t("legal.privacy.controllerAddress")}</p>
                <p>{$t("legal.privacy.controllerEmail")}</p>
            </div>
        </section>

        <!-- 2. Personal Data -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.dataTitle")}</h2>
            <p>{$t("legal.privacy.dataIntro")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.dataReservation")}</li>
                <li>{$t("legal.privacy.dataTechnical")}</li>
                <li>{$t("legal.privacy.dataContact")}</li>
            </ul>
        </section>

        <!-- 3. Legal Basis -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.basisTitle")}</h2>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.basisContractual")}</li>
                <li>{$t("legal.privacy.basisLegitimate")}</li>
                <li>{$t("legal.privacy.basisContact")}</li>
            </ul>
        </section>

        <!-- 4. Retention -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.retentionTitle")}</h2>
            <p>{$t("legal.privacy.retentionIntro")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.retentionReservation")}</li>
                <li>{$t("legal.privacy.retentionUnpaid")}</li>
                <li>{$t("legal.privacy.retentionWaitlist")}</li>
                <li>{$t("legal.privacy.retentionContact")}</li>
                <li>{$t("legal.privacy.retentionTechnical")}</li>
                <li>{$t("legal.privacy.retentionEmails")}</li>
                <li>{$t("legal.privacy.retentionBackups")}</li>
                <li>{$t("legal.privacy.retentionAccounting")}</li>
            </ul>
        </section>

        <!-- 5. Recipients -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.recipientsTitle")}</h2>
            <p>{$t("legal.privacy.recipientsIntro")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.recipientStripe")}</li>
                <li>{$t("legal.privacy.recipientAws")}</li>
                <li>{$t("legal.privacy.recipientTwilio")}</li>
                <li>{$t("legal.privacy.recipientHetzner")}</li>
                <li>{$t("legal.privacy.recipientCloudflare")}</li>
            </ul>
            <p>{$t("legal.privacy.recipientsTransfers")}</p>
        </section>

        <!-- 6. Rights -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.rightsTitle")}</h2>
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
            <p>{$t("legal.privacy.rightsComplaint")}</p>
        </section>

        <!-- 7. Cookies -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-foreground">{$t("legal.privacy.cookiesTitle")}</h2>
            <p>{$t("legal.privacy.cookiesIntro")}</p>
            <ul class="list-disc pl-6 grid gap-2">
                <li>{$t("legal.privacy.cookiesEssential")}</li>
                <li>{$t("legal.privacy.cookiesNonEssential")}</li>
            </ul>
            <p>{$t("legal.privacy.cookiesChoice")}</p>
        </section>
    </div>
</div>
