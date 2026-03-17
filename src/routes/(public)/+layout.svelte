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

    <footer class="bg-dark-900 text-white/80 py-6 mt-12">
        <div class="container mx-auto px-4 flex items-center justify-between text-xs sm:text-sm">
            <p>
                &copy; {new Date().getFullYear()} Germinal. {$t('footer.allRightsReserved')}
            </p>
            <div class="flex gap-8">
                <a
                    class="text-white/80 hover:text-white flex items-center gap-2"
                    target="_blank"
                    href="https://www.instagram.com/Germinal.studio/"
                    rel="noopener noreferrer"
                >
                    <Instagram class="w-3 h-3 sm:w-[14px] sm:h-[14px]" />
                    <p>{$t('footer.instagram')}</p>
                </a>
                <!-- <a -->
                <!--     class="hover:text-white" -->
                <!--     href="https://www.instagram.com/Germinal.studio/">Terms</a -->
                <!-- > -->
            </div>
        </div>
    </footer>
</div>
