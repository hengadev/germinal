<script lang="ts">
    import "../app.css";
    import { setupI18n } from '$lib/i18n';
    import { isLoading, locale, t } from 'svelte-i18n';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import PWAInstallPrompt from '$lib/components/PWAInstallPrompt.svelte';
    import IOSInstallPrompt from '$lib/components/IOSInstallPrompt.svelte';

    let { children } = $props();

    setupI18n();

    // Update HTML lang attribute when locale changes
    $effect(() => {
        if (browser && $locale) {
            document.documentElement.lang = $locale;
        }
    });

    let showBanner = $state(false);
    let bannerMessage = $state('');
    let updateServiceWorker: ((reloadPage?: boolean) => void) | undefined;
    let needRefreshValue = $state(false);

    onMount(async () => {
        const { useRegisterSW } = await import('virtual:pwa-register/svelte');
        const { offlineReady, needRefresh, updateServiceWorker: _update } = useRegisterSW();
        updateServiceWorker = _update;

        offlineReady.subscribe((ready) => {
            if (ready) {
                bannerMessage = $t('pwa.offlineReady');
                showBanner = true;
                setTimeout(() => { showBanner = false; }, 4000);
            }
        });

        needRefresh.subscribe((refresh) => {
            needRefreshValue = refresh;
            if (refresh) {
                bannerMessage = $t('pwa.newVersion');
                showBanner = true;
            }
        });
    });
</script>

{#if $isLoading}
    <div class="flex items-center justify-center min-h-screen">
        <div class="text-lg">Loading...</div>
    </div>
{:else}
    {@render children()}
{/if}

<PWAInstallPrompt />
<IOSInstallPrompt />

{#if showBanner}
    <div class="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
        <span>{bannerMessage}</span>
        {#if needRefreshValue}
            <button
                onclick={() => updateServiceWorker?.(true)}
                class="rounded bg-white px-2 py-0.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
            >
                {$t('pwa.reload')}
            </button>
        {/if}
        <button onclick={() => { showBanner = false; }} aria-label={$t('pwa.close')} class="opacity-60 hover:opacity-100">✕</button>
    </div>
{/if}
