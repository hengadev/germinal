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

    let { form }: { form: ActionData } = $props();

    let filters: string[] = [
        "Collaboration",
        "New Project",
        "Join Roster",
        "Other",
    ];
    let selected = $state("Collaboration");
    let isSubmitting = $state(false);

    interface Link {
        href: string;
        Icon: typeof import("lucide-svelte").Icon;
    }

    let links: Link[] = [
        { href: "https://www.instagram.com/Germinal.studio/", Icon: Instagram },
        { href: "https://germinalstudio.co", Icon: Globe },
    ];

    function getInquiryTypeValue(displayName: string): string {
        const map: Record<string, string> = {
            Collaboration: "collaboration",
            "New Project": "new_project",
            "Join Roster": "join_roster",
            Other: "other",
        };
        return map[displayName] || "other";
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
    <title>Contact | Germinal</title>
</svelte:head>

{#snippet asidePart(title: string, content: string)}
    <div>
        <p class="uppercase text-dark-300 text-xs">{title}</p>
        <p class="text-dark-800 font-bold">{content}</p>
    </div>
{/snippet}

{#snippet tag(content: string)}
    <button
        type="button"
        class="px-4 py-2 text-dark-500 cursor-pointer border border-dark-300 rounded-full {selected ===
        content
            ? `bg-dark-900 text-white`
            : ``}"
        onclick={() => (selected = content)}
    >
        <p class="capitalize">{content}</p>
    </button>
{/snippet}

<div class="container mx-auto px-4 py-32 max-w-8xl">
    <div class="mb-16 grid gap-4">
        <h1 class="text-4xl font-normal">Get in touch.</h1>
        <p class="text-dark-400 text-lg w-160">
            We are always looking for new talents, collaborators, and
            architectural projects. Reach out to start a conversation.
        </p>
    </div>

    <div class="mt-24 grid grid-cols-[auto_1fr] gap-24">
        <section class="min-w-100 flex flex-col gap-12">
            <div class="grid gap-8">
                {@render asidePart("general inquiries", "events@germinal.co")}
                {@render asidePart("press & media", "events@germinal.co")}
                <div class="grid gap-2">
                    <p class="uppercase text-dark-300 text-xs">Follow us</p>
                    <div class="flex items-center gap-4">
                        {#each links as link}
                            <a
                                href={link.href}
                                target="_blank"
                                class="rounded-full p-2 border border-dark-100"
                                rel="noopener noreferrer"
                            >
                                <link.Icon size={16} />
                            </a>
                        {/each}
                    </div>
                </div>
            </div>
        </section>

        <section class="grid gap-8">
            {#if form?.success}
                <div
                    class="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg"
                >
                    <CheckCircle
                        class="text-green-600 flex-shrink-0"
                        size={20}
                    />
                    <p class="text-green-800">{form.message}</p>
                </div>
            {/if}

            {#if form?.error}
                <div
                    class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                    <AlertCircle class="text-red-600 flex-shrink-0" size={20} />
                    <p class="text-red-800">{form.error}</p>
                </div>
            {/if}

            <div class="grid gap-4">
                <p>What is this regarding?</p>
                <div class="flex items-center gap-4">
                    {#each filters as filter}
                        {@render tag(filter)}
                    {/each}
                </div>
            </div>

            <form
                method="POST"
                class="space-y-12 mt-8"
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
                    name="inquiryType"
                    value={getInquiryTypeValue(selected)}
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

                <div class="grid grid-cols-2 gap-16">
                    <div class="grid gap-2">
                        <label
                            for="name"
                            class="block text-sm font-medium text-dark-700 mb-2"
                        >
                            Name <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            required
                            value={getFormDataValue("name")}
                            class="w-full px-4 py-2 border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                                'name',
                            )
                                ? 'border-b-red-500'
                                : ''}"
                        />
                        {#if getFieldError("name")}
                            <p class="text-red-500 text-sm">
                                {getFieldError("name")}
                            </p>
                        {/if}
                    </div>

                    <div class="grid gap-2">
                        <label
                            for="email"
                            class="block text-sm font-medium text-dark-700 mb-2"
                        >
                            Email <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            value={getFormDataValue("email")}
                            class="w-full px-4 py-2 border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                                'email',
                            )
                                ? 'border-b-red-500'
                                : ''}"
                        />
                        {#if getFieldError("email")}
                            <p class="text-red-500 text-sm">
                                {getFieldError("email")}
                            </p>
                        {/if}
                    </div>
                </div>

                <div>
                    <label
                        for="company"
                        class="block text-sm font-medium text-dark-700 mb-2"
                    >
                        Company/Organization (optional)
                    </label>
                    <input
                        type="text"
                        id="company"
                        name="company"
                        value={getFormDataValue("company")}
                        class="w-full px-4 py-2 border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                            'company',
                        )
                            ? 'border-b-red-500'
                            : ''}"
                    />
                    {#if getFieldError("company")}
                        <p class="text-red-500 text-sm">
                            {getFieldError("company")}
                        </p>
                    {/if}
                </div>

                <div>
                    <label
                        for="message"
                        class="block text-sm font-medium text-dark-700 mb-2"
                    >
                        Tell us about your project... <span class="text-red-500"
                            >*</span
                        >
                    </label>
                    <textarea
                        id="message"
                        name="message"
                        rows="5"
                        required
                        value={getFormDataValue("message")}
                        class="w-full px-4 py-2 border-b border-b-dark-100 focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-dark-200/80 {hasFieldError(
                            'message',
                        )
                            ? 'border-b-red-500'
                            : ''}"
                    ></textarea>
                    {#if getFieldError("message")}
                        <p class="text-red-500 text-sm">
                            {getFieldError("message")}
                        </p>
                    {/if}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    class="flex gap-4 items-center bg-dark-900 text-white py-4 px-8 rounded-full hover:bg-dark-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <p>{isSubmitting ? "Sending..." : "Send Message"}</p>
                    <ArrowRight />
                </button>
            </form>
        </section> </div>
</div>
