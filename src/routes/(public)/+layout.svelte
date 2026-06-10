<script lang="ts">
    import Navigation from "$lib/components/Navigation.svelte";
    import type { LayoutData } from "./$types";
    import { Instagram } from "lucide-svelte";
    import { t } from 'svelte-i18n';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { invalidateAll } from '$app/navigation';

    let { data, children }: { data: LayoutData; children: any } = $props();

    // Handle bfcache (back-forward cache) to ensure fresh data when returning from admin subdomain
    onMount(() => {
        if (!browser) return;

        const handlePageShow = (event: PageTransitionEvent) => {
            // If page is being restored from bfcache, invalidate all data to ensure fresh state
            if (event.persisted) {
                invalidateAll();
            }
        };

        window.addEventListener('pageshow', handlePageShow);

        return () => {
            window.removeEventListener('pageshow', handlePageShow);
        };
    });
</script>

<div class="min-h-screen flex flex-col">
    <Navigation hasSpotlightEvent={data.hasSpotlightEvent} />

    <main class="flex-1">
        {@render children()}
    </main>

    <footer class="bg-foreground text-white/80 pt-16 pb-8 mt-12">
        <div class="container mx-auto px-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-12 pb-12 border-b border-white/10">
                <div class="flex flex-col gap-4">
                    <a href="/" class="text-xl font-medium font-serif uppercase text-white w-fit">
                        Germinal
                    </a>
                    <p class="text-white/40 text-sm max-w-xs leading-relaxed">
                        {$t('footer.tagline')}
                    </p>
                    <div class="mt-2 flex flex-col gap-1.5">
                        <p class="uppercase text-white/30 text-[10px] tracking-widest">
                            {$t('footer.contactLabel')}
                        </p>
                        <a
                            href="mailto:contact@germinalstudio.co"
                            class="text-white/60 hover:text-white text-sm transition-colors w-fit"
                        >
                            contact@germinalstudio.co
                        </a>
                    </div>
                    <a
                        class="mt-2 flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors w-fit"
                        target="_blank"
                        href="https://www.instagram.com/Germinal.studio/"
                        rel="noopener noreferrer"
                    >
                        <Instagram class="w-3.5 h-3.5" />
                        <span>@Germinal.studio</span>
                    </a>
                </div>

                <div class="flex flex-col gap-4">
                    <p class="uppercase text-white/30 text-[10px] tracking-widest">
                        {$t('footer.explore')}
                    </p>
                    <nav class="flex flex-col gap-3">
                        <a href="/manifesto" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('nav.manifesto')}
                        </a>
                        <a href="/events" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('nav.events')}
                        </a>
                        <a href="/talents" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('nav.talents')}
                        </a>
                        <a href="/contact" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('nav.contact')}
                        </a>
                    </nav>
                </div>

                <div class="flex flex-col gap-4">
                    <p class="uppercase text-white/30 text-[10px] tracking-widest">
                        {$t('footer.legal')}
                    </p>
                    <nav class="flex flex-col gap-3">
                        <a href="/legal/privacy" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('footer.privacyPolicy')}
                        </a>
                        <a href="/legal/terms" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('footer.termsOfSale')}
                        </a>
                        <a href="/legal/mentions" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('footer.mentionsLegales')}
                        </a>
                        <a href="/faq" class="text-white/60 hover:text-white text-sm transition-colors w-fit">
                            {$t('footer.faq')}
                        </a>
                    </nav>
                </div>
            </div>

            <div class="pt-6 text-white/30 text-xs">
                <p>&copy; {new Date().getFullYear()} Germinal. {$t('footer.allRightsReserved')}</p>
            </div>
        </div>
    </footer>
</div>
