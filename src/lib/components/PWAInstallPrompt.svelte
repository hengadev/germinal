<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from 'svelte-i18n';

    const DISMISSED_KEY = 'pwa-install-dismissed';
    const DISMISSED_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    let deferredPrompt: any = null;
    let visible = $state(false);

    onMount(() => {
        // Don't show if already running as installed PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        // Don't show if dismissed recently
        const dismissed = localStorage.getItem(DISMISSED_KEY);
        if (dismissed && Date.now() - parseInt(dismissed) < DISMISSED_DURATION_MS) return;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            setTimeout(() => { visible = true; }, 2500);
        });

        window.addEventListener('appinstalled', () => {
            visible = false;
            deferredPrompt = null;
        });
    });

    async function install() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') visible = false;
        deferredPrompt = null;
    }

    function dismiss() {
        visible = false;
        localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    }
</script>

{#if visible}
    <div class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-900 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
        <div class="flex items-start gap-3">
            <img src="/pwa-192x192.png" alt="Germinal" class="h-10 w-10 rounded-xl flex-shrink-0" />
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900 dark:text-white">{$t('pwa.installTitle')}</p>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{$t('pwa.installDescription')}</p>
                <div class="mt-3 flex items-center gap-2">
                    <button
                        onclick={install}
                        class="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors"
                    >
                        {$t('pwa.installButton')}
                    </button>
                    <button
                        onclick={dismiss}
                        class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        {$t('pwa.installDismiss')}
                    </button>
                </div>
            </div>
            <button
                onclick={dismiss}
                aria-label={$t('pwa.close')}
                class="text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
            </button>
        </div>
    </div>
{/if}
