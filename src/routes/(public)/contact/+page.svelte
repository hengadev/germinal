<script lang="ts">
    import {ArrowRight, Instagram, Globe, Mail} from "lucide-svelte"
    let filters: string[] = ["Collaboration", "New Project", "Join Roster", "Other"]
    let selected = $state(filters[0])
    interface Link {
        href: string;
        Icon: typeof import("lucide-svelte").Icon;
    }
    let links: Link[] = [
        {href: "", Icon: Instagram},
        {href: "", Icon: Globe},
    ] 
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
            class="px-4 py-2 text-dark-500 cursor-pointer border border-dark-300 rounded-full {selected === content ? `bg-dark-900 text-white` : ``}"
            onclick={() => selected = content}
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
                {@render asidePart("general inquiries", "hello@germinal.com")}
                {@render asidePart("press & media", "press@germinal.com")}
                <div class="grid gap-2">
                    <p class="uppercase text-dark-300 text-xs">Follow us</p>
                    <div class="flex items-center gap-4">
                        {#each links as link}
                            <button 
                                class="rounded-full p-2 border border-dark-100"
                            >
                                <link.Icon size={16}/>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </section>
        <section class="grid gap-8">
            <div class="grid gap-4">
                <p>What is this regarding ?</p>
                <div class="flex items-center gap-4">
                    {#each filters as filter}
                        {@render tag(filter)}
                    {/each}
                    <p></p>
                </div>
            </div>
            <form class="space-y-6">
                <div class="grid grid-cols-2 gap-12">
                    <div class="grid gap-2">
                        <label
                            for="name"
                            class="block text-sm font-medium text-dark-700 mb-2"
                            >Name</label
                        >
                        <input
                            type="text"
                            id="name"
                            name="name"
                            required
                            class="w-full px-4 py-2 border-b-1 border-b-dark-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div class="grid gap-2">
                        <label
                            for="email"
                            class="block text-sm font-medium text-dark-700 mb-2"
                            >Email</label
                        >
                        <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            class="w-full px-4 py-2 border-b-1 border-b-dark-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label
                        for="subject"
                        class="block text-sm font-medium text-dark-700 mb-2"
                        >Company/Organization (optional)</label
                    >
                    <input
                        type="text"
                        id="subject"
                        name="subject"
                        required
                        class="w-full px-4 py-2 border-b-1 border-b-dark-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label
                        for="message"
                        class="block text-sm font-medium text-dark-700 mb-2"
                        >Tell us about your project...</label
                    >
                    <textarea
                        id="message"
                        name="message"
                        rows="5"
                        required
                        class="w-full px-4 py-2 border border-dark-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    ></textarea>
                </div>

                <button
                    type="submit"
                    class="flex gap-4 items-center bg-dark-900 text-white py-4 px-8 rounded-full hover:bg-blue-700 transition-colors font-medium"
                >
                    <p>Send Message</p>
                    <ArrowRight />
                </button>
            </form>
        </section>
    </div>
</div>
