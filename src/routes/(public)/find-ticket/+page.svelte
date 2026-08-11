<script lang="ts">
    import { Ticket, CheckCircle, AlertCircle, ArrowRight } from "lucide-svelte";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import { page } from "$app/state";

    let email = $state("");
    let honeypot = $state("");
    let isSubmitting = $state(false);
    let submitted = $state(false);
    let errorMessage = $state<string | null>(null);

    async function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        if (isSubmitting) return;

        errorMessage = null;

        if (!email.trim()) {
            errorMessage = $t("findTicket.form.emailRequired");
            return;
        }

        isSubmitting = true;

        try {
            const response = await fetch("/api/tickets/find", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": page.data.csrfToken,
                },
                body: JSON.stringify({ email, honeypot }),
            });

            if (response.status === 429) {
                errorMessage = $t("findTicket.form.rateLimited");
                return;
            }

            if (!response.ok) {
                errorMessage = $t("findTicket.form.error");
                return;
            }

            // The endpoint returns the same success response whether or not a
            // matching reservation exists — this UI never branches on that.
            submitted = true;
        } catch {
            errorMessage = $t("findTicket.form.error");
        } finally {
            isSubmitting = false;
        }
    }

    function resetForm() {
        submitted = false;
        email = "";
        errorMessage = null;
    }
</script>

<svelte:head>
    <title>{$t("findTicket.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-3xl">
    <div class="mb-12 lg:mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <div
            class="flex items-center justify-center w-12 h-12 rounded-full border border-border-input-hover mb-2"
        >
            <Ticket class="w-5 h-5 text-foreground-alt" />
        </div>
        <h1 class="text-3xl lg:text-4xl font-serif">
            {$t("findTicket.title")}
        </h1>
        <p class="text-muted-foreground text-base lg:text-lg max-w-140">
            {$t("findTicket.description")}
        </p>
    </div>

    <section use:reveal={{ preset: "fade-up", delay: 100 }}>
        {#if submitted}
            <div
                class="flex items-start gap-3 p-4 md:p-6 bg-green-50 border border-green-200 rounded-lg"
            >
                <CheckCircle
                    class="text-green-600 shrink-0 w-5 h-5 mt-0.5"
                />
                <div class="grid gap-2">
                    <p class="text-green-800 text-sm md:text-base">
                        {$t("findTicket.success.message")}
                    </p>
                    <button
                        type="button"
                        onclick={resetForm}
                        class="text-green-800 underline underline-offset-2 text-sm w-fit hover:text-green-900"
                    >
                        {$t("findTicket.success.tryAnother")}
                    </button>
                </div>
            </div>
        {:else}
            <form onsubmit={handleSubmit} class="space-y-6 md:space-y-8" novalidate>
                {#if errorMessage}
                    <div
                        class="flex items-start gap-3 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg text-sm md:text-base"
                    >
                        <AlertCircle
                            class="text-red-600 shrink-0 w-4.5 h-4.5 md:w-5 md:h-5"
                        />
                        <p class="text-red-800">{errorMessage}</p>
                    </div>
                {/if}

                <div
                    style="position: absolute; left: -5000px;"
                    aria-hidden="true"
                >
                    <label for="website">Website</label>
                    <input
                        type="text"
                        id="website"
                        name="website"
                        tabindex="-1"
                        autocomplete="off"
                        bind:value={honeypot}
                    />
                </div>

                <div class="grid gap-2">
                    <label
                        for="email"
                        class="block text-xs md:text-sm font-medium text-foreground-alt mb-2"
                    >
                        {$t("findTicket.form.email")}
                        <span class="text-red-500">*</span>
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        autocomplete="email"
                        placeholder={$t("findTicket.form.emailPlaceholder")}
                        bind:value={email}
                        class="w-full px-3 md:px-4 py-2 text-base md:text-sm border-b border-b-border-input-hover focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-border"
                    />
                </div>

                <div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        class="flex gap-3 md:gap-4 items-center justify-center bg-foreground text-white py-3 md:py-4 px-6 md:px-8 rounded-none hover:bg-foreground-alt transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
                    >
                        <p class="text-sm md:text-base">
                            {isSubmitting
                                ? $t("findTicket.form.sending")
                                : $t("findTicket.form.send")}
                        </p>
                        <ArrowRight class="w-4 h-4" />
                    </button>
                </div>
            </form>
        {/if}
    </section>
</div>
