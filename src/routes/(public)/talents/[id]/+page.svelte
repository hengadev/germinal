<script lang="ts">
import {Instagram, Globe, Mail} from "lucide-svelte"
    import EventGallery from "$lib/components/EventGallery.svelte";
import type {Component} from "svelte"
    import type { PageData } from "./$types";
    import { t } from 'svelte-i18n';

    let { data }: { data: PageData } = $props();

    let socialLinks = $derived(
        data.talent.socialLinks ? JSON.parse(data.talent.socialLinks) : {},
    );

    let specializations = $derived(
        data.talent.specializations
            ? JSON.parse(data.talent.specializations)
            : []
    );
</script>

<svelte:head>
    <title>{data.talent.firstName} {data.talent.lastName} | Germinal</title>
    <meta name="description" content={data.talent.bio.slice(0, 160)} />
</svelte:head>

{#snippet socialLinksIcon(href: string, Icon: Component)}
    <div class="text-dark-400 hover:text-dark-700 rounded-full border border-dark-300 hover:border-dark-700 p-2">
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
        >
            <Icon size={16}/>
        </a>
    </div>
{/snippet}

<article class="container mx-auto px-4 py-32 max-w-8xl">
    <div class="flex flex-col md:flex-row gap-12 mb-8">
        <div class="flex flex-col gap-6">
            {#if data.talent.profileMedia}
                <div class="w-96 aspect-3/4 flex-shrink-0">
                    <img
                        src={data.talent.profileMedia.url}
                        alt="{data.talent.firstName} {data.talent.lastName}"
                        class="w-full h-full object-cover"
                    />
                </div>
            {:else}
                <div
                    class="w-96 aspect-3/4 flex-shrink-0 bg-dark-200 rounded-lg flex items-center justify-center"
                >
                    <span class="text-dark-400 text-6xl">👤</span>
                </div>
            {/if}
            {#if Object.keys(socialLinks).length > 0}
                <div class="flex items-center gap-4">
                    {#if socialLinks.instagram}
                        {@render socialLinksIcon(socialLinks.instagram, Instagram)}
                    {/if}
                    {#if socialLinks.website}
                        {@render socialLinksIcon(socialLinks.website, Globe)}
                    {/if}
                    {#if socialLinks.email}
                        {@render socialLinksIcon(socialLinks.email, Mail)}
                    {/if}
                </div>
            {/if}
        </div>
        <div class="flex-1">
            <div class="flex justify-between items-end">
                <div class="grid gap-2">
                    <h1 class="text-5xl font-bold mb-2">
                        {data.talent.firstName}
                        {data.talent.lastName}
                    </h1>
                    <p class="text-xl text-dark-500 mb-4">{data.talent.role}</p>
                </div>
                {#if data.talent.city || data.talent.country}
                    <div>
                        <p class="text-dark-300">{$t('talents.basedIn')}</p>
                        <p class="text-dark-800">
                            {#if data.talent.city && data.talent.country}
                                {data.talent.city}, {data.talent.country}
                            {:else if data.talent.city}
                                {data.talent.city}
                            {:else}
                                {data.talent.country}
                            {/if}
                        </p>
                    </div>
                {/if}
            </div>
            <div class="my-8 border border-dark-50/60 w-full"></div>
            <div class="grid gap-4">
                {#if data.talent.quote}
                    <p class="text-lg text-dark-900 leading-relaxed font-medium">"{data.talent.quote}"</p>
                {/if}
                <p class="text-normal text-dark-500 leading-relaxed">
                    {data.talent.bio}
                    {data.talent.bio}
                    {data.talent.bio}
                </p>
                <p class="text-normal text-dark-500 leading-relaxed">
                    {data.talent.bio}
                    {data.talent.bio}
                    {data.talent.bio}
                </p>

                <p class="text-normal text-dark-500 leading-relaxed">
                    {data.talent.bio}
                </p>
                {#if specializations.length > 0}
                    <div class="my-8 border border-dark-50/60 w-full"></div>
                    <div class="grid grid-cols-3 gap-4">
                        {#each specializations as spec}
                            <div class="grid gap-2">
                                <p class="text-dark-400 uppercase text-sm">{$t('talents.specialization')}</p>
                                <p class="text-dark-900 text-sm font-medium">{spec}</p>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if data.talent.media && data.talent.media.length > 0}
        <section class="mt-12">
            <h2 class="text-3xl font-bold mb-6">{$t('talents.gallery')}</h2>
            <EventGallery media={data.talent.media} />
        </section>
    {/if}
</article>
