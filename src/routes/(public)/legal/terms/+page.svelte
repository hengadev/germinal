<script lang="ts">
    import { t } from "svelte-i18n";
</script>

<svelte:head>
    <title>{$t("legal.terms.pageTitle")}</title>
</svelte:head>

<div>
    <h1 class="text-3xl md:text-4xl font-serif mb-4">{$t("legal.terms.title")}</h1>
    <p class="text-dark-400 text-sm mb-12">{$t("legal.lastUpdated", { date: "2026-05-23" })}</p>

    <div class="grid gap-10 text-dark-700 leading-relaxed">
        <!-- Intro -->
        <p>{$t("legal.terms.intro")}</p>

        <!-- 1. Offer and Acceptance -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.offerTitle")}</h2>
            <p>{$t("legal.terms.offerBody")}</p>
        </section>

        <!-- 2. Pricing -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.pricingTitle")}</h2>
            <p>{$t("legal.terms.pricingBody")}</p>
        </section>

        <!-- 3. Payment -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.paymentTitle")}</h2>
            <p>{$t("legal.terms.paymentBody")}</p>
        </section>

        <!-- 4. Cancellation -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.cancellationTitle")}</h2>
            <p>{$t("legal.terms.cancellationBody")}</p>
        </section>

        <!-- 5. Liability -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.liabilityTitle")}</h2>
            <p>{$t("legal.terms.liabilityBody")}</p>
        </section>

        <!-- 6. Governing Law -->
        <section class="grid gap-3">
            <h2 class="text-xl font-serif text-dark-900">{$t("legal.terms.governingTitle")}</h2>
            <p>{$t("legal.terms.governingBody")}</p>
        </section>
    </div>
</div>
