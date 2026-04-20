<script lang="ts">
    import {
        ArrowRight,
        Instagram,
        Globe,
        CheckCircle,
        AlertCircle,
    } from "lucide-svelte";
    import { enhance } from "$app/forms";
    import type { ActionData } from "./$types";
    import { t } from "svelte-i18n";
    import { reveal } from "$lib/actions/reveal";
    import { page } from "$app/state";

    let { form }: { form: ActionData } = $props();

    const filterKeys = ["collaboration", "newProject", "joinRoster", "other"];
    const filterValues = [
        "collaboration",
        "new_project",
        "join_roster",
        "other",
    ];
    let filters = $derived(
        filterKeys.map((key) => $t(`contact.filters.${key}`)),
    );
    let selectedIndex = $state(0);
    let isSubmitting = $state(false);

    interface Link {
        href: string;
        Icon: typeof import("lucide-svelte").Icon;
    }

    let links: Link[] = [
        { href: "https://www.instagram.com/Germinal.studio/", Icon: Instagram },
        { href: "https://germinalstudio.co", Icon: Globe },
    ];

    function getInquiryTypeValue(): string {
        return filterValues[selectedIndex];
    }

    // Helper to get form data value safely
    function getFormDataValue(key: string): string {
        if (form && "formData" in form && form.formData) {
            const value = form.formData[key as keyof typeof form.formData];
            return typeof value === "string" ? value : "";
        }
        return "";
    }

    // Helper to get field error safely
    function getFieldError(key: string): string | undefined {
        if (form && "fieldErrors" in form && form.fieldErrors) {
            const errors =
                form.fieldErrors[key as keyof typeof form.fieldErrors];
            return Array.isArray(errors) && errors.length > 0
                ? errors[0]
                : undefined;
        }
        return undefined;
    }

    // Helper to check if field has error
    function hasFieldError(key: string): boolean {
        return getFieldError(key) !== undefined;
    }
</script>

<svelte:head>
    <title>{$t("contact.pageTitle")}</title>
</svelte:head>

