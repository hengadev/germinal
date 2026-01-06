<script lang="ts">
    import EventGallery from "$lib/components/EventGallery.svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    let socialLinks = $derived(
        data.talent.socialLinks ? JSON.parse(data.talent.socialLinks) : {},
    );
</script>

<svelte:head>
    <title>{data.talent.firstName} {data.talent.lastName} | Germinal</title>
    <meta name="description" content={data.talent.bio.slice(0, 160)} />
</svelte:head>

<article class="container mx-auto px-4 py-12 max-w-4xl">
    <div class="flex flex-col md:flex-row gap-8 mb-8">
        {#if data.talent.profileMedia}
            <div class="w-48 h-48 flex-shrink-0">
                <img
                    src={data.talent.profileMedia.url}
                    alt="{data.talent.firstName} {data.talent.lastName}"
                    class="w-full h-full object-cover rounded-lg"
                />
            </div>
        {:else}
            <div
                class="w-48 h-48 flex-shrink-0 bg-gray-200 rounded-lg flex items-center justify-center"
            >
                <span class="text-gray-400 text-6xl">👤</span>
            </div>
        {/if}

        <div class="flex-1">
            <h1 class="text-5xl font-bold mb-2">
                {data.talent.firstName}
                {data.talent.lastName}
            </h1>
            <p class="text-xl text-gray-600 mb-4">{data.talent.role}</p>
            <p class="text-lg text-gray-700 leading-relaxed">
                {data.talent.bio}
            </p>

            {#if Object.keys(socialLinks).length > 0}
                <div class="mt-6 flex gap-4">
                    {#if socialLinks.instagram}
                        <a
                            href={socialLinks.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:text-blue-800"
                        >
                            Instagram
                        </a>
                    {/if}
                    {#if socialLinks.linkedin}
                        <a
                            href={socialLinks.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:text-blue-800"
                        >
                            LinkedIn
                        </a>
                    {/if}
                    {#if socialLinks.twitter}
                        <a
                            href={socialLinks.twitter}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:text-blue-800"
                        >
                            Twitter
                        </a>
                    {/if}
                    {#if socialLinks.website}
                        <a
                            href={socialLinks.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:text-blue-800"
                        >
                            Website
                        </a>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    {#if data.talent.media && data.talent.media.length > 0}
        <section class="mt-12">
            <h2 class="text-3xl font-bold mb-6">Gallery</h2>
            <EventGallery media={data.talent.media} />
        </section>
    {/if}
</article>
