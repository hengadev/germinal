<script lang="ts">
    import EventDetailLayout from "$lib/components/EventDetailLayout.svelte";
    import EventGallery from "$lib/components/EventGallery.svelte";
    import SessionSelector from "$lib/components/booking/SessionSelector.svelte";
    import type { PageData } from "./$types";
    import { reveal } from "$lib/actions/reveal";
    import { t, locale } from "svelte-i18n";
    import { formatCurrency } from "$lib/utils/currency";
    import { depositRuleOf, isFullPayment, priceReservation } from "$lib/utils/pricing";
    import { refundPolicyOf } from "$lib/utils/refund-policy";

    let { data }: { data: PageData } = $props();

    // The page only loads when Event access lets the viewer see the Event
    // (issue 030); the Seatings section shows while one has not started.
    const canBook = $derived(data.sessions.some((s: { isPast: boolean }) => !s.isPast));

    function getEventTitle(): string {
        return ($locale === "en" ? data.event.titleEn : data.event.titleFr) || "";
    }

    // A Service's price per guest (issue 022): shown once per Service.
    function formatServicePrice(amount: number | null, currency: string): string {
        if (amount === null) return $t("events.priceToBeAnnounced");
        if (amount === 0) return $t("events.free");
        return formatCurrency(amount, currency, $locale === "fr" ? "fr-FR" : "en-US");
    }

    // The Event's Deposit rule (issue 023): what one guest pays online for
    // a Service's price, shown under it unless the whole price is paid online.
    const deposit = $derived(depositRuleOf(data.event));
    // Its Refund Policy (issue 027), shown at the booking step.
    const refundPolicy = $derived(refundPolicyOf(data.event));

    function depositNote(amount: number | null, currency: string): string | null {
        if (amount === null || amount === 0 || isFullPayment(deposit)) return null;
        const price = priceReservation({ unitPrice: amount, seats: 1, deposit });
        if (price.balance === 0) return null;
        if (price.deposit === 0) return $t("events.noDepositNote");
        return $t("events.depositPerGuest", {
            values: { amount: formatCurrency(price.deposit, currency, $locale === "fr" ? "fr-FR" : "en-US") },
        });
    }

    function localized(en: string | null, fr: string | null): string {
        return ($locale === "en" ? en : fr) ?? "";
    }

    function formatDay(date: string): string {
        // Day keys are UTC calendar dates — render them in the reader's locale
        return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(
            $locale === "fr" ? "fr-FR" : "en-US",
            { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
        );
    }
</script>

<EventDetailLayout event={data.event}>
    {#if canBook}
        <section class="mt-12 lg:mt-16" use:reveal={{ preset: "fade-up", delay: 250 }}>
            <h2 class="text-2xl lg:text-3xl font-serif mb-6 lg:mb-8">{$t("events.bookTickets")}</h2>
            <div class="flex flex-col gap-10 lg:gap-14">
                {#each data.schedule as day (day.date)}
                    <article>
                        <h3 class="font-serif text-xl lg:text-2xl pb-4 border-b border-border-card">
                            {formatDay(day.date)}
                        </h3>
                        {#each day.services as service (service.kind)}
                            <div class="mt-6 lg:mt-8">
                                <p class="uppercase text-xxs tracking-widest text-muted-foreground mb-4">
                                    {$t(service.kind === "lunch" ? "events.lunch" : "events.dinner")}
                                </p>
                                <div
                                    class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10"
                                >
                                    {#if service.menu}
                                        <div class="min-w-0">
                                            <p class="text-lg lg:text-xl leading-snug">
                                                {localized(service.menu.nameEn, service.menu.nameFr)}
                                            </p>
                                            {#if localized(service.menu.descriptionEn, service.menu.descriptionFr)}
                                                <p class="mt-2 text-sm leading-relaxed text-muted-foreground max-w-[60ch] whitespace-pre-line">
                                                    {localized(service.menu.descriptionEn, service.menu.descriptionFr)}
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}
                                    <div class="shrink-0 sm:text-right {service.menu ? '' : 'sm:ml-auto'}">
                                        <p class="flex items-baseline gap-2 sm:justify-end">
                                            <span class="font-mono text-base lg:text-lg">
                                                {formatServicePrice(service.priceAmount, service.currency)}
                                            </span>
                                            {#if service.priceAmount !== null && service.priceAmount > 0}
                                                <span class="text-xs text-muted-foreground">{$t("events.perGuest")}</span>
                                            {/if}
                                        </p>
                                        {#if depositNote(service.priceAmount, service.currency)}
                                            <p class="mt-1 text-xs text-muted-foreground">
                                                {depositNote(service.priceAmount, service.currency)}
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                                <SessionSelector
                                    sessions={service.sessions}
                                    eventTitle={getEventTitle()}
                                    eventSlug={data.event.slug}
                                    {deposit}
                                    {refundPolicy}
                                />
                            </div>
                        {/each}
                    </article>
                {/each}
            </div>
        </section>
    {/if}

    {#if data.event.media && data.event.media.length > 0}
        <section
            class="mt-8 lg:mt-12"
            use:reveal={{ preset: "fade-up", delay: 200 }}
        >
            <h2 class="text-2xl lg:text-3xl font-serif mb-4 lg:mb-6">{$t("events.gallery")}</h2>
            <EventGallery media={data.event.media} />
        </section>
    {/if}
</EventDetailLayout>
