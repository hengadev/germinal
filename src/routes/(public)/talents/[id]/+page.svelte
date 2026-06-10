<script lang="ts">
import {Instagram, Globe, Mail} from "lucide-svelte"
    import EventGallery from "$lib/components/EventGallery.svelte";
import type {Component} from "svelte"
    import type { PageData } from "./$types";
    import { t, locale } from 'svelte-i18n';
    import { reveal } from '$lib/actions/reveal';

    let { data }: { data: PageData } = $props();

    let socialLinks = $derived(
        data.talent.socialLinks ? JSON.parse(data.talent.socialLinks) : {},
    );

    let specializations = $derived(() => {
        const specs = $locale === 'en'
            ? (data.talent.specializationsEn || '[]')
            : (data.talent.specializationsFr || '[]');
        return JSON.parse(specs);
    });

    function getTalentField(field: 'role' | 'bio' | 'quote'): string {
        const enField = (field + 'En') as 'roleEn' | 'bioEn' | 'quoteEn';
        const frField = (field + 'Fr') as 'roleFr' | 'bioFr' | 'quoteFr';
        return $locale === 'en' ? (data.talent[enField] || '') : (data.talent[frField] || '');
    }
</script>

<svelte:head>
    <title>{data.talent.firstName} {data.talent.lastName} | Germinal</title>
    <meta name="description" content={getTalentField('bio').slice(0, 160)} />
</svelte:head>

{#snippet socialLinksIcon(href: string, Icon: Component)}
    <div class="text-muted-foreground hover:text-foreground-alt rounded-full border border-border-input hover:border-foreground-alt p-2">
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
        <div class="flex flex-col items-center md:items-start gap-6" use:reveal={{ preset: 'fade-in-scale' }}>
            {#if data.talent.profileMedia}
                <div class="w-full md:w-96 aspect-3/4 flex-shrink-0">
                    <img
                        src={data.talent.profileMedia.url}
                        alt="{data.talent.firstName} {data.talent.lastName}"
                        class="w-full h-full object-cover"
                    />
                </div>
            {:else}
                <div
                    class="w-full md:w-96 aspect-3/4 flex-shrink-0 bg-muted rounded-lg flex items-center justify-center"
                >
                    <span class="text-muted-foreground text-6xl">👤</span>
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
        <div class="flex-1" use:reveal={{ preset: 'fade-up', delay: 100 }}>
            <div class="flex justify-between items-end">
                <div class="grid gap-2">
                    <h1 class="text-5xl font-serif mb-2">
                        {data.talent.firstName}
                        {data.talent.lastName}
                    </h1>
                    <p class="text-xl text-muted-foreground mb-4">{getTalentField('role')}</p>
                </div>
                {#if data.talent.city || data.talent.country}
                    <div>
                        <p class="text-muted-foreground">{$t('talents.basedIn')}</p>
                        <p class="text-foreground-alt">
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
            <div class="my-8 border border-border-input/60 w-full"></div>
            <div class="grid gap-6">
                {#if getTalentField('quote')}
                    <p class="text-lg text-foreground leading-relaxed font-medium">"{getTalentField('quote')}"</p>
                {/if}
                <p class="font-normal text-muted-foreground leading-relaxed">
                    {getTalentField('bio')}
                </p>
                {#if data.talent.category || specializations().length > 0}
                    <div class="my-8 border border-border-input/60 w-full"></div>
                    <div class="grid gap-4">
                        {#if data.talent.category}
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-muted-foreground uppercase text-sm">{$t('talents.category')}:</span>
                                <span class="text-foreground text-sm font-medium">
                                    {$locale === 'en' ? data.talent.category.displayNameEn : data.talent.category.displayNameFr}
                                </span>
                            </div>
                        {/if}
                        {#if specializations().length > 0}
                            <div class="flex flex-wrap gap-2">
                                {#each specializations() as spec}
                                    <span class="px-3 py-1 bg-surface-hover text-foreground-alt rounded-full text-sm">
                                        {spec}
                                    </span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if data.talent.media && data.talent.media.length > 0}
        <section class="mt-12" use:reveal={{ preset: 'fade-up', delay: 200 }}>
            <h2 class="text-3xl font-serif mb-6">{$t('talents.gallery')}</h2>
            <EventGallery media={data.talent.media} />
        </section>
    {/if}
</article>