{#snippet asidePart(title: string, content: string)}
    <div>
        <p class="uppercase text-dark-300 text-xxs md:text-xs">{title}</p>
        <p class="text-dark-800 font-bold text-sm md:text-base">{content}</p>
    </div>
{/snippet}

{#snippet tag(content: string, index: number)}
    <button
        type="button"
        class="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base text-dark-500 cursor-pointer border border-dark-300 rounded-full {selectedIndex ===
        index
            ? `bg-dark-900 text-white`
            : ``}"
        onclick={() => (selectedIndex = index)}
    >
        <p class="capitalize">{content}</p>
    </button>
{/snippet}

<div class="container mx-auto px-4 py-32 max-w-8xl">
    <div class="mb-8 lg:mb-16 grid gap-4" use:reveal={{ preset: "fade-down" }}>
        <h1 class="text-3xl lg:text-4xl font-normal">{$t("contact.title")}</h1>
        <p class="text-dark-400 text-base lg:text-lg max-w-160">
            {$t("contact.description")}
        </p>
    </div>

    <div
        class="mt-12 lg:mt-24 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-12 lg:gap-24"
    >
        <section
            class="flex flex-col gap-6 lg:gap-12"
            use:reveal={{ preset: "fade-up", delay: 100 }}
        >
            <div class="grid gap-6 lg:gap-8">
                {@render asidePart(
                    $t("contact.sidebar.generalInquiries"),
                    "contact@germinalstudio.co",
                )}
                {@render asidePart(
                    $t("contact.sidebar.pressMedia"),
                    "contact@germinalstudio.co",
                )}
                <div class="grid gap-2">
                    <p class="uppercase text-dark-300 text-xxs md:text-xs">
                        {$t("contact.sidebar.followUs")}
                    </p>
                    <div class="flex items-center gap-3 md:gap-4">
                        {#each links as link}
                            <a
                                href={link.href}
                                target="_blank"
                                class="rounded-full p-1.5 md:p-2 border border-dark-100"
                                rel="noopener noreferrer"
                            >
                                <link.Icon class="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </a>
                        {/each}
                    </div>
                </div>
            </div>
        </section>

        <section class="grid gap-6 lg:gap-8">
            {#if form?.success}
                <div
                    class="flex items-start gap-3 p-3 md:p-4 bg-green-50 border border-green-200 rounded-lg text-sm md:text-base"
                >
                    <CheckCircle
                        class="text-green-600 shrink-0 w-4.5 h-4.5 md:w-5 md:h-5"
                    />
                    <p class="text-green-800">{form.message}</p>
                </div>
            {/if}

            {#if form?.error}
                <div
                    class="flex items-start gap-3 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg text-sm md:text-base"
                >
                    <AlertCircle
                        class="text-red-600 shrink-0 w-4.5 h-4.5 md:w-5 md:h-5"
                    />
                    <p class="text-red-800">{form.error}</p>
                </div>
            {/if}

            <div
                class="grid gap-4"
                use:reveal={{ preset: "fade-up", delay: 150 }}
            >
                <p class="text-sm lg:text-base">{$t("contact.regarding")}</p>
                <div class="flex flex-wrap items-center gap-3">
                    {#each filters as filter, index}
                        {@render tag(filter, index)}
                    {/each}
                </div>
            </div>

            <form
                method="POST"
                class="space-y-8 md:space-y-12 mt-6 md:mt-8"
                use:enhance={() => {
                    isSubmitting = true;
                    return async ({ update }) => {
                        await update();
                        isSubmitting = false;
                    };
                }}
            >
                <input
                    type="hidden"
                    name="csrf_token"
                    value={page.data.csrfToken}
                />
                <input
                    type="hidden"
                    name="inquiryType"
                    value={getInquiryTypeValue()}
                />

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
                    />
                </div>

                <div
                    class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16"
                    use:reveal={{ preset: "fade-up", delay: 200 }}
                >
                    <div class="grid gap-2">
                        <label
                            for="name"
                            class="block text-xs md:text-sm font-medium text-dark-700 mb-2"
                        >
                            {$t("contact.form.name")}
                            <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            required
                            value={getFormDataValue("name")}
                            class="w-full px-3 md:px-4 py-2 text-base md:text-sm border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                                'name',
                            )
                                ? 'border-b-red-500'
                                : ''}"
                        />
                        {#if getFieldError("name")}
                            <p class="text-red-500 text-xs md:text-sm">
                                {getFieldError("name")}
                            </p>
                        {/if}
                    </div>

                    <div class="grid gap-2">
                        <label
                            for="email"
                            class="block text-xs md:text-sm font-medium text-dark-700 mb-2"
                        >
                            {$t("contact.form.email")}
                            <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            value={getFormDataValue("email")}
                            class="w-full px-3 md:px-4 py-2 text-base md:text-sm border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                                'email',
                            )
                                ? 'border-b-red-500'
                                : ''}"
                        />
                        {#if getFieldError("email")}
                            <p class="text-red-500 text-xs md:text-sm">
                                {getFieldError("email")}
                            </p>
                        {/if}
                    </div>
                </div>

                <div use:reveal={{ preset: "fade-up", delay: 250 }}>
                    <label
                        for="company"
                        class="block text-xs md:text-sm font-medium text-dark-700 mb-2"
                    >
                        {$t("contact.form.company")}
                    </label>
                    <input
                        type="text"
                        id="company"
                        name="company"
                        value={getFormDataValue("company")}
                        class="w-full px-3 md:px-4 py-2 text-base md:text-sm border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                            'company',
                        )
                            ? 'border-b-red-500'
                            : ''}"
                    />
                    {#if getFieldError("company")}
                        <p class="text-red-500 text-xs md:text-sm">
                            {getFieldError("company")}
                        </p>
                    {/if}
                </div>

                <div use:reveal={{ preset: "fade-up", delay: 300 }}>
                    <label
                        for="message"
                        class="block text-xs md:text-sm font-medium text-dark-700 mb-2"
                    >
                        {$t("contact.form.message")}
                        <span class="text-red-500">*</span>
                    </label>
                    <textarea
                        id="message"
                        name="message"
                        rows="5"
                        required
                        value={getFormDataValue("message")}
                        class="w-full px-3 md:px-4 py-2 text-base md:text-sm border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                            'message',
                        )
                            ? 'border-b-red-500'
                            : ''}"
                    ></textarea>
                    {#if getFieldError("message")}
                        <p class="text-red-500 text-xs md:text-sm">
                            {getFieldError("message")}
                        </p>
                    {/if}
                </div>

                <div use:reveal={{ preset: "fade-up", delay: 350 }}>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        class="flex gap-3 md:gap-4 items-center justify-center bg-dark-900 text-white py-3 md:py-4 px-6 md:px-8 rounded-full hover:bg-dark-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
                    >
                        <p class="text-sm md:text-base">
                            {isSubmitting
                                ? $t("contact.form.sending")
                                : $t("contact.form.send")}
                        </p>
                        <ArrowRight class="w-4 h-4" />
                    </button>
                </div>
            </form>
        </section>
    </div>
</div>
